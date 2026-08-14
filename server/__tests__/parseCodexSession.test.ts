import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseCodexSessionFile } from '../utils/parseCodexSession';

let dir: string;
let n = 0;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'bs-codex-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const meta = {
  type: 'session_meta',
  payload: { id: 'sess-abc', cwd: '/tmp/proj' },
};

const userMsg = (message: string) => ({
  type: 'event_msg',
  payload: { type: 'user_message', message },
});

const agentMsg = (message: string, phase: 'final_answer' | 'commentary') => ({
  type: 'event_msg',
  payload: { type: 'agent_message', message, phase },
});

const toolCall = (name: string, args: Record<string, unknown>) => ({
  type: 'response_item',
  payload: { type: 'function_call', name, arguments: JSON.stringify(args) },
});

function write(entries: unknown[]): string {
  const path = join(dir, `rollout-2026-01-01T00-00-00-x${n++}.jsonl`);
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n'));
  return path;
}

describe('parseCodexSessionFile', () => {
  it('takes the latest request', () => {
    const path = write([
      meta,
      userMsg('build the invoice exporter'),
      userMsg('actually make it a CSV, not PDF'),
    ]);
    expect(parseCodexSessionFile(path)!.latestTask).toBe(
      'actually make it a CSV, not PDF',
    );
  });

  it('never lets the classifier prompt become the goal', () => {
    // The most common synthetic turn by an order of magnitude, and it quotes a
    // whole prior transcript — so unwrapping it would surface a fragment of
    // somebody else's conversation as this agent's goal.
    const path = write([
      meta,
      userMsg('tidy up the README'),
      userMsg(
        'The following is the Codex agent history whose request action you are assessing.\n' +
          '>>> TRANSCRIPT START\n[1] user:\n## My request for Codex:\nunrelated work',
      ),
    ]);
    expect(parseCodexSessionFile(path)!.latestTask).toBe('tidy up the README');
  });

  it('unwraps ambient browser context to find the request', () => {
    const path = write([
      meta,
      userMsg(
        '# In app browser:\n- Current URL: http://localhost:3000/\n\n' +
          '## My request for Codex:\nthe nav collapses too early',
      ),
    ]);
    expect(parseCodexSessionFile(path)!.latestTask).toBe(
      'the nav collapses too early',
    );
  });

  it('leaves the task unset when every turn was machine-written', () => {
    const path = write([
      meta,
      userMsg('The following is the Codex agent history whose request action you are assessing.'),
    ]);
    expect(parseCodexSessionFile(path)!.latestTask).toBeUndefined();
  });

  it('asks the question from a closing answer', () => {
    const path = write([
      meta,
      userMsg('add the webhook'),
      agentMsg('Done. Want me to add a retry policy as well?', 'final_answer'),
    ]);
    expect(parseCodexSessionFile(path)!.question).toBe(
      'Done. Want me to add a retry policy as well?',
    );
  });

  it('ignores mid-work narration', () => {
    // `phase` is a truer "waiting on you" signal than guessing from whether a
    // tool call happened to come last.
    const path = write([
      meta,
      userMsg('add the webhook'),
      agentMsg('Let me check the existing handlers first.', 'commentary'),
    ]);
    expect(parseCodexSessionFile(path)!.question).toBeUndefined();
  });

  it('drops the question once work resumes after it', () => {
    const path = write([
      meta,
      userMsg('add the webhook'),
      agentMsg('Done — anything else?', 'final_answer'),
      toolCall('read_file', { path: '/tmp/proj/handler.ts' }),
    ]);
    const data = parseCodexSessionFile(path)!;
    expect(data.question).toBeUndefined();
    expect(data.lastAction).toBe('Read:handler.ts');
  });

  it('rejects a classifier verdict as a question', () => {
    const path = write([
      meta,
      agentMsg('{"risk_level":"low","outcome":"allow"}', 'final_answer'),
    ]);
    expect(parseCodexSessionFile(path)!.question).toBeUndefined();
  });

  it('caps the question length', () => {
    const path = write([meta, agentMsg('c'.repeat(900), 'final_answer')]);
    expect(parseCodexSessionFile(path)!.question!.length).toBeLessThanOrEqual(240);
  });
});
