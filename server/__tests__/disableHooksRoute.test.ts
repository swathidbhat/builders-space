import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBuildersServer, type BuildersRuntime } from '../createServer';
import { hookDisableStatusNote } from '../hookDisableNote';
import { defaultHookRuntimeFile } from '../hookRuntimeStore';
import type { ProjectInfo, SpaceData } from '../types';

describe('disable hooks keeps current errors', () => {
  let runtime: BuildersRuntime | undefined;

  afterEach(async () => {
    await runtime?.close();
    vi.unstubAllEnvs();
  });

  it('leaves a persisted error in place and does not claim a status change', async () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-disable-'));
    vi.stubEnv('HOME', home);
    runtime = createBuildersServer({
      token: 'disable-token',
      startWatchers: false,
      publishToken: false,
    });
    const projects = new Map<string, ProjectInfo>([
      [
        '/tmp/checkout',
        {
          id: 'checkout',
          name: 'checkout',
          path: '/tmp/checkout',
          fileCount: 0,
          agents: [
            {
              id: 'claude-stripe',
              source: 'claude-code',
              sessionId: 'stripe',
              status: 'done',
              statusSource: 'inferred',
              currentTask: 'verify the stripe webhook signature',
              sessionMeta: {
                projectPath: '/tmp/checkout',
                cwd: '/tmp/checkout',
                sessionId: 'stripe',
              },
            },
          ],
        },
      ],
    ]);
    runtime.stateManager.updateClaudeProjects(projects);
    runtime.stateManager.applyHookOverlay({
      source: 'claude-code',
      sessionId: 'stripe',
      cwd: '/tmp/checkout',
      status: 'error',
      errorReason: 'TypeError: Cannot read properties of undefined (reading "signature")',
      lastEventAt: Date.now(),
      terminal: true,
      mode: 'realtime',
    });
    expect(runtime.stateManager.getState().projects[0].agents[0].status).toBe('error');

    const port = await runtime.listen(0, ['127.0.0.1']);
    const res = await fetch(`http://127.0.0.1:${port}/api/hooks/disable`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer disable-token',
        Origin: 'http://127.0.0.1:5174',
      },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.statusNote).toBeUndefined();

    const agent = runtime.stateManager.getState().projects[0].agents[0];
    expect(agent.status).toBe('error');
    expect(agent.errorReason).toMatch(/TypeError/);

    const saved = JSON.parse(readFileSync(defaultHookRuntimeFile(home), 'utf8')) as {
      entries: Array<{ status: string; errorReason?: string }>;
    };
    expect(saved.entries).toEqual([
      expect.objectContaining({
        status: 'error',
        errorReason: 'TypeError: Cannot read properties of undefined (reading "signature")',
      }),
    ]);
  });

  it('describes a status change when one happened', () => {
    const before: SpaceData = {
      lastUpdated: 1,
      projects: [
        {
          id: 'checkout',
          name: 'checkout',
          path: '/tmp/checkout',
          fileCount: 0,
          agents: [
            {
              id: 'claude-stripe',
              source: 'claude-code',
              sessionId: 'stripe',
              status: 'error',
              errorReason: 'TypeError: stripe',
            },
          ],
        },
      ],
    };
    const after: SpaceData = {
      lastUpdated: 2,
      projects: [
        {
          ...before.projects[0],
          agents: [{ ...before.projects[0].agents[0], status: 'done', errorReason: undefined }],
        },
      ],
    };
    expect(hookDisableStatusNote(before, before)).toBeUndefined();
    expect(hookDisableStatusNote(before, after)).toBe('1 session status changed.');
  });
});
