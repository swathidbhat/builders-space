import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createBuildersServer, type BuildersRuntime } from '../createServer';
import * as hookSetup from '../services/hookSetup';

describe('createServer edges', () => {
  let runtime: BuildersRuntime | undefined;
  const sockets: Socket[] = [];

  afterEach(async () => {
    for (const socket of sockets) socket.close();
    sockets.length = 0;
    await runtime?.close();
    runtime = undefined;
    vi.unstubAllEnvs();
  });

  it('publishes the token, starts watchers, and covers the odd requests', async () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-edges-'));
    vi.stubEnv('HOME', home);
    runtime = createBuildersServer({
      token: 'edge-token',
      startWatchers: true,
      publishToken: true,
    });
    const port = await runtime.listen(0, ['127.0.0.1']);
    expect(readFileSync(join(home, '.builders-space', 'auth-token'), 'utf8').trim()).toBe(
      'edge-token',
    );

    const headers = { Authorization: 'Bearer edge-token' };
    const status = await fetch(`http://127.0.0.1:${port}/api/hooks/status`, { headers });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ claude: expect.any(String) });

    const preflight = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://127.0.0.1:5174' },
    });
    expect(preflight.status).toBe(204);

    const enabled = await fetch(`http://127.0.0.1:${port}/api/hooks/enable`, {
      method: 'POST',
      headers,
    });
    expect(enabled.status).toBe(200);

    const missing = await fetch(`http://127.0.0.1:${port}/api/open-session`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ ok: false, error: 'Missing agentId' });

    const huge = await fetch(`http://127.0.0.1:${port}/api/open-session`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'x'.repeat(40_000) }),
    });
    expect(huge.status).toBe(413);
    expect(await huge.json()).toEqual({ ok: false, error: 'Payload too large' });

    runtime.stateManager.updateClaudeProjects(
      new Map([
        [
          '/tmp/missing-open',
          {
            id: 'missing',
            name: 'missing',
            path: '/tmp/missing-open',
            fileCount: 0,
            agents: [
              {
                id: 'claude-no-path',
                source: 'claude-code',
                sessionId: 'no-path',
                status: 'done',
                statusSource: 'inferred',
                sessionMeta: { projectPath: '', cwd: '', sessionId: 'no-path' },
              },
            ],
          },
        ],
      ]),
    );
    const blocked = await fetch(`http://127.0.0.1:${port}/api/open-session`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'claude-no-path' }),
    });
    expect(blocked.status).toBe(400);
    expect(await blocked.json()).toEqual({ ok: false, error: 'Missing project path' });

    const socket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['polling'],
      reconnection: false,
      auth: { token: 'edge-token' },
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    const snapshot = await new Promise<unknown>((resolve) => {
      socket.once('space:state', resolve);
      socket.emit('space:request-state');
    });
    expect(snapshot).toMatchObject({ projects: expect.any(Array) });
    const pushed = new Promise<unknown>((resolve) => socket.once('space:state', resolve));
    runtime.stateManager.updateClaudeProjects(new Map());
    expect(await pushed).toMatchObject({ projects: [] });
    const plain = await new Promise<{ usedLLM: boolean }>((resolve) => {
      socket.emit('space:humanize', ['Read:edge.ts'], resolve);
    });
    expect(plain.usedLLM).toBe(false);
    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

  it('skips a host it cannot bind and fails when no loopback binds', async () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-bind-'));
    vi.stubEnv('HOME', home);
    runtime = createBuildersServer({
      token: 'edge-token',
      startWatchers: false,
      publishToken: false,
    });
    const port = await runtime.listen(0, ['127.0.0.1', '203.0.113.1']);
    expect(port).toBeGreaterThan(0);
    expect(runtime.httpServers).toHaveLength(1);

    await runtime.close();
    runtime = createBuildersServer({
      token: 'edge-token',
      startWatchers: false,
      publishToken: false,
    });
    await expect(runtime.listen(0, ['203.0.113.1'])).rejects.toThrow(/Failed to bind/);
  });

  it('returns JSON and no stack when a route throws', async () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-throw-'));
    vi.stubEnv('HOME', home);
    const spy = vi.spyOn(hookSetup, 'enableHooks').mockImplementation(() => {
      throw new Error('secret boom');
    });
    runtime = createBuildersServer({
      token: 'edge-token',
      startWatchers: false,
      publishToken: false,
    });
    try {
      const port = await runtime.listen(0, ['127.0.0.1']);
      const res = await fetch(`http://127.0.0.1:${port}/api/hooks/enable`, {
        method: 'POST',
        headers: { Authorization: 'Bearer edge-token' },
      });
      const text = await res.text();
      expect(res.status).toBe(500);
      expect(text).not.toContain('secret boom');
      expect(JSON.parse(text)).toEqual({ ok: false, error: 'Internal error' });
    } finally {
      spy.mockRestore();
    }
  });
});
