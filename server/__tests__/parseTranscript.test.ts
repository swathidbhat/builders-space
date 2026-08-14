import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  parseClaudeSessionFile,
  parseTranscriptDir,
  parseTranscriptFile,
} from '../utils/parseTranscript';

let dir: string;
let n = 0;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'bs-transcript-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A `.jsonl` file of the given entries, in file order. */
function writeJsonl(entries: unknown[]): string {
  const path = join(dir, `t-${n++}.jsonl`);
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n'));
  return path;
}

/** A Cursor agent-transcript directory, which is parsed via its first .jsonl. */
function writeCursorDir(entries: unknown[]): string {
  const sub = join(dir, `cursor-${n++}`);
  mkdirSync(sub);
  writeFileSync(
    join(sub, 'transcript.jsonl'),
    entries.map((e) => JSON.stringify(e)).join('\n'),
  );
  return sub;
}

const user = (content: string) => ({ role: 'user', message: { content } });
const assistant = (content: string) => ({ role: 'assistant', message: { content } });

describe('parseTranscriptDir (Cursor JSONL)', () => {
  it('takes the latest request, not the first', () => {
    // The first-message latch left a retasked session advertising whatever it
    // was originally asked to do, which would make its party goal a lie.
    const path = writeCursorDir([
      user('set up the database schema'),
      assistant('Done.'),
      user('actually, migrate it to Postgres instead'),
    ]);
    expect(parseTranscriptDir(path)!.latestTask).toBe(
      'actually, migrate it to Postgres instead',
    );
  });

  it('falls back past a bare continuation to the last real request', () => {
    const path = writeCursorDir([
      user('add pagination to the results list'),
      assistant('Working on it.'),
      user('continue'),
    ]);
    expect(parseTranscriptDir(path)!.latestTask).toBe(
      'add pagination to the results list',
    );
  });

  it('skips a command echo arriving after the real request', () => {
    const path = writeCursorDir([
      user('rename the User model to Account'),
      user('<command-name>/clear</command-name>'),
    ]);
    expect(parseTranscriptDir(path)!.latestTask).toBe(
      'rename the User model to Account',
    );
  });

  it('captures the last assistant turn as the question', () => {
    const path = writeCursorDir([
      user('wire up auth'),
      assistant('Which provider do you want, Auth0 or Clerk?'),
    ]);
    expect(parseTranscriptDir(path)!.question).toBe(
      'Which provider do you want, Auth0 or Clerk?',
    );
  });

  it('leaves the question unset when the agent never spoke', () => {
    const path = writeCursorDir([user('wire up auth')]);
    expect(parseTranscriptDir(path)!.question).toBeUndefined();
  });
});

describe('parseTranscriptFile (Cursor .txt)', () => {
  function writeTxt(body: string): string {
    const path = join(dir, `t-${n++}.txt`);
    writeFileSync(path, body);
    return path;
  }

  it('takes the last user_query block, not the first', () => {
    // A non-greedy `.match()` stopped at the opening query.
    const path = writeTxt(
      '<user_query>build the landing page</user_query>\n' +
        'some assistant chatter\n' +
        '<user_query>now add the pricing table</user_query>\n',
    );
    expect(parseTranscriptFile(path)!.latestTask).toBe('now add the pricing table');
  });

  it('falls back past a continuation block', () => {
    const path = writeTxt(
      '<user_query>refactor the sidebar</user_query>\n<user_query>go on</user_query>\n',
    );
    expect(parseTranscriptFile(path)!.latestTask).toBe('refactor the sidebar');
  });

  it('returns null when every block is synthetic', () => {
    const path = writeTxt('<user_query>[Request interrupted by user]</user_query>');
    expect(parseTranscriptFile(path)).toBeNull();
  });

  it('never invents a question — this path has no assistant records', () => {
    const path = writeTxt('<user_query>ship it</user_query>');
    expect(parseTranscriptFile(path)!.question).toBeUndefined();
  });
});

describe('parseClaudeSessionFile', () => {
  const base = { sessionId: 'sess-1', cwd: '/tmp/proj' };
  const at = (i: number) => new Date(1_700_000_000_000 + i * 1000).toISOString();

  const cUser = (i: number, content: string) => ({
    ...base,
    type: 'user',
    timestamp: at(i),
    message: { content },
  });
  const cAssistant = (
    i: number,
    content: Array<Record<string, unknown>>,
  ) => ({ ...base, type: 'assistant', timestamp: at(i), message: { content } });

  it('takes the latest meaningful request', () => {
    const path = writeJsonl([
      cUser(1, 'write the export job'),
      cUser(2, 'make it stream instead of buffering'),
    ]);
    expect(parseClaudeSessionFile(path)!.latestTask).toBe(
      'make it stream instead of buffering',
    );
  });

  it('skips a synthetic turn that arrives after the real request', () => {
    // These carry ordinary timestamps, so the newest user entry is regularly
    // not a human request at all.
    const path = writeJsonl([
      cUser(1, 'add retries to the webhook sender'),
      cUser(2, 'This session is being continued from a previous conversation. The summary...'),
    ]);
    expect(parseClaudeSessionFile(path)!.latestTask).toBe(
      'add retries to the webhook sender',
    );
  });

  it('asks the question when the last turn was prose', () => {
    const path = writeJsonl([
      cUser(1, 'set up CI'),
      cAssistant(2, [{ type: 'text', text: 'GitHub Actions or CircleCI?' }]),
    ]);
    expect(parseClaudeSessionFile(path)!.question).toBe('GitHub Actions or CircleCI?');
  });

  it('asks nothing when the last turn ended in a tool call', () => {
    // A turn ending in a tool call is mid-work, however conversational the
    // prose beside it was.
    const path = writeJsonl([
      cUser(1, 'set up CI'),
      cAssistant(2, [
        { type: 'text', text: 'Let me look at the existing workflow.' },
        { type: 'tool_use', name: 'Read', input: { file_path: '/tmp/ci.yml' } },
      ]),
    ]);
    const data = parseClaudeSessionFile(path)!;
    expect(data.question).toBeUndefined();
    expect(data.lastAction).toBe('Read:ci.yml');
  });

  it('asks again once the agent stops working and speaks', () => {
    const path = writeJsonl([
      cUser(1, 'set up CI'),
      cAssistant(2, [{ type: 'tool_use', name: 'Read', input: { file_path: '/tmp/a' } }]),
      cAssistant(3, [{ type: 'text', text: 'Done — want me to enable it on PRs too?' }]),
    ]);
    expect(parseClaudeSessionFile(path)!.question).toBe(
      'Done — want me to enable it on PRs too?',
    );
  });

  it('caps the question length', () => {
    const path = writeJsonl([
      cUser(1, 'go'),
      cAssistant(2, [{ type: 'text', text: 'q'.repeat(900) }]),
    ]);
    expect(parseClaudeSessionFile(path)!.question!.length).toBeLessThanOrEqual(240);
  });

  it('rejects a classifier verdict as a question', () => {
    const path = writeJsonl([
      cUser(1, 'check this'),
      cAssistant(2, [{ type: 'text', text: '{"outcome":"allow","risk_level":"low"}' }]),
    ]);
    expect(parseClaudeSessionFile(path)!.question).toBeUndefined();
  });
});
