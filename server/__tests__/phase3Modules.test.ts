import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import { describe, expect, it } from 'vitest';
import { boundHumanizeInput } from '../../shared/humanize';
import {
  CLIENT_TRANSLATION_CACHE_MAX,
  HUMANIZE_MAX_ITEMS,
  HUMANIZE_MAX_TEXT_CHARS,
  ONE_HOUR_MS,
  RECENT_ACTIVITY_MS,
  STALE_PROCESS_MS,
} from '../../shared/config';
import {
  compareAgentStatus,
  derivePlanetState,
  dominantStatus,
  inferSessionStatus,
  projectStatusColor,
} from '../../shared/status';
import { readFirstLine, readIncremental } from '../io/incrementalRead';
import { cwdFromLsof, pidsMatching, runningCwds } from '../process/runningCwds';
import { parseClaudeLine, parseCodexLine, parseHookEvent, hookString } from '../schema/sessionLog';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'bs-phase3-'));
}

describe('shared status and humanize bounds', () => {
  it('ranks statuses and derives planet state from the top rank', () => {
    expect(compareAgentStatus('error', 'waiting')).toBeLessThan(0);
    expect(dominantStatus([])).toBe('empty');
    expect(dominantStatus([{ status: 'done' }, { status: 'working' }])).toBe('working');
    expect(projectStatusColor([{ status: 'error' }])).toBe('#ff4444');
    expect(projectStatusColor([])).toBe('#444');
    expect(
      derivePlanetState({
        agents: [{ status: 'waiting' }, { status: 'working' }],
      }),
    ).toBe('waiting');
    expect(derivePlanetState({ agents: [] })).toBe('idle');
  });

  it('infers working, waiting, and done from age and a live process', () => {
    const now = 1_000_000;
    expect(inferSessionStatus({ lastActivityMs: now - 1_000, now })).toBe('working');
    expect(inferSessionStatus({ lastActivityMs: now - RECENT_ACTIVITY_MS, now })).toBe('waiting');
    expect(inferSessionStatus({ lastActivityMs: now - ONE_HOUR_MS, now })).toBe('done');
    expect(
      inferSessionStatus({
        lastActivityMs: now - STALE_PROCESS_MS,
        now,
        processRunning: true,
      }),
    ).toBe('working');
    expect(
      inferSessionStatus({
        lastActivityMs: now - STALE_PROCESS_MS - 1,
        now,
        processRunning: true,
      }),
    ).toBe('waiting');
  });

  it('caps translation requests', () => {
    const texts = Array.from({ length: HUMANIZE_MAX_ITEMS + 5 }, (_, i) => `Read:${i}.ts`);
    texts.push('x'.repeat(HUMANIZE_MAX_TEXT_CHARS + 1));
    texts.push('');
    const bounded = boundHumanizeInput(texts);
    expect(bounded).toHaveLength(HUMANIZE_MAX_ITEMS);
    expect(bounded[0]).toBe('Read:0.ts');
    expect(CLIENT_TRANSLATION_CACHE_MAX).toBeGreaterThan(0);
  });
});

describe('incremental session reads', () => {
  it('returns new lines on append, nothing when unchanged, and rereads a rewrite', () => {
    const dir = tempDir();
    const file = join(dir, 'session.jsonl');
    writeFileSync(file, 'one\n');

    const first = readIncremental(file);
    expect(first?.mode).toBe('reset');
    if (first?.mode === 'unchanged') return;
    expect(first?.lines).toEqual(['one']);

    const same = readIncremental(file, first?.cursor);
    expect(same?.mode).toBe('unchanged');

    writeFileSync(file, 'two\n', { flag: 'a' });
    const appended = readIncremental(file, first?.cursor);
    expect(appended?.mode).toBe('append');
    if (appended?.mode === 'unchanged') return;
    expect(appended?.lines).toEqual(['two']);

    writeFileSync(file, 'replaced\n');
    const replaced = readIncremental(file, appended?.cursor);
    expect(replaced?.mode).toBe('reset');
    if (replaced?.mode === 'unchanged') return;
    expect(replaced?.lines).toEqual(['replaced']);
  });

  it('keeps a partial line until the newline arrives', () => {
    const dir = tempDir();
    const file = join(dir, 'partial.jsonl');
    writeFileSync(file, '{"a":');
    const first = readIncremental(file);
    expect(first?.mode).toBe('reset');
    if (!first || first.mode === 'unchanged') return;
    expect(first.lines).toEqual([]);
    expect(first.cursor.remainder).toBe('{"a":');

    writeFileSync(file, '1}\n', { flag: 'a' });
    const next = readIncremental(file, first.cursor);
    expect(next?.mode).toBe('append');
    if (!next || next.mode === 'unchanged') return;
    expect(next.lines).toEqual(['{"a":1}']);
  });

  it('reads only the first line of a large rollout', () => {
    const dir = tempDir();
    const file = join(dir, 'rollout.jsonl');
    const header = JSON.stringify({ type: 'session_meta', payload: { id: 's', cwd: '/tmp/app' } });
    writeFileSync(file, `${header}\n${'x'.repeat(2_000_000)}\n`);
    const started = performance.now();
    expect(readFirstLine(file)).toBe(header);
    expect(performance.now() - started).toBeLessThan(200);
    expect(readFirstLine(join(dir, 'missing'))).toBeNull();
  });
});

describe('session log schemas', () => {
  it('accepts log lines and hook events and rejects the wrong shape', () => {
    expect(
      parseClaudeLine({ sessionId: 's', type: 'user', message: { content: 'hi' } })?.sessionId,
    ).toBe('s');
    expect(parseClaudeLine({ type: 1 })).toBeNull();
    expect(parseClaudeLine(null)).toBeNull();

    const codex = parseCodexLine({
      type: 'session_meta',
      payload: { id: 'c', cwd: '/tmp' },
    });
    expect(codex?.type).toBe('session_meta');
    expect(parseCodexLine('nope')).toBeNull();

    const hook = parseHookEvent({
      session_id: 'abc',
      hook_event_name: 'Stop',
      tool_input: { a: 1 },
    });
    expect(hook && hookString(hook, 'session_id')).toBe('abc');
    expect(parseHookEvent(['not', 'an', 'event'])).toBeNull();
    expect(parseHookEvent(null)).toBeNull();
  });
});

describe('process scan parsing', () => {
  it('picks pids and cwds out of command output', () => {
    const ps = ['USER PID', 'ada 42 claude --resume', 'ada 7 grep claude', 'ada xx claude'].join(
      '\n',
    );
    expect(pidsMatching(ps, 'claude')).toEqual(['42']);
    expect(cwdFromLsof('fcwd\nn/tmp/lumen-lab/\np1')).toBe('/tmp/lumen-lab');
    expect(cwdFromLsof('p1')).toBeNull();
  });

  it('finds the cwd of a live process without blocking the caller', async () => {
    const dir = tempDir();
    const script = join(dir, 'phase3-marker.js');
    writeFileSync(script, 'setInterval(() => {}, 1000);\n');
    const child = spawn(process.execPath, [script], { cwd: dir, stdio: 'ignore' });
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const cwds = await runningCwds('phase3-marker.js');
      expect(cwds.has(dir)).toBe(true);
    } finally {
      child.kill();
    }
  });
});
