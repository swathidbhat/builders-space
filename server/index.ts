import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { exec } from 'child_process';
import { CursorWatcher } from './watchers/cursorWatcher';
import { ClaudeWatcher } from './watchers/claudeWatcher';
import { CodexWatcher } from './watchers/codexWatcher';
import { EventWatcher } from './watchers/eventWatcher';
import { StateManager } from './stateManager';
import { humanizeTexts } from './services/humanizer';
import { getHookStatus, enableHooks, disableHooks } from './services/hookSetup';
import type { ServerToClientEvents, ClientToServerEvents, AgentSource, SessionMeta } from './types';

const PORT = 3002;

const app = express();

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

app.use(express.json());

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
});

const stateManager = new StateManager();

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
  io.emit('space:state', state);
});

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);
  socket.emit('space:state', stateManager.getState());

  socket.on('space:request-state', () => {
    socket.emit('space:state', stateManager.getState());
  });

  socket.on('space:humanize', async (texts, callback) => {
    try {
      const result = await humanizeTexts(texts);
      callback(result);
    } catch (err) {
      console.error('[WS] Humanize error:', err);
      callback({ texts: {}, usedLLM: false });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
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
  const { source, status, sessionMeta } = req.body as {
    source: AgentSource;
    status?: string;
    sessionMeta: SessionMeta;
  };

  if (!sessionMeta?.projectPath) {
    res.json({ ok: false, error: 'Missing projectPath' });
    return;
  }

  const safePath = sessionMeta.projectPath.replace(/'/g, "'\\''");

  let cmd: string;
  let resumed = false;
  switch (source) {
    case 'cursor':
      cmd = `open -a "Cursor" '${safePath}'`;
      break;
    case 'claude-code':
    case 'codex': {
      const canResume = status !== 'working' && sessionMeta.sessionId;
      if (canResume) {
        const safeId = sessionMeta.sessionId!.replace(/[^a-zA-Z0-9_-]/g, '');
        const dir = (sessionMeta.cwd || sessionMeta.projectPath).replace(/'/g, "'\\''");
        const resumeCmd = source === 'claude-code'
          ? `claude --resume '${safeId}'`
          : `codex resume '${safeId}'`;
        cmd = `osascript -e 'tell application "Terminal" to do script "cd '\\''${dir}'\\'' && ${resumeCmd}"'`;
        resumed = true;
      } else {
        cmd = `open -a "Terminal" '${safePath}'`;
      }
      break;
    }
    default:
      res.json({ ok: false, error: `Unknown source: ${source}` });
      return;
  }

  exec(cmd, (err) => {
    if (err) {
      console.error(`[open-session] Failed:`, err.message);
      res.json({ ok: false, error: err.message });
    } else {
      res.json({ ok: true, source, resumed });
    }
  });
});

cursorWatcher.start();
claudeWatcher.start();
codexWatcher.start();
eventWatcher.start();

httpServer.listen(PORT, () => {
  console.log(`\n  Builders Space server running on http://localhost:${PORT}`);
  console.log(`  Socket.IO: ws://localhost:${PORT}\n`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('  ANTHROPIC_API_KEY not set — humanizer will use basic fallback. Add it to .env\n');
  }
});

process.on('SIGINT', () => {
  cursorWatcher.stop();
  claudeWatcher.stop();
  codexWatcher.stop();
  eventWatcher.stop();
  httpServer.close();
  process.exit(0);
});
