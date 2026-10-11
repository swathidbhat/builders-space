import { mkdtempSync, mkdirSync, existsSync, realpathSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createBuildersServer, type BuildersRuntime } from '../createServer';
import type { ProjectInfo } from '../types';

const TOKEN = 'test-launch-token';

function project(dir: string): Map<string, ProjectInfo> {
  return new Map([[dir, {
    id: 'p',
    name: 'my-app',
    path: dir,
    fileCount: 0,
    agents: [{
      id: 'claude-abc123',
      source: 'claude-code',
      sessionId: 'abc123',
      status: 'waiting',
      statusSource: 'inferred',
      sessionMeta: { projectPath: dir, cwd: dir, sessionId: 'abc123' },
    }],
  }]]);
}

describe('server access control', () => {
  let home: string;
  let runtime: BuildersRuntime;
  let base: string;
  const sockets: Socket[] = [];
  const commands: Array<{ file: string; args: string[] }> = [];

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'bs-home-'));
    vi.stubEnv('HOME', home);
    mkdirSync(join(home, '.claude'), { recursive: true });
    commands.length = 0;
    runtime = createBuildersServer({
      token: TOKEN,
      startWatchers: false,
      publishToken: false,
      runCommand: async (file, args) => {
        commands.push({ file, args });
      },
    });
    const port = await runtime.listen(0, ['127.0.0.1']);
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    for (const socket of sockets) socket.close();
    sockets.length = 0;
    await runtime.close();
    vi.unstubAllEnvs();
  });

  function auth(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${TOKEN}`, ...extra };
  }

  it('binds to loopback and not every interface', () => {
    const address = runtime.httpServers[0].address();
    expect(address).toMatchObject({ address: '127.0.0.1' });
  });

  it('rejects a cross-origin request and does not allow every origin', async () => {
    const res = await fetch(`${base}/api/health`, {
      headers: auth({ Origin: 'https://evil.example' }),
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    const body = await res.json();
    expect(body.error).toBe('Origin not allowed');
  });

  it('rejects an unauthenticated request to a mutating endpoint', async () => {
    const res = await fetch(`${base}/api/hooks/enable`, {
      method: 'POST',
      headers: { Origin: 'http://127.0.0.1:5174' },
    });
    expect(res.status).toBe(401);
    expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(false);
  });

  it('rejects an unauthenticated read of project state', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(401);
  });

  it('allows the dashboard origin and echoes that origin only', async () => {
    const origin = 'http://127.0.0.1:5174';
    const res = await fetch(`${base}/api/health`, { headers: auth({ Origin: origin }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
  });

  it('rejects a cross-origin preflight', async () => {
    const res = await fetch(`${base}/api/hooks/enable`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not run a command built from a caller-supplied path', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'bs-proj-')));
    runtime.stateManager.updateClaudeProjects(project(dir));

    const res = await fetch(`${base}/api/open-session`, {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json', Origin: 'http://localhost:5174' }),
      body: JSON.stringify({
        agentId: 'claude-abc123',
        source: 'claude-code',
        sessionMeta: {
          projectPath: `/tmp"; do shell script "id"`,
          cwd: `/tmp" & (do shell script "id") & "`,
        },
      }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(commands).toHaveLength(1);
    expect(commands[0].file).toBe('osascript');
    expect(commands[0].args[1]).not.toContain('do shell script');
    expect(commands[0].args[1]).not.toContain(dir);
    expect(commands[0].args).toContain(dir);
    expect(commands[0].args.at(-1)).toBe('abc123');
  });

  it('rejects an unknown agent instead of launching a supplied command', async () => {
    const res = await fetch(`${base}/api/open-session`, {
      method: 'POST',
      headers: auth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ agentId: 'claude-nope', cwd: '$(id)' }),
    });
    expect(res.status).toBe(404);
    expect(commands).toHaveLength(0);
  });

  it('rejects a socket connection without the launch token', async () => {
    const socket = ioClient(base, {
      transports: ['polling'],
      reconnection: false,
      timeout: 2000,
    });
    sockets.push(socket);
    const message = await new Promise<string>((resolve) => {
      socket.on('connect', () => resolve('connected'));
      socket.on('connect_error', (err) => resolve(err.message));
    });
    expect(message).not.toBe('connected');
  });

  it('rejects a socket connection from a non-loopback origin', async () => {
    const socket = ioClient(base, {
      transports: ['polling'],
      reconnection: false,
      timeout: 2000,
      auth: { token: TOKEN },
      extraHeaders: { Origin: 'https://evil.example' },
    });
    sockets.push(socket);
    const message = await new Promise<string>((resolve) => {
      socket.on('connect', () => resolve('connected'));
      socket.on('connect_error', (err) => resolve(err.message));
    });
    expect(message).not.toBe('connected');
  });

  it('accepts a socket with the launch token and rejects an oversized humanize payload', async () => {
    const socket = ioClient(base, {
      transports: ['polling'],
      reconnection: false,
      auth: { token: TOKEN },
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    const result = await new Promise<{ error?: string; usedLLM: boolean }>((resolve) => {
      socket.emit('space:humanize', ['x'.repeat(501)], resolve);
    });
    expect(result.usedLLM).toBe(false);
    expect(result.error).toMatch(/exceeds 500/);
  });

  it('also accepts connections on IPv6 loopback', async () => {
    await runtime.close();
    runtime = createBuildersServer({
      token: TOKEN,
      startWatchers: false,
      publishToken: false,
    });
    const port = await runtime.listen(0, ['127.0.0.1', '::1']);
    const res = await fetch(`http://[::1]:${port}/api/health`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
    const v4 = runtime.httpServers.find((server) => {
      const address = server.address();
      return address && typeof address === 'object' && address.address === '127.0.0.1';
    });
    const v6 = runtime.httpServers.find((server) => {
      const address = server.address();
      return address && typeof address === 'object' && address.address === '::1';
    });
    expect(v4).toBeTruthy();
    expect(v6).toBeTruthy();
  });
});
