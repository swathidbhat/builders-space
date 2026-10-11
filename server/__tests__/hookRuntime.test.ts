import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOOK_ACTIVE_TTL_MS, HOOK_TERMINAL_TTL_MS } from '../../shared/config';
import { defaultHookRuntimeFile, loadHookRuntime, saveHookRuntime } from '../hookRuntimeStore';
import { StateManager } from '../stateManager';
import { EventWatcher } from '../watchers/eventWatcher';
import type { ProjectInfo } from '../types';

const watchers: EventWatcher[] = [];

afterEach(() => {
  for (const watcher of watchers) watcher.stop();
  watchers.length = 0;
  vi.restoreAllMocks();
});

function seed(sm: StateManager, status: ProjectInfo['agents'][number]['status'] = 'done'): void {
  const projects = new Map<string, ProjectInfo>();
  projects.set('/tmp/checkout-service', {
    id: 'p',
    name: 'checkout-service',
    path: '/tmp/checkout-service',
    fileCount: 0,
    agents: [
      {
        id: 'claude-sess1',
        source: 'claude-code',
        sessionId: 'sess1',
        status,
        statusSource: 'inferred',
        lastActivityMs: Date.now() - 60_000,
      },
    ],
  });
  sm.updateClaudeProjects(projects);
}

describe('hook runtime on disk', () => {
  it('reloads an error after restart and drops it after the terminal TTL', () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-runtime-'));
    const runtimeFile = join(home, 'hook-runtime.json');
    const events = join(home, 'events');
    mkdirSync(events, { recursive: true });
    writeFileSync(
      join(events, 'status-err.json'),
      JSON.stringify({
        hook_event_name: 'Stop',
        session_id: 'sess1',
        cwd: '/tmp/checkout-service',
        status: 'error',
        error_message: 'TypeError verifyStripeSignature',
      }),
    );

    const first = new StateManager({ runtimeFile });
    seed(first, 'done');
    const watcher = new EventWatcher(first, events);
    watchers.push(watcher);
    watcher.start();

    expect(first.getState().projects[0].agents[0].status).toBe('error');
    expect(first.getState().projects[0].agents[0].errorReason).toBe(
      'TypeError verifyStripeSignature',
    );
    expect(statSync(runtimeFile).mode & 0o777).toBe(0o600);
    expect(statSync(home).mode & 0o777).toBe(0o700);

    const second = new StateManager({ runtimeFile });
    seed(second, 'done');
    expect(second.getState().projects[0].agents[0].status).toBe('error');
    expect(second.getState().projects[0].agents[0].statusSource).toBe('realtime');

    const stored = JSON.parse(readFileSync(runtimeFile, 'utf8')) as {
      entries: Array<{ lastEventAt: number }>;
    };
    stored.entries[0].lastEventAt = Date.now() - HOOK_TERMINAL_TTL_MS - 1_000;
    writeFileSync(runtimeFile, JSON.stringify({ version: 1, entries: stored.entries }));

    const third = new StateManager({ runtimeFile });
    seed(third, 'done');
    expect(third.getState().projects[0].agents[0].status).toBe('done');
    expect(third.getState().projects[0].agents[0].statusSource).toBe('inferred');
    const rewritten = loadHookRuntime(runtimeFile);
    expect(rewritten.entries).toEqual([]);
  });

  it('keeps a stop overlay until the active TTL and then expires it', () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-runtime-stop-'));
    const runtimeFile = join(home, 'hook-runtime.json');
    const now = Date.now();
    saveHookRuntime(runtimeFile, [
      {
        source: 'claude-code',
        sessionId: 'sess1',
        cwd: '/tmp/checkout-service',
        status: 'waiting',
        lastEventAt: now - 1_000,
        terminal: false,
        mode: 'realtime',
      },
    ]);

    const live = new StateManager({ runtimeFile });
    seed(live, 'working');
    expect(live.getState().projects[0].agents[0].status).toBe('waiting');

    saveHookRuntime(runtimeFile, [
      {
        source: 'claude-code',
        sessionId: 'sess1',
        cwd: '/tmp/checkout-service',
        status: 'waiting',
        lastEventAt: now - HOOK_ACTIVE_TTL_MS - 1_000,
        terminal: false,
        mode: 'realtime',
      },
    ]);
    const expired = new StateManager({ runtimeFile });
    seed(expired, 'working');
    expect(expired.getState().projects[0].agents[0].status).toBe('working');
    expect(expired.getState().projects[0].agents[0].statusSource).toBe('inferred');
  });

  it('ignores a missing file, a broken file, and the wrong shape', () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-runtime-bad-'));
    expect(loadHookRuntime(join(home, 'missing.json')).entries).toEqual([]);

    const broken = join(home, 'broken.json');
    writeFileSync(broken, '{');
    expect(loadHookRuntime(broken)).toEqual({ entries: [], dropped: true });

    const wrong = join(home, 'wrong.json');
    writeFileSync(wrong, JSON.stringify({ version: 1, entries: [{ status: 'error' }] }));
    expect(loadHookRuntime(wrong).dropped).toBe(true);

    const unreadable = join(home, 'dir.json');
    mkdirSync(unreadable);
    expect(loadHookRuntime(unreadable).entries).toEqual([]);

    expect(defaultHookRuntimeFile(home)).toBe(join(home, '.builders-space', 'hook-runtime.json'));
    chmodSync(home, 0o700);
  });
});
