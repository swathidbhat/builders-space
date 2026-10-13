import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  beginClaudeParseScan,
  beginCursorParseScan,
  endClaudeParseScan,
  endCursorParseScan,
  formatToolUse,
  parseClaudeSessionFile,
  parseTranscriptDir,
  parseTranscriptFile,
  shortenPaths,
  txtAssistantReply,
  transcriptCacheSize,
  transcriptTxtTailLength,
} from '../utils/parseTranscript';
import {
  beginCodexParseScan,
  codexCacheSize,
  endCodexParseScan,
  parseCodexSessionFile,
  parseCodexSessionMeta,
} from '../utils/parseCodexSession';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'bs-parse-'));
}

function write(dir: string, name: string, body: string): string {
  const file = join(dir, name);
  writeFileSync(file, body);
  return file;
}

describe('Claude and Cursor transcript parsers', () => {
  it('reads a Cursor jsonl directory, including cwd and the newest file', async () => {
    const dir = tempDir();
    const session = join(dir, 'session');
    mkdirSync(session);
    const older = write(
      session,
      'older.jsonl',
      JSON.stringify({
        role: 'user',
        message: { content: 'stale prompt' },
      }) + '\n',
    );
    // Some CI filesystems store mtime in whole seconds. A same-second write
    // then looks as new as utimesSync(now), and sort keeps directory order.
    const past = new Date(Date.now() - 60_000);
    utimesSync(older, past, past);
    const newest = write(
      session,
      'newest.jsonl',
      [
        'not json',
        JSON.stringify({
          role: 'user',
          cwd: '/Users/ada/work/lumen-lab',
          message: { content: [{ type: 'text', text: 'fix the login form' }] },
        }),
        JSON.stringify({
          role: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Updated the form. Next I will run tests.' }],
          },
        }),
      ].join('\n') + '\n',
    );
    utimesSync(newest, new Date(), new Date());

    const data = await parseTranscriptDir(session);
    expect(data?.userQuery).toBe('fix the login form');
    expect(data?.cwd).toBe('/Users/ada/work/lumen-lab');
    expect(data?.lastAction).toBe('Updated the form.');
    expect(data?.pendingQuestion).toBe('Updated the form. Next I will run tests.');
    expect(data?.isRecentlyActive).toBe(true);
  });

  it('falls back to workspace roots and a Workspace Path line', async () => {
    const dir = tempDir();
    const file = write(
      dir,
      'roots.jsonl',
      JSON.stringify({
        role: 'user',
        workspace_roots: ['/srv/app'],
        message: { content: 'Workspace Path: /srv/other\nplease look' },
      }) + '\n',
    );
    const withRoot = await parseTranscriptDir(dir);
    expect(withRoot?.cwd).toBe('/srv/app');

    writeFileSync(
      file,
      JSON.stringify({
        role: 'user',
        message: { content: 'Workspace Path: /srv/other please look' },
      }) + '\n',
    );
    expect((await parseTranscriptDir(dir))?.cwd).toBe('/srv/other');
  });

  it('returns null for empty, missing, and content-less transcripts', async () => {
    const dir = tempDir();
    expect(await parseTranscriptDir(join(dir, 'missing'))).toBeNull();
    expect(await parseTranscriptDir(dir)).toBeNull();
    write(dir, 'blank.jsonl', '{}\n');
    expect(await parseTranscriptDir(dir)).toBeNull();
    expect(await parseTranscriptFile(join(dir, 'nope.txt'))).toBeNull();
    write(dir, 'notes.txt', 'no query tag here');
    expect(await parseTranscriptFile(join(dir, 'notes.txt'))).toBeNull();
  });

  it('parses a Cursor txt export and a long assistant sentence', async () => {
    const dir = tempDir();
    const txt = write(
      dir,
      'chat.txt',
      '<user_query>\n  rename the sidebar\n</user_query>\nassistant notes',
    );
    const data = await parseTranscriptFile(txt);
    expect(data?.userQuery).toBe('rename the sidebar');
    expect(data?.pendingQuestion).toBe('assistant notes');
    expect(data?.turnFinished).toBe(true);
    expect(data?.isRecentlyActive).toBe(true);
    expect((await parseTranscriptFile(txt))?.pendingQuestion).toBe('assistant notes');
    const asking = write(dir, 'ask.txt', '<user_query>only the user</user_query>\n');
    expect((await parseTranscriptFile(asking))?.turnFinished).toBe(false);
    expect((await parseTranscriptFile(asking))?.pendingQuestion).toBeUndefined();
    const full =
      'The old charge path still has callers in checkout. Should I delete it anyway, or keep it behind a flag?';
    const asked = write(
      dir,
      'asked.txt',
      `<user_query>\n${'migrate the dashboard'}\n</user_query>\n${full}\n`,
    );
    expect((await parseTranscriptFile(asked))?.pendingQuestion).toBe(full);
    expect((await parseTranscriptFile(asked))?.userQuery).toBe('migrate the dashboard');
    expect(
      txtAssistantReply('\nuser: keep going\nassistant: Should I also backfill existing orders?\n'),
    ).toBe('Should I also backfill existing orders?');

    const longSentence =
      'This sentence is deliberately much longer than eighty characters so the parser truncates it cleanly.';
    const jsonl = write(
      dir,
      'long.jsonl',
      JSON.stringify({
        role: 'assistant',
        message: { content: longSentence },
      }) + '\n',
    );
    const parsed = await parseTranscriptDir(dir);
    expect(parsed?.lastAction?.endsWith('...')).toBe(true);
    expect(parsed?.pendingQuestion).toBe(longSentence);
    expect(parsed?.turnFinished).toBe(true);
    expect(await parseTranscriptFile(jsonl)).toBeNull();
  });

  it('keeps the whole Claude and Cursor question, then drops it when the user replies', async () => {
    const dir = tempDir();
    const question =
      'The rename touches 41 components. Should I update them all in this PR, or split it?';
    const now = new Date().toISOString();
    const claude = write(
      dir,
      'ask.jsonl',
      [
        JSON.stringify({
          type: 'user',
          sessionId: 'sess-ask',
          cwd: '/tmp/billing',
          timestamp: now,
          message: { content: 'rename the sidebar' },
        }),
        JSON.stringify({
          type: 'assistant',
          sessionId: 'sess-ask',
          timestamp: now,
          message: {
            content: [
              { type: 'tool_use', name: 'Read', input: { file_path: '/tmp/billing/App.tsx' } },
              { type: 'text', text: question },
            ],
          },
        }),
      ].join('\n') + '\n',
    );
    const asked = await parseClaudeSessionFile(claude);
    expect(asked?.lastAction).toBe('Read:App.tsx');
    expect(asked?.pendingQuestion).toBe(question);
    expect(asked?.latestTask).toBe('rename the sidebar');
    expect(asked?.turnFinished).toBe(true);

    writeFileSync(
      claude,
      [
        JSON.stringify({
          type: 'user',
          sessionId: 'sess-ask',
          cwd: '/tmp/billing',
          timestamp: now,
          message: { content: 'rename the sidebar' },
        }),
        JSON.stringify({
          type: 'assistant',
          sessionId: 'sess-ask',
          timestamp: now,
          message: { content: [{ type: 'text', text: question }] },
        }),
        JSON.stringify({
          type: 'user',
          sessionId: 'sess-ask',
          timestamp: now,
          message: { content: 'split it' },
        }),
      ].join('\n') + '\n',
    );
    const answered = await parseClaudeSessionFile(claude);
    expect(answered?.turnFinished).toBe(false);
    expect(answered?.pendingQuestion).toBeUndefined();
    expect(answered?.latestTask).toBe('split it');
  });

  it('formats Claude tool uses and shortens deep paths', async () => {
    expect(shortenPaths('cd /Users/ada/work/app && cat /tmp')).toBe('cd app && cat /tmp');
    expect(shortenPaths('no paths here')).toBe('no paths here');
    expect(shortenPaths('go test ./internal/ratelimit/...')).toBe(
      'go test ./internal/ratelimit/...',
    );

    const dir = tempDir();
    const now = new Date().toISOString();
    const tools: Array<[string, Record<string, unknown> | undefined, string]> = [
      ['Write', { file_path: '/Users/ada/work/app/src/App.tsx' }, 'Write:App.tsx'],
      ['Read', { path: '/Users/ada/work/app/src/main.tsx' }, 'Read:main.tsx'],
      ['Edit', { file: 'notes.md' }, 'Edit:notes.md'],
      ['StrReplace', undefined, 'StrReplace'],
      ['Shell', { command: 'cd /Users/ada/work/app && npm test' }, 'Shell:cd app && npm test'],
      [
        'Shell',
        { command: 'go test ./internal/ratelimit/...' },
        'Shell:go test ./internal/ratelimit/...',
      ],
      ['Bash', { command: '' }, 'Shell'],
      ['Grep', { pattern: 'authToken' }, 'Search:authToken'],
      ['Search', { query: '' }, 'Search'],
      ['Glob', { glob_pattern: 'src/**/*.ts' }, 'Glob:src/**/*.ts'],
      ['ListFiles', {}, 'Glob'],
      ['WebSearch', { search_term: 'chokidar 4' }, 'WebSearch:chokidar 4'],
      ['Task', { prompt: 'sub' }, 'Task:subtask'],
      ['TodoWrite', { todos: [] }, 'TodoWrite'],
      ['Custom', { file_path: '/Users/ada/work/app/src/a.ts' }, 'Custom:a.ts'],
      ['Custom', {}, 'Custom'],
    ];

    for (const [name, input, expected] of tools) {
      const file = write(
        dir,
        `${name}.jsonl`,
        [
          JSON.stringify({
            type: 'user',
            sessionId: `s-${name}`,
            cwd: '/Users/ada/work/app',
            timestamp: now,
            message: { content: [{ type: 'text', text: `use ${name}` }] },
          }),
          JSON.stringify({
            type: 'assistant',
            sessionId: `s-${name}`,
            timestamp: now,
            message: { content: [{ type: 'tool_use', name, input }] },
          }),
        ].join('\n') + '\n',
      );
      expect((await parseClaudeSessionFile(file))?.lastAction).toBe(expected);
    }

    expect(formatToolUse('Read')).toBe('Read');
  });

  it('keeps slug, string content, and inactive sessions', async () => {
    const dir = tempDir();
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const file = write(
      dir,
      'old.jsonl',
      JSON.stringify({
        type: 'user',
        sessionId: 'sess-old',
        cwd: '/tmp/lumen-lab',
        slug: 'lumen-lab',
        timestamp: old,
        message: { content: 'ship it' },
      }) + '\n',
    );
    const data = await parseClaudeSessionFile(file);
    expect(data).toMatchObject({
      sessionId: 'sess-old',
      cwd: '/tmp/lumen-lab',
      slug: 'lumen-lab',
      latestTask: 'ship it',
      isActive: false,
    });
    expect(await parseClaudeSessionFile(join(dir, 'missing.jsonl'))).toBeNull();
    write(dir, 'noid.jsonl', '{}\n');
    expect(await parseClaudeSessionFile(join(dir, 'noid.jsonl'))).toBeNull();
  });
});

describe('Codex session parser', () => {
  it('reads a rollout with tool calls and a thread name', async () => {
    const dir = tempDir();
    const now = new Date().toISOString();
    const file = write(
      dir,
      'rollout-2026-10-11T01-00-00-lumen.jsonl',
      [
        JSON.stringify({
          timestamp: now,
          type: 'session_meta',
          payload: { id: 'codex-1', cwd: '/tmp/lumen-lab' },
        }),
        'not-json',
        JSON.stringify({
          timestamp: now,
          type: 'event_msg',
          payload: { type: 'user_message', message: 'check the build' },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'response_item',
          payload: {
            type: 'function_call',
            name: 'exec_command',
            arguments: JSON.stringify({
              cmd: 'git -C /Users/ada/work/lumen-lab status',
            }),
          },
        }),
      ].join('\n') + '\n',
    );

    const data = await parseCodexSessionFile(file);
    expect(data).toMatchObject({
      sessionId: 'codex-1',
      cwd: '/tmp/lumen-lab',
      threadName: 'lumen',
      latestTask: 'check the build',
      lastAction: 'Shell:git -C lumen-lab status',
      isActive: true,
      turnFinished: false,
    });
    expect(parseCodexSessionMeta(file)).toMatchObject({
      sessionId: 'codex-1',
      cwd: '/tmp/lumen-lab',
    });
  });

  it('treats a Codex assistant message as a finished turn', async () => {
    const dir = tempDir();
    const now = new Date().toISOString();
    const file = write(
      dir,
      'rollout-finished.jsonl',
      [
        JSON.stringify({
          timestamp: now,
          type: 'session_meta',
          payload: { id: 'done-turn', cwd: '/tmp/app' },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'event_msg',
          payload: { type: 'agent_message', message: 'checking' },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'response_item',
          payload: { type: 'message', role: 'assistant', content: [] },
        }),
      ].join('\n') + '\n',
    );
    const finished = await parseCodexSessionFile(file);
    expect(finished?.turnFinished).toBe(true);
    expect(finished?.pendingQuestion).toBe('checking');
  });

  it('keeps a Codex agent_message and hides it again after the user replies', async () => {
    const dir = tempDir();
    const now = new Date().toISOString();
    const question =
      'The old charge path still has callers. Should I delete it anyway, or keep it behind a flag?';
    const file = write(
      dir,
      'rollout-question.jsonl',
      [
        JSON.stringify({
          timestamp: now,
          type: 'session_meta',
          payload: { id: 'ask', cwd: '/tmp/billing' },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'event_msg',
          payload: { type: 'user_message', message: 'migrate the payments dashboard' },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'response_item',
          payload: {
            type: 'function_call',
            name: 'exec_command',
            arguments: JSON.stringify({ cmd: 'psql -c "select id from charges"' }),
          },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'event_msg',
          payload: { type: 'agent_message', message: question },
        }),
      ].join('\n') + '\n',
    );
    const asked = await parseCodexSessionFile(file);
    expect(asked?.turnFinished).toBe(true);
    expect(asked?.lastAction).toBe('Shell:psql -c "select id from charges"');
    expect(asked?.pendingQuestion).toBe(question);
    expect(asked?.latestTask).toBe('migrate the payments dashboard');

    writeFileSync(
      file,
      [
        JSON.stringify({
          timestamp: now,
          type: 'session_meta',
          payload: { id: 'ask', cwd: '/tmp/billing' },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'event_msg',
          payload: { type: 'agent_message', message: question },
        }),
        JSON.stringify({
          timestamp: now,
          type: 'event_msg',
          payload: { type: 'user_message', message: 'keep the flag' },
        }),
      ].join('\n') + '\n',
    );
    const answered = await parseCodexSessionFile(file);
    expect(answered?.turnFinished).toBe(false);
    expect(answered?.pendingQuestion).toBeUndefined();
    expect(answered?.latestTask).toBe('keep the flag');
  });

  it('formats the other Codex tools and survives bad arguments', async () => {
    const dir = tempDir();
    const now = new Date().toISOString();
    const cases: Array<[string, string | undefined, string]> = [
      ['shell', JSON.stringify({ command: '' }), 'Shell'],
      ['apply_patch', JSON.stringify({ path: '/tmp/lumen-lab/src/App.tsx' }), 'Edit:App.tsx'],
      ['apply_patch', JSON.stringify({}), 'Edit'],
      ['read_file', JSON.stringify({ file_path: '/tmp/lumen-lab/README.md' }), 'Read:README.md'],
      ['read_file', JSON.stringify({}), 'Read'],
      ['write_file', JSON.stringify({ path: 'notes.md' }), 'Write:notes.md'],
      ['write_file', JSON.stringify({}), 'Write'],
      ['list_directory', JSON.stringify({ file: 'src' }), 'List:src'],
      ['list_directory', JSON.stringify({}), 'List'],
      ['custom_tool', JSON.stringify({ file_path: '/tmp/a/b/c.ts' }), 'custom_tool:c.ts'],
      ['custom_tool', JSON.stringify({}), 'custom_tool'],
      ['exec_command', undefined, 'exec_command'],
      ['exec_command', '{', 'exec_command'],
    ];

    for (const [name, args, expected] of cases) {
      const file = write(
        dir,
        `rollout-${name}.jsonl`,
        [
          JSON.stringify({
            timestamp: now,
            type: 'session_meta',
            payload: { id: name, cwd: '/tmp/lumen-lab' },
          }),
          JSON.stringify({
            timestamp: now,
            type: 'response_item',
            payload: { type: 'function_call', name, arguments: args },
          }),
        ].join('\n') + '\n',
      );
      expect((await parseCodexSessionFile(file))?.lastAction).toBe(expected);
    }
  });

  it('marks an old rollout inactive and rejects files without session meta', async () => {
    const dir = tempDir();
    const old = new Date(Date.now() - 30 * 60 * 1000);
    const file = write(
      dir,
      'plain.jsonl',
      JSON.stringify({
        timestamp: old.toISOString(),
        type: 'session_meta',
        payload: { id: 'old-session', cwd: '/tmp/lumen-lab' },
      }) + '\n',
    );
    utimesSync(file, old, old);
    expect((await parseCodexSessionFile(file))?.isActive).toBe(false);
    expect(await parseCodexSessionFile(join(dir, 'missing.jsonl'))).toBeNull();
    write(dir, 'nometa.jsonl', '{}\n');
    expect(parseCodexSessionMeta(join(dir, 'nometa.jsonl'))).toBeNull();
    expect(await parseCodexSessionFile(join(dir, 'nometa.jsonl'))).toBeNull();
  });

  it('keeps a Codex header until mtime changes and drops headers the scan did not see', async () => {
    const dir = tempDir();
    const file = write(
      dir,
      'rollout.jsonl',
      JSON.stringify({
        type: 'session_meta',
        payload: { id: 'header-a', cwd: '/tmp/lumen-lab' },
      }) + '\n',
    );
    const stamp = new Date('2020-01-01T00:00:00Z');
    utimesSync(file, stamp, stamp);
    expect(parseCodexSessionMeta(file)?.sessionId).toBe('header-a');
    writeFileSync(
      file,
      JSON.stringify({
        type: 'session_meta',
        payload: { id: 'header-b', cwd: '/tmp/lumen-lab' },
      }) + '\n',
    );
    utimesSync(file, stamp, stamp);
    expect(parseCodexSessionMeta(file)?.sessionId).toBe('header-a');
    const changed = new Date('2020-01-01T00:00:02Z');
    utimesSync(file, changed, changed);
    expect(parseCodexSessionMeta(file)?.sessionId).toBe('header-b');

    beginCodexParseScan();
    endCodexParseScan();
    expect(codexCacheSize()).toBe(0);
    expect(parseCodexSessionMeta(file)?.sessionId).toBe('header-b');
  });
});

describe('parse caches', () => {
  it('does not keep the whole txt body and drops files the latest scan skipped', async () => {
    beginCursorParseScan();
    endCursorParseScan();
    beginClaudeParseScan();
    endClaudeParseScan();

    const dir = tempDir();
    const txt = write(
      dir,
      'chat.txt',
      `<user_query>rename the sidebar</user_query>\n${'x'.repeat(20_000)}`,
    );
    expect((await parseTranscriptFile(txt))?.userQuery).toBe('rename the sidebar');
    const tail = transcriptTxtTailLength(txt);
    expect(tail).not.toBeNull();
    expect(tail!).toBeLessThanOrEqual(8_192);

    beginCursorParseScan();
    endCursorParseScan();
    expect(transcriptTxtTailLength(txt)).toBeNull();

    const claude = write(
      dir,
      'sess.jsonl',
      JSON.stringify({
        type: 'user',
        sessionId: 'sess-cache',
        cwd: '/tmp/lumen-lab',
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: 'hello' },
      }) + '\n',
    );
    expect((await parseClaudeSessionFile(claude))?.sessionId).toBe('sess-cache');
    beginClaudeParseScan();
    endClaudeParseScan();
    expect(transcriptCacheSize()).toBe(0);
  });
});
