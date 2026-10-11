import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventWatcher } from '../watchers/eventWatcher';
import { StateManager } from '../stateManager';
import type { ProjectInfo } from '../types';

const watchers: EventWatcher[] = [];

afterEach(() => {
  for (const watcher of watchers) watcher.stop();
  watchers.length = 0;
  vi.restoreAllMocks();
});

function seed(sm: StateManager): void {
  const projects = new Map<string, ProjectInfo>();
  projects.set('/proj', {
    id: 'p',
    name: 'proj',
    path: '/proj',
    fileCount: 0,
    agents: [{
      id: 'claude-sess1',
      source: 'claude-code',
      sessionId: 'sess1',
      status: 'waiting',
      statusSource: 'inferred',
      lastActivityMs: Date.now() - 60_000,
    }],
  });
  sm.updateClaudeProjects(projects);
}

describe('stale hook events', () => {
  it('does not apply a leftover event file as live status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bs-events-'));
    const file = join(dir, 'status-old.json');
    writeFileSync(file, JSON.stringify({
      hook_event_name: 'PostToolUse',
      session_id: 'sess1',
      cwd: '/proj',
      tool_name: 'Read',
      tool_input: { file_path: 'a.ts' },
    }));
    const old = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(file, old, old);

    const sm = new StateManager();
    seed(sm);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const watcher = new EventWatcher(sm, dir);
    watchers.push(watcher);
    watcher.start();

    const agent = sm.getState().projects[0].agents[0];
    expect(agent.statusSource).toBe('inferred');
    expect(agent.status).toBe('waiting');
    expect(warn.mock.calls.some((call) => String(call[0]).includes('Dropping stale event'))).toBe(true);
  });

  it('stamps a fresh event with the file time instead of processing time', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bs-events-'));
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'status-fresh.json');
    writeFileSync(file, JSON.stringify({
      hook_event_name: 'Stop',
      session_id: 'sess1',
      cwd: '/proj',
      status: 'error',
      error_message: 'disk full',
    }));
    const stamped = Date.now() - 10_000;
    const when = new Date(stamped);
    utimesSync(file, when, when);

    const sm = new StateManager();
    seed(sm);
    const watcher = new EventWatcher(sm, dir);
    watchers.push(watcher);
    watcher.start();

    const agent = sm.getState().projects[0].agents[0];
    expect(agent.statusSource).toBe('realtime');
    expect(agent.status).toBe('error');
    expect(agent.errorReason).toBe('disk full');
    expect(Math.abs((agent.lastActivityMs ?? 0) - stamped)).toBeLessThan(1500);
    expect(Date.now() - (agent.lastActivityMs ?? 0)).toBeGreaterThan(5_000);
  });
});
