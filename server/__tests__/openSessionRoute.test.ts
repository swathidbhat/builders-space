import { mkdtempSync, mkdirSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBuildersServer, type BuildersRuntime } from '../createServer';
import type { ProjectInfo } from '../types';

describe('open-session failures', () => {
  let runtime: BuildersRuntime | undefined;

  afterEach(async () => {
    await runtime?.close();
    vi.unstubAllEnvs();
  });

  it('returns a macOS message instead of a raw spawn error', async () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-open-route-'));
    vi.stubEnv('HOME', home);
    mkdirSync(join(home, '.claude'), { recursive: true });
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'bs-proj-')));
    runtime = createBuildersServer({
      token: 'route-token',
      startWatchers: false,
      publishToken: false,
      runCommand: async () => {
        throw Object.assign(new Error('spawn osascript ENOENT'), { code: 'ENOENT' });
      },
    });
    const projects = new Map<string, ProjectInfo>([
      [
        dir,
        {
          id: 'p',
          name: 'my-app',
          path: dir,
          fileCount: 0,
          agents: [
            {
              id: 'claude-abc123',
              source: 'claude-code',
              sessionId: 'abc123',
              status: 'waiting',
              statusSource: 'inferred',
              sessionMeta: { projectPath: dir, cwd: dir, sessionId: 'abc123' },
            },
          ],
        },
      ],
    ]);
    runtime.stateManager.updateClaudeProjects(projects);
    const port = await runtime.listen(0, ['127.0.0.1']);
    const res = await fetch(`http://127.0.0.1:${port}/api/open-session`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer route-token',
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:5174',
      },
      body: JSON.stringify({ agentId: 'claude-abc123' }),
    });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Opening sessions is only supported on macOS');
    expect(JSON.stringify(body)).not.toMatch(/spawn|ENOENT/);
  });
});
