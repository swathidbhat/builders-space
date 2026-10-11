import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClaudeWatcher } from '../watchers/claudeWatcher';
import { CodexWatcher } from '../watchers/codexWatcher';
import { CursorWatcher } from '../watchers/cursorWatcher';
import type { ProjectInfo } from '../types';

const watchers: Array<{ stop: () => void }> = [];

afterEach(() => {
  for (const watcher of watchers) watcher.stop();
  watchers.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('timed out waiting for a file-watch update'));
      }
    }, 50);
  });
}

function claudeLine(sessionId: string, cwd: string): string {
  return (
    JSON.stringify({
      type: 'user',
      sessionId,
      cwd,
      timestamp: new Date().toISOString(),
      message: { role: 'user', content: 'ship the hyphen fix' },
      slug: 'my-app',
    }) + '\n'
  );
}

describe('live session file updates', () => {
  it('Claude uses the session cwd for a hyphenated folder and sees a new file', async () => {
    const base = mkdtempSync(join(tmpdir(), 'bs-claude-'));
    const encoded = '-Users-alice-work-my-app';
    const dir = join(base, encoded);
    mkdirSync(dir);
    writeFileSync(
      join(dir, 'sess-hyphen.jsonl'),
      claudeLine('sess-hyphen', '/Users/alice/work/my-app'),
    );

    const seen: Map<string, ProjectInfo>[] = [];
    const watcher = new ClaudeWatcher(
      (projects) => {
        seen.push(projects);
      },
      { base },
    );
    watchers.push(watcher);
    watcher.start();
    await watcher.whenWatching();

    const first = [...seen.at(-1)!.values()][0];
    expect(first.path).toBe('/Users/alice/work/my-app');
    expect(first.path).not.toBe('/Users/alice/work-my-app');
    expect(first.name).toBe('my-app');

    writeFileSync(join(dir, 'sess-2.jsonl'), claudeLine('sess-2', '/Users/alice/work/my-app'));
    await waitFor(() =>
      [...seen.at(-1)!.values()].some((project) =>
        project.agents.some((agent) => agent.sessionId === 'sess-2'),
      ),
    );
  });

  it('Cursor sees a nested transcript without a glob watch', async () => {
    const base = mkdtempSync(join(tmpdir(), 'bs-cursor-'));
    const projectDir = join(base, '-Users-alice-work-my-app', 'agent-transcripts', 'agent-1');
    mkdirSync(projectDir, { recursive: true });
    const line =
      JSON.stringify({
        role: 'user',
        cwd: '/Users/alice/work/my-app',
        message: { content: [{ type: 'text', text: 'fix the login' }] },
      }) + '\n';
    writeFileSync(join(projectDir, 'agent-1.jsonl'), line);

    const seen: Map<string, ProjectInfo>[] = [];
    const watcher = new CursorWatcher(
      (projects) => {
        seen.push(projects);
      },
      { base },
    );
    watchers.push(watcher);
    watcher.start();
    await watcher.whenWatching();
    expect([...seen.at(-1)!.values()][0].path).toBe('/Users/alice/work/my-app');

    const secondDir = join(base, '-Users-alice-work-my-app', 'agent-transcripts', 'agent-2');
    mkdirSync(secondDir, { recursive: true });
    writeFileSync(join(secondDir, 'agent-2.jsonl'), line.replace('fix the login', 'add tests'));
    await waitFor(() => {
      const projects = [...seen.at(-1)!.values()];
      return projects.some((project) =>
        project.agents.some((agent) => agent.sessionId === 'agent-2'),
      );
    });
  });

  it('Cursor sees a new .txt transcript without waiting for the fallback scan', async () => {
    const base = mkdtempSync(join(tmpdir(), 'bs-cursor-txt-'));
    const transcripts = join(base, '-tmp-lumen-lab', 'agent-transcripts');
    mkdirSync(transcripts, { recursive: true });

    const seen: Map<string, ProjectInfo>[] = [];
    const watcher = new CursorWatcher(
      (projects) => {
        seen.push(projects);
      },
      { base, fallbackScanMs: 60_000 },
    );
    watchers.push(watcher);
    watcher.start();
    await watcher.whenWatching();

    writeFileSync(
      join(transcripts, 'agent-txt.txt'),
      '<user_query>paint the labels</user_query>\n',
    );
    await waitFor(() =>
      seen.some((projects) =>
        [...projects.values()].some((project) =>
          project.agents.some((agent) => agent.sessionId === 'agent-txt'),
        ),
      ),
    );
  });

  it('Codex sees a nested rollout and does not write .codex/hooks.json into the repo', async () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-codex-home-'));
    vi.stubEnv('HOME', home);
    mkdirSync(join(home, '.codex'), { recursive: true });
    writeFileSync(
      join(home, '.codex', 'hooks.json'),
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ command: '~/.builders-space/hooks/status-hook.sh' }] }] },
      }),
    );

    const sessionsDir = join(home, '.codex', 'sessions');
    const rolloutDir = join(sessionsDir, '2026', '10', '11');
    mkdirSync(rolloutDir, { recursive: true });
    const project = mkdtempSync(join(tmpdir(), 'bs-repo-'));
    const meta = JSON.stringify({
      type: 'session_meta',
      payload: { id: 'codex-1', cwd: project },
      timestamp: new Date().toISOString(),
    });
    writeFileSync(join(rolloutDir, 'rollout-1.jsonl'), meta + '\n');

    const seen: Map<string, ProjectInfo>[] = [];
    const watcher = new CodexWatcher(
      (projects) => {
        seen.push(projects);
      },
      {
        sessionsDir,
        indexFile: join(home, '.codex', 'session_index.jsonl'),
      },
    );
    watchers.push(watcher);
    watcher.start();
    await watcher.whenWatching();
    expect([...seen.at(-1)!.values()][0].path).toBe(project);

    expect(existsSync(join(project, '.codex', 'hooks.json'))).toBe(false);

    writeFileSync(join(rolloutDir, 'rollout-2.jsonl'), meta.replace('codex-1', 'codex-2') + '\n');
    await waitFor(() =>
      [...seen.at(-1)!.values()].some((entry) =>
        entry.agents.some((agent) => agent.sessionId === 'codex-2'),
      ),
    );
    expect(existsSync(join(project, '.codex', 'hooks.json'))).toBe(false);
  });

  it('Cursor starts watching after the projects directory appears', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bs-cursor-late-'));
    const base = join(root, 'projects');
    const seen: Map<string, ProjectInfo>[] = [];
    const watcher = new CursorWatcher(
      (projects) => {
        seen.push(projects);
      },
      {
        base,
        missingDirRetryMs: 100,
        fallbackScanMs: 60_000,
      },
    );
    watchers.push(watcher);
    watcher.start();
    expect(seen).toHaveLength(0);

    const transcript = join(base, '-Users-alice-code-app', 'agent-transcripts', 'agent-9');
    mkdirSync(transcript, { recursive: true });
    writeFileSync(
      join(transcript, 'agent-9.jsonl'),
      JSON.stringify({
        role: 'user',
        cwd: '/Users/alice/code/app',
        message: { content: [{ type: 'text', text: 'hello' }] },
      }) + '\n',
    );

    await waitFor(() =>
      seen.some((projects) =>
        [...projects.values()].some((project) =>
          project.agents.some((agent) => agent.sessionId === 'agent-9'),
        ),
      ),
    );
    expect([...seen.at(-1)!.values()][0].path).toBe('/Users/alice/code/app');
  });

  it('logs a readable error when the Claude projects path is not a directory', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'bs-claude-file-')), 'not-a-dir');
    writeFileSync(file, 'nope');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const watcher = new ClaudeWatcher(() => {}, { base: file });
    watchers.push(watcher);
    watcher.start();
    expect(spy.mock.calls.some((call) => String(call[0]).includes('[ClaudeWatcher]'))).toBe(true);
  });

  it('shows a new project directory and drops a deleted one without the fallback scan', async () => {
    const base = mkdtempSync(join(tmpdir(), 'bs-cursor-dirs-'));
    const line =
      JSON.stringify({
        role: 'user',
        message: { content: [{ type: 'text', text: 'one' }] },
      }) + '\n';
    const first = join(base, '-tmp-first-app', 'agent-transcripts', 'a');
    mkdirSync(first, { recursive: true });
    writeFileSync(join(first, 'a.jsonl'), line);

    const seen: Map<string, ProjectInfo>[] = [];
    const watcher = new CursorWatcher(
      (projects) => {
        seen.push(projects);
      },
      { base, fallbackScanMs: 60_000 },
    );
    watchers.push(watcher);
    watcher.start();
    await watcher.whenWatching();
    expect([...seen.at(-1)!.values()][0].agents.map((agent) => agent.sessionId)).toEqual(['a']);

    const second = join(base, '-tmp-second-app', 'agent-transcripts', 'b');
    mkdirSync(second, { recursive: true });
    writeFileSync(join(second, 'b.jsonl'), line);
    await waitFor(
      () =>
        [...seen.at(-1)!.values()].some((project) =>
          project.agents.some((agent) => agent.sessionId === 'b'),
        ),
      8_000,
    );

    rmSync(join(base, '-tmp-first-app'), { recursive: true, force: true });
    await waitFor(
      () =>
        ![...seen.at(-1)!.values()].some((project) =>
          project.agents.some((agent) => agent.sessionId === 'a'),
        ),
      8_000,
    );
    expect(
      [...seen.at(-1)!.values()].some((project) =>
        project.agents.some((agent) => agent.sessionId === 'b'),
      ),
    ).toBe(true);
  });

  it('names a Cursor txt project from the real folder, not the last hyphen', async () => {
    const root = mkdtempSync(join('/tmp', 'bs-name-'));
    const projectDir = join(root, 'code', 'weather-widget-pro');
    mkdirSync(projectDir, { recursive: true });
    const encoded = projectDir.slice(1).replaceAll('/', '-');
    const base = mkdtempSync(join(tmpdir(), 'bs-cursor-name-'));
    const transcripts = join(base, encoded, 'agent-transcripts');
    mkdirSync(transcripts, { recursive: true });
    writeFileSync(join(transcripts, 'chat.txt'), '<user_query>build the widget</user_query>\n');

    const stale = join(base, '-Users-nobody-Projects-Side-Quest-Tracker', 'agent-transcripts');
    mkdirSync(stale, { recursive: true });
    writeFileSync(join(stale, 'old.txt'), '<user_query>side quest</user_query>\n');

    try {
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

      const projects = [...(seen?.values() ?? [])];
      const widget = projects.find((project) => project.path === projectDir);
      expect(widget?.name).toBe('weather-widget-pro');
      expect(widget?.name).not.toBe('pro');
      const missing = projects.find((project) => project.name === 'Side-Quest-Tracker');
      expect(missing).toBeTruthy();
      expect(missing?.name).not.toBe('Projects Side Quest Tracker');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
