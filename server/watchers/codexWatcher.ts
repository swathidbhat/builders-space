import { watch } from 'chokidar';
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { parseCodexSessionFile, parseCodexSessionMeta } from '../utils/parseCodexSession';
import { writeCodexHooksJson } from '../services/hookSetup';
import type { AgentInfo, AgentStatus, ProjectInfo } from '../types';

export type CodexWatcherCallback = (projects: Map<string, ProjectInfo>) => void;

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

export class CodexWatcher {
  private codexBase: string;
  private sessionsDir: string;
  private indexFile: string;
  private projects = new Map<string, ProjectInfo>();
  private onChange: CodexWatcherCallback;
  private watcher: ReturnType<typeof watch> | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;

  constructor(onChange: CodexWatcherCallback) {
    this.codexBase = join(homedir(), '.codex');
    this.sessionsDir = join(this.codexBase, 'sessions');
    this.indexFile = join(this.codexBase, 'session_index.jsonl');
    this.onChange = onChange;
  }

  start(): void {
    if (!existsSync(this.sessionsDir)) {
      console.log('[CodexWatcher] No .codex/sessions directory found, skipping');
      return;
    }

    this.scan();

    this.watcher = watch(join(this.sessionsDir, '**/*.jsonl'), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
    });

    this.watcher.on('add', () => this.scan());
    this.watcher.on('change', () => this.scan());
    this.watcher.on('unlink', () => this.scan());

    this.scanInterval = setInterval(() => this.scan(), 60_000);

    console.log(`[CodexWatcher] Watching ${this.sessionsDir}`);
  }

  stop(): void {
    this.watcher?.close();
    if (this.scanInterval) clearInterval(this.scanInterval);
  }

  private getThreadNames(): Map<string, string> {
    const names = new Map<string, string>();
    if (!existsSync(this.indexFile)) return names;

    try {
      const content = readFileSync(this.indexFile, 'utf-8');
      for (const line of content.trim().split('\n').filter(Boolean)) {
        try {
          const entry = JSON.parse(line);
          if (entry.id && entry.thread_name) {
            names.set(entry.id, entry.thread_name);
          }
        } catch { /* skip */ }
      }
    } catch { /* file unreadable */ }

    return names;
  }

  private getRunningCodexProcesses(): Set<string> {
    const cwds = new Set<string>();
    try {
      const output = execSync('ps aux', { encoding: 'utf-8', timeout: 5000 });
      for (const line of output.split('\n')) {
        if (!line.includes('codex') || line.includes('grep')) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const pid = parseInt(parts[1], 10);
        if (isNaN(pid)) continue;

        try {
          const lsofOut = execSync(`lsof -p ${pid} -Fn 2>/dev/null | grep '^n/' | head -1`, {
            encoding: 'utf-8',
            timeout: 3000,
          }).trim().replace(/^n/, '');
          if (lsofOut) cwds.add(lsofOut);
        } catch { /* couldn't get CWD */ }
      }
    } catch { /* ps failed */ }
    return cwds;
  }

  private collectSessionFiles(): string[] {
    const files: string[] = [];
    try {
      this.walkDir(this.sessionsDir, files);
    } catch { /* ignore */ }
    return files;
  }

  private walkDir(dir: string, results: string[]): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          this.walkDir(fullPath, results);
        } else if (entry.name.endsWith('.jsonl')) {
          results.push(fullPath);
        }
      }
    } catch { /* skip */ }
  }

  private scan(): void {
    this.projects.clear();

    const sessionFiles = this.collectSessionFiles();
    if (sessionFiles.length === 0) return;

    const threadNames = this.getThreadNames();
    const runningCwds = this.getRunningCodexProcesses();

    const projectSessions = new Map<string, Array<{
      file: string;
      sessionId: string;
      lastActivityMs: number;
    }>>();

    for (const file of sessionFiles) {
      const meta = parseCodexSessionMeta(file);
      if (!meta || !meta.cwd) continue;

      const codexAgeMs = Date.now() - meta.lastActivityMs;
      if (codexAgeMs > MAX_AGE_MS) continue;

      const cwd = meta.cwd;
      if (!projectSessions.has(cwd)) {
        projectSessions.set(cwd, []);
      }
      projectSessions.get(cwd)!.push({
        file,
        sessionId: meta.sessionId,
        lastActivityMs: meta.lastActivityMs,
      });
    }

    for (const [cwd, sessions] of projectSessions) {
      const agents: AgentInfo[] = [];

      for (const session of sessions) {
        const data = parseCodexSessionFile(session.file);
        if (!data) continue;

        const isProcessRunning = Array.from(runningCwds).some(
          runningCwd => cwd.startsWith(runningCwd) || runningCwd.startsWith(cwd)
        );

        let status: AgentStatus;
        if (data.isActive) {
          status = 'working';
        } else if (isProcessRunning) {
          const ageMs = Date.now() - data.lastActivityMs;
          status = ageMs > STALE_THRESHOLD_MS ? 'waiting' : 'working';
        } else {
          const ageMs = Date.now() - data.lastActivityMs;
          status = ageMs < ONE_HOUR_MS ? 'waiting' : 'done';
        }

        const threadName = threadNames.get(data.sessionId);

        agents.push({
          id: `codex-${data.sessionId}`,
          source: 'codex',
          sessionId: data.sessionId,
          status,
          statusSource: 'inferred',
          currentTask: data.latestTask,
          lastAction: data.lastAction,
          lastActivityMs: data.lastActivityMs,
          title: threadName,
          sessionMeta: {
            projectPath: cwd,
            sessionId: data.sessionId,
            cwd,
          },
        });
      }

      if (agents.length === 0) continue;

      const projectName = basename(cwd);
      const normalizedKey = cwd.toLowerCase().replace(/[_\s]/g, '-').replace(/\/+$/, '');

      this.projects.set(normalizedKey, {
        id: `codex-${normalizedKey}`,
        name: projectName,
        path: cwd,
        fileCount: 0,
        agents,
      });
    }

    this.onChange(new Map(this.projects));
    this.installProjectHooks();
  }

  private installProjectHooks(): void {
    if (!this.hooksEnabled()) return;

    for (const [, project] of this.projects) {
      const projectCodexDir = join(project.path, '.codex');
      const hooksJsonPath = join(projectCodexDir, 'hooks.json');

      try {
        if (!existsSync(projectCodexDir)) mkdirSync(projectCodexDir, { recursive: true });
        writeCodexHooksJson(hooksJsonPath);
      } catch { /* skip — directory may not be writable */ }
    }
  }

  private hooksEnabled(): boolean {
    const globalHooksJson = join(homedir(), '.codex', 'hooks.json');
    try {
      const content = readFileSync(globalHooksJson, 'utf-8');
      return content.includes('status-hook.sh');
    } catch { return false; }
  }
}
