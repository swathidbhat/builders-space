import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ClaudeWatcher } from '../watchers/claudeWatcher';
import { CodexWatcher } from '../watchers/codexWatcher';
import { CursorWatcher } from '../watchers/cursorWatcher';
import { StateManager } from '../stateManager';
import type { AgentStatus, ProjectInfo } from '../types';

const watchers: Array<{ stop: () => void }> = [];

afterEach(() => {
  for (const watcher of watchers) watcher.stop();
  watchers.length = 0;
});

function ageStatus(
  projects: Map<string, ProjectInfo> | undefined,
  sessionId: string,
): AgentStatus | undefined {
  if (!projects) return undefined;
  for (const project of projects.values()) {
    const agent = project.agents.find((entry) => entry.sessionId === sessionId);
    if (agent) return agent.status;
  }
  return undefined;
}

describe('watcher status from file age', () => {
  it('classifies Claude sessions as working, waiting, done, or dropped', async () => {
    const base = mkdtempSync(join(tmpdir(), 'bs-claude-age-'));
    const dir = join(base, '-tmp-lumen-lab');
    mkdirSync(dir);
    const now = Date.now();
    const cases = [
      ['working', now, 'user'],
      ['waiting', now - 30 * 60 * 1000, 'assistant'],
      ['quiet', now - 30 * 60 * 1000, 'user'],
      ['done', now - 2 * 60 * 60 * 1000, 'assistant'],
      ['stale', now - 49 * 60 * 60 * 1000, 'user'],
    ] as const;
    for (const [id, at, role] of cases) {
      const lines = [
        JSON.stringify({
          type: 'user',
          sessionId: id,
          cwd: '/tmp/lumen-lab',
          timestamp: new Date(at - 1000).toISOString(),
          message: { content: 'start' },
        }),
      ];
      if (role === 'assistant') {
        lines.push(
          JSON.stringify({
            type: 'assistant',
            sessionId: id,
            cwd: '/tmp/lumen-lab',
            timestamp: new Date(at).toISOString(),
            message: { content: [{ type: 'text', text: 'Should I keep going?' }] },
          }),
        );
      }
      writeFileSync(join(dir, `${id}.jsonl`), lines.join('\n') + '\n');
    }

    let seen: Map<string, ProjectInfo> | undefined;
    const watcher = new ClaudeWatcher(
      (projects) => {
        seen = projects;
      },
      { base, fallbackScanMs: 60_000 },
    );
    watchers.push(watcher);
    watcher.start();
    await watcher.whenWatching();

    expect(ageStatus(seen, 'working')).toBe('working');
    expect(ageStatus(seen, 'waiting')).toBe('waiting');
    expect(ageStatus(seen, 'quiet')).toBe('done');
    expect(ageStatus(seen, 'done')).toBe('done');
    expect(ageStatus(seen, 'stale')).toBeUndefined();
  });

  it('classifies Cursor transcripts from mtime, including txt exports', async () => {
    const base = mkdtempSync(join(tmpdir(), 'bs-cursor-age-'));
    const transcripts = join(base, '-tmp-lumen-lab', 'agent-transcripts');
    const recentDir = join(transcripts, 'recent');
    mkdirSync(recentDir, { recursive: true });
    const line =
      JSON.stringify({
        role: 'user',
        cwd: '/tmp/lumen-lab',
        message: { content: [{ type: 'text', text: 'keep going' }] },
      }) + '\n';
    const recent = join(recentDir, 'recent.jsonl');
    writeFileSync(recent, line);
    const waiting = join(transcripts, 'waiting.txt');
    writeFileSync(
      waiting,
      '<user_query>need input</user_query>\nShould I also backfill existing orders?\n',
    );
    const old = new Date(Date.now() - 30 * 60 * 1000);
    utimesSync(waiting, old, old);
    const quiet = join(transcripts, 'quiet.txt');
    writeFileSync(quiet, '<user_query>still going</user_query>\n');
    utimesSync(quiet, old, old);
    const doneDir = join(transcripts, 'done');
    mkdirSync(doneDir);
    const done = join(doneDir, 'done.jsonl');
    writeFileSync(done, line);
    const doneAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    utimesSync(done, doneAt, doneAt);

    let seen: Map<string, ProjectInfo> | undefined;
    const watcher = new CursorWatcher(
      (projects) => {
        seen = projects;
      },
      { base, fallbackScanMs: 60_000 },
    );
    watchers.push(watcher);
    watcher.start();
    await watcher.whenWatching();

    expect(ageStatus(seen, 'recent')).toBe('working');
    expect(ageStatus(seen, 'waiting')).toBe('waiting');
    expect(ageStatus(seen, 'quiet')).toBe('done');
    expect(ageStatus(seen, 'done')).toBe('done');
  });

  it('uses the Codex session index for titles and drops old rollouts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bs-codex-age-'));
    const sessionsDir = join(root, 'sessions', '2026', '10', '11');
    mkdirSync(sessionsDir, { recursive: true });
    const indexFile = join(root, 'session_index.jsonl');
    const now = new Date().toISOString();
    writeFileSync(
      indexFile,
      ['not-json', JSON.stringify({ id: 'live', thread_name: 'Lumen thread' })].join('\n') + '\n',
    );
    const live = join(sessionsDir, 'rollout-2026-10-11T01-00-00-live.jsonl');
    writeFileSync(
      live,
      JSON.stringify({
        timestamp: now,
        type: 'session_meta',
        payload: { id: 'live', cwd: '/tmp/lumen-lab' },
      }) + '\n',
    );
    const stale = join(sessionsDir, 'rollout-old.jsonl');
    const old = new Date(Date.now() - 50 * 60 * 60 * 1000);
    writeFileSync(
      stale,
      JSON.stringify({
        timestamp: old.toISOString(),
        type: 'session_meta',
        payload: { id: 'stale', cwd: '/tmp/lumen-lab' },
      }) + '\n',
    );
    utimesSync(stale, old, old);

    let seen: Map<string, ProjectInfo> | undefined;
    const watcher = new CodexWatcher(
      (projects) => {
        seen = projects;
      },
      { sessionsDir: join(root, 'sessions'), indexFile, fallbackScanMs: 60_000 },
    );
    watchers.push(watcher);
    watcher.start();
    await watcher.whenWatching();

    const project = [...(seen?.values() ?? [])][0];
    expect(project.agents.map((agent) => agent.sessionId)).toEqual(['live']);
    expect(project.agents[0].title).toBe('Lumen thread');
    expect(project.agents[0].status).toBe('working');
  });
});

describe('quiet agents are not all awaiting you', () => {
  it('flags a finished assistant turn and leaves several quiet sessions alone', async () => {
    const cursorBase = mkdtempSync(join(tmpdir(), 'bs-cursor-quiet-'));
    const claudeBase = mkdtempSync(join(tmpdir(), 'bs-claude-quiet-'));
    const quietAt = new Date(Date.now() - 5 * 60 * 1000);
    const transcripts = join(cursorBase, '-tmp-quiet-lab', 'agent-transcripts');
    mkdirSync(transcripts, { recursive: true });

    const userLine =
      JSON.stringify({
        role: 'user',
        message: { content: [{ type: 'text', text: 'keep going' }] },
      }) + '\n';
    const assistantLine =
      JSON.stringify({
        role: 'assistant',
        message: { content: [{ type: 'text', text: 'Should I ship this?' }] },
      }) + '\n';

    for (const id of ['alpha', 'beta', 'gamma']) {
      const dir = join(transcripts, id);
      mkdirSync(dir);
      const file = join(dir, `${id}.jsonl`);
      writeFileSync(file, userLine);
      utimesSync(file, quietAt, quietAt);
    }
    const finishedDir = join(transcripts, 'finished');
    mkdirSync(finishedDir);
    const finished = join(finishedDir, 'finished.jsonl');
    writeFileSync(finished, userLine + assistantLine);
    utimesSync(finished, quietAt, quietAt);

    const claudeDir = join(claudeBase, '-tmp-quiet-lab');
    mkdirSync(claudeDir);
    for (const id of ['c1', 'c2']) {
      writeFileSync(
        join(claudeDir, `${id}.jsonl`),
        JSON.stringify({
          type: 'user',
          sessionId: id,
          cwd: '/tmp/quiet-lab',
          timestamp: quietAt.toISOString(),
          message: { content: 'still thinking' },
        }) + '\n',
      );
    }

    let cursorProjects: Map<string, ProjectInfo> | undefined;
    let claudeProjects: Map<string, ProjectInfo> | undefined;
    const cursorWatcher = new CursorWatcher(
      (projects) => {
        cursorProjects = projects;
      },
      { base: cursorBase, fallbackScanMs: 60_000 },
    );
    const claudeWatcher = new ClaudeWatcher(
      (projects) => {
        claudeProjects = projects;
      },
      { base: claudeBase, fallbackScanMs: 60_000 },
    );
    watchers.push(cursorWatcher, claudeWatcher);
    cursorWatcher.start();
    claudeWatcher.start();
    await cursorWatcher.whenWatching();
    await claudeWatcher.whenWatching();

    const sm = new StateManager();
    sm.updateCursorProjects(cursorProjects ?? new Map());
    sm.updateClaudeProjects(claudeProjects ?? new Map());
    const agents = sm.getState().projects.flatMap((project) => project.agents);
    const waiting = agents.filter((agent) => agent.status === 'waiting');
    expect(agents.length).toBeGreaterThan(waiting.length);
    expect(waiting.map((agent) => agent.sessionId)).toEqual(['finished']);
    for (const agent of agents) {
      expect(agent.quietForMs ?? 0).toBeGreaterThan(4 * 60 * 1000);
    }
  });
});
