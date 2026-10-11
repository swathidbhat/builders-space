import express from 'express';
import { createServer as createHttpServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { CursorWatcher } from './watchers/cursorWatcher';
import { ClaudeWatcher } from './watchers/claudeWatcher';
import { CodexWatcher } from './watchers/codexWatcher';
import { EventWatcher } from './watchers/eventWatcher';
import { StateManager } from './stateManager';
import { humanizeTexts, HumanizeInputError } from './services/humanizer';
import { getHookStatus, enableHooks, disableHooks, ensureAppDirs } from './services/hookSetup';
import { buildOpenSessionCommand, runCommand, type CommandSpec } from './openSession';
import {
  bearerToken,
  createLaunchToken,
  isLoopbackOrigin,
  publishLaunchToken,
  tokensMatch,
} from './security';
import { logCaught } from './log';
import type { ServerToClientEvents, ClientToServerEvents } from './types';
import { SERVER_PORT } from '../shared/config';

export const PORT = SERVER_PORT;

export type CommandRunner = (file: string, args: string[]) => Promise<void>;

export interface CreateServerOptions {
  token?: string;
  startWatchers?: boolean;
  publishToken?: boolean;
  runCommand?: CommandRunner;
}

export interface BuildersRuntime {
  token: string;
  stateManager: StateManager;
  httpServers: HttpServer[];
  listen: (port?: number, hosts?: string[]) => Promise<number>;
  close: () => Promise<void>;
}

export function createBuildersServer(options: CreateServerOptions = {}): BuildersRuntime {
  const token = options.token ?? createLaunchToken();
  const execute = options.runCommand ?? runCommand;
  const stateManager = new StateManager();

  if (options.publishToken) {
    ensureAppDirs();
    publishLaunchToken(token);
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.use((req, res, next) => {
    const originHeader = req.headers.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

    if (origin && !isLoopbackOrigin(origin)) {
      res.status(403).json({ ok: false, error: 'Origin not allowed' });
      return;
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    const presented = bearerToken(
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
    );
    if (!tokensMatch(presented, token)) {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return;
    }

    next();
  });

  const socketServers: Server<ClientToServerEvents, ServerToClientEvents>[] = [];

  const socketOptions = {
    cors: {
      origin: (origin: string | undefined, callback: (err: Error | null, ok?: boolean) => void) => {
        if (!origin || isLoopbackOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Origin not allowed'), false);
        }
      },
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    },
    allowRequest: (
      req: { headers: { origin?: string } },
      callback: (err: string | null, ok: boolean) => void,
    ) => {
      const origin = req.headers.origin;
      if (origin && !isLoopbackOrigin(origin)) {
        callback('Origin not allowed', false);
        return;
      }
      callback(null, true);
    },
  };

  function attachRealtime(httpServer: HttpServer): void {
    const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, socketOptions);
    io.use((socket, next) => {
      const presented = socket.handshake.auth?.token;
      if (typeof presented !== 'string' || !tokensMatch(presented, token)) {
        next(new Error('Unauthorized'));
        return;
      }
      next();
    });

    io.on('connection', (socket) => {
      console.log(`[WS] Client connected: ${socket.id}`);
      socket.emit('space:state', stateManager.getState());

      socket.on('space:request-state', () => {
        socket.emit('space:state', stateManager.getState());
      });

      socket.on('space:humanize', async (texts, callback) => {
        if (typeof callback !== 'function') return;
        try {
          const result = await humanizeTexts(texts);
          callback(result);
        } catch (err) {
          if (err instanceof HumanizeInputError) {
            console.warn(`[WS] Humanize rejected: ${err.message}`);
            callback({ texts: {}, usedLLM: false, error: err.message });
            return;
          }
          logCaught('WS', err, 'humanize');
          callback({ texts: {}, usedLLM: false });
        }
      });

      socket.on('disconnect', () => {
        console.log(`[WS] Client disconnected: ${socket.id}`);
      });
    });

    socketServers.push(io);
  }

  const cursorWatcher = new CursorWatcher((projects) => {
    stateManager.updateCursorProjects(projects);
  });
  const claudeWatcher = new ClaudeWatcher((projects) => {
    stateManager.updateClaudeProjects(projects);
  });
  const codexWatcher = new CodexWatcher((projects) => {
    stateManager.updateCodexProjects(projects);
  });
  const eventWatcher = new EventWatcher(stateManager);

  stateManager.on('change', (state) => {
    for (const io of socketServers) io.emit('space:state', state);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', state: stateManager.getState() });
  });

  app.get('/api/hooks/status', (_req, res) => {
    res.json(getHookStatus());
  });

  app.post('/api/hooks/enable', (_req, res) => {
    res.json(enableHooks());
  });

  app.post('/api/hooks/disable', (_req, res) => {
    const result = disableHooks();
    stateManager.clearHookRuntimeForSources(['claude-code', 'cursor', 'codex']);
    res.json(result);
  });

  app.post('/api/open-session', (req, res) => {
    const agentId = req.body?.agentId;
    if (typeof agentId !== 'string' || agentId.length === 0 || agentId.length > 500) {
      res.status(400).json({ ok: false, error: 'Missing agentId' });
      return;
    }

    const agent = stateManager.findAgentById(agentId);
    if (!agent) {
      res.status(404).json({ ok: false, error: 'Unknown agent' });
      return;
    }

    const built = buildOpenSessionCommand(agent);
    if ('error' in built) {
      res.status(400).json({ ok: false, error: built.error });
      return;
    }

    const spec: CommandSpec = built.spec;
    execute(spec.file, spec.args).then(
      () => res.json({ ok: true, source: agent.source, resumed: built.resumed }),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[open-session] Failed:', message);
        res.json({ ok: false, error: message });
      },
    );
  });

  const httpServers: HttpServer[] = [];
  let watchersStarted = false;

  function startWatchers(): void {
    if (watchersStarted || !options.startWatchers) return;
    watchersStarted = true;
    ensureAppDirs();
    cursorWatcher.start();
    claudeWatcher.start();
    codexWatcher.start();
    eventWatcher.start();
  }

  async function listen(port = PORT, hosts: string[] = ['127.0.0.1']): Promise<number> {
    startWatchers();
    let assigned = port;

    for (const host of hosts) {
      const httpServer = createHttpServer(app);
      attachRealtime(httpServer);
      try {
        assigned = await listenOn(httpServer, assigned, host);
        httpServers.push(httpServer);
      } catch (err) {
        const io = socketServers.pop();
        io?.close();
        httpServer.close();
        if (host === '127.0.0.1') throw err;
        logCaught('server', err, `not listening on ${host}`);
      }
    }

    if (httpServers.length === 0) {
      throw new Error('Failed to bind a loopback address');
    }
    return assigned;
  }

  async function close(): Promise<void> {
    cursorWatcher.stop();
    claudeWatcher.stop();
    codexWatcher.stop();
    eventWatcher.stop();
    await Promise.all(
      socketServers.map((io) => new Promise<void>((resolve) => io.close(() => resolve()))),
    );
    await Promise.all(
      httpServers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
  }

  return { token, stateManager, httpServers, listen, close };
}

function listenOn(server: HttpServer, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      const boundPort = address && typeof address === 'object' ? address.port : port;
      resolve(boundPort);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}
