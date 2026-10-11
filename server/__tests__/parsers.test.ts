import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  formatToolUse,
  parseClaudeSessionFile,
  parseTranscriptDir,
  parseTranscriptFile,
  shortenPaths,
} from '../utils/parseTranscript';
import { parseCodexSessionFile, parseCodexSessionMeta } from '../utils/parseCodexSession';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'bs-parse-'));
}

function write(dir: string, name: string, body: string): string {
  const file = join(dir, name);
  writeFileSync(file, body);
  return file;
}

describe('Claude and Cursor transcript parsers', () => {
  it('reads a Cursor jsonl directory, including cwd and the newest file', () => {
    const dir = tempDir();
    const session = join(dir, 'session');
    mkdirSync(session);
    write(
      session,
      'older.jsonl',
      JSON.stringify({
        role: 'user',
        message: { content: 'stale prompt' },
      }) + '\n',
    );
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

    const data = parseTranscriptDir(session);
    expect(data?.userQuery).toBe('fix the login form');
    expect(data?.cwd).toBe('/Users/ada/work/lumen-lab');
    expect(data?.lastAction).toBe('Updated the form.');
    expect(data?.isRecentlyActive).toBe(true);
  });

  it('falls back to workspace roots and a Workspace Path line', () => {
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
    const withRoot = parseTranscriptDir(dir);
    expect(withRoot?.cwd).toBe('/srv/app');

    writeFileSync(
      file,
      JSON.stringify({
        role: 'user',
        message: { content: 'Workspace Path: /srv/other please look' },
      }) + '\n',
    );
    expect(parseTranscriptDir(dir)?.cwd).toBe('/srv/other');
  });

  it('returns null for empty, missing, and content-less transcripts', () => {
    const dir = tempDir();
    expect(parseTranscriptDir(join(dir, 'missing'))).toBeNull();
    expect(parseTranscriptDir(dir)).toBeNull();
    write(dir, 'blank.jsonl', '{}\n');
    expect(parseTranscriptDir(dir)).toBeNull();
    expect(parseTranscriptFile(join(dir, 'nope.txt'))).toBeNull();
    write(dir, 'notes.txt', 'no query tag here');
    expect(parseTranscriptFile(join(dir, 'notes.txt'))).toBeNull();
  });

  it('parses a Cursor txt export and a long assistant sentence', () => {
    const dir = tempDir();
    const txt = write(
      dir,
      'chat.txt',
      '<user_query>\n  rename the sidebar\n</user_query>\nassistant notes',
    );
    const data = parseTranscriptFile(txt);
    expect(data?.userQuery).toBe('rename the sidebar');
    expect(data?.isRecentlyActive).toBe(true);

    const jsonl = write(
      dir,
      'long.jsonl',
      JSON.stringify({
        role: 'assistant',
        message: {
          content:
            'This sentence is deliberately much longer than eighty characters so the parser truncates it cleanly.',
        },
      }) + '\n',
    );
    expect(parseTranscriptDir(dir)?.lastAction?.endsWith('...')).toBe(true);
    expect(parseTranscriptFile(jsonl)).toBeNull();
  });

  it('formats Claude tool uses and shortens deep paths', () => {
    expect(shortenPaths('cd /Users/ada/work/app && cat /tmp')).toBe('cd app && cat /tmp');
    expect(shortenPaths('no paths here')).toBe('no paths here');

    const dir = tempDir();
    const now = new Date().toISOString();
    const tools: Array<[string, Record<string, unknown> | undefined, string]> = [
      ['Write', { file_path: '/Users/ada/work/app/src/App.tsx' }, 'Write:App.tsx'],
      ['Read', { path: '/Users/ada/work/app/src/main.tsx' }, 'Read:main.tsx'],
      ['Edit', { file: 'notes.md' }, 'Edit:notes.md'],
      ['StrReplace', undefined, 'StrReplace'],
      ['Shell', { command: 'cd /Users/ada/work/app && npm test' }, 'Shell:cd app && npm test'],
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
      expect(parseClaudeSessionFile(file)?.lastAction).toBe(expected);
    }

    expect(formatToolUse('Read')).toBe('Read');
  });

  it('keeps slug, string content, and inactive sessions', () => {
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
    const data = parseClaudeSessionFile(file);
    expect(data).toMatchObject({
      sessionId: 'sess-old',
      cwd: '/tmp/lumen-lab',
      slug: 'lumen-lab',
      latestTask: 'ship it',
      isActive: false,
    });
    expect(parseClaudeSessionFile(join(dir, 'missing.jsonl'))).toBeNull();
    write(dir, 'noid.jsonl', '{}\n');
    expect(parseClaudeSessionFile(join(dir, 'noid.jsonl'))).toBeNull();
  });
});

describe('Codex session parser', () => {
  it('reads a rollout with tool calls and a thread name', () => {
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

    const data = parseCodexSessionFile(file);
    expect(data).toMatchObject({
      sessionId: 'codex-1',
      cwd: '/tmp/lumen-lab',
      threadName: 'lumen',
      latestTask: 'check the build',
      lastAction: 'Shell:git -C lumen-lab status',
      isActive: true,
    });
    expect(parseCodexSessionMeta(file)).toMatchObject({
      sessionId: 'codex-1',
      cwd: '/tmp/lumen-lab',
    });
  });

  it('formats the other Codex tools and survives bad arguments', () => {
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
      expect(parseCodexSessionFile(file)?.lastAction).toBe(expected);
    }
  });

  it('marks an old rollout inactive and rejects files without session meta', () => {
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
    expect(parseCodexSessionFile(file)?.isActive).toBe(false);
    expect(parseCodexSessionFile(join(dir, 'missing.jsonl'))).toBeNull();
    write(dir, 'nometa.jsonl', '{}\n');
    expect(parseCodexSessionMeta(join(dir, 'nometa.jsonl'))).toBeNull();
    expect(parseCodexSessionFile(join(dir, 'nometa.jsonl'))).toBeNull();
  });
});
