import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { parseCodexSessionFile, parseCodexSessionMeta } from '../utils/parseCodexSession';
import { logCaught } from '../log';
import { watchJsonlTree, type JsonlWatch, FALLBACK_SCAN_MS, MISSING_DIR_RETRY_MS } from './fsWatch';
import type { AgentInfo, AgentStatus, ProjectInfo } from '../types';

export type CodexWatcherCallback = (projects: Map<string, ProjectInfo>) => void;

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

export interface CodexWatcherOptions {
  sessionsDir?: string;
  indexFile?: string;
  fallbackScanMs?: number;
  missingDirRetryMs?: number;
}

function stripSlash(path: string): string {
  return path.replace(/\/+$/, '');
}

export class CodexWatcher {
  private sessionsDir: string;
  private indexFile: string;
  private projects = new Map<string, ProjectInfo>();
  private onChange: CodexWatcherCallback;
  private jsonlWatch: JsonlWatch | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private fallbackScanMs: number;
  private missingDirRetryMs: number;

  constructor(onChange: CodexWatcherCallback, options: CodexWatcherOptions = {}) {
    const codexBase = join(homedir(), '.codex');
    this.sessionsDir = options.sessionsDir ?? join(codexBase, 'sessions');
    this.indexFile = options.indexFile ?? join(codexBase, 'session_index.jsonl');
    this.onChange = onChange;
    this.fallbackScanMs = options.fallbackScanMs ?? FALLBACK_SCAN_MS;
    this.missingDirRetryMs = options.missingDirRetryMs ?? MISSING_DIR_RETRY_MS;
  }

  start(): void {
    if (!existsSync(this.sessionsDir)) {
      console.log('[CodexWatcher] No .codex/sessions directory found, will retry');
      this.retryInterval = setInterval(() => {
        if (existsSync(this.sessionsDir)) {
          if (this.retryInterval) clearInterval(this.retryInterval);
          this.retryInterval = null;
          this.arm();
        }
      }, this.missingDirRetryMs);
      this.retryInterval.unref?.();
      return;
    }

    this.arm();
  }

  whenWatching(): Promise<void> {
    return this.jsonlWatch?.ready ?? Promise.resolve();
  }

  stop(): void {
    void this.jsonlWatch?.close();
    this.jsonlWatch = null;
    if (this.scanInterval) clearInterval(this.scanInterval);
    if (this.retryInterval) clearInterval(this.retryInterval);
    this.scanInterval = null;
    this.retryInterval = null;
  }

  private arm(): void {
    this.scan();
    try {
      this.jsonlWatch = watchJsonlTree(this.sessionsDir, () => this.scan(), 'CodexWatcher');
    } catch (err) {
      logCaught('CodexWatcher', err, 'starting file watch');
    }
    this.scanInterval = setInterval(() => this.scan(), this.fallbackScanMs);
    this.scanInterval.unref?.();
    console.log(`[CodexWatcher] Watching ${this.sessionsDir}`);
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
        } catch (err) {
          logCaught('CodexWatcher', err, 'session index line');
        }
      }
    } catch (err) {
      logCaught('CodexWatcher', err, `reading ${this.indexFile}`);
    }

    return names;
  }

  private getRunningCodexCwds(): Set<string> {
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
          if (lsofOut) cwds.add(stripSlash(lsofOut));
        } catch {
          // Process exited or lsof has no cwd.
        }
      }
    } catch (err) {
      logCaught('CodexWatcher', err, 'ps aux');
    }
    return cwds;
  }

  private collectSessionFiles(): string[] {
    const files: string[] = [];
    try {
      this.walkDir(this.sessionsDir, files);
    } catch (err) {
      logCaught('CodexWatcher', err, `walking ${this.sessionsDir}`);
    }
    return files;
  }

  private walkDir(dir: string, results: string[]): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      logCaught('CodexWatcher', err, `reading ${dir}`);
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDir(fullPath, results);
      } else if (entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  }

  private scan(): void {
    this.projects.clear();

    const sessionFiles = this.collectSessionFiles();
    if (sessionFiles.length === 0) {
      this.onChange(new Map());
      return;
    }

    const threadNames = this.getThreadNames();
    const runningCwds = this.getRunningCodexCwds();

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

      const cwd = stripSlash(meta.cwd);
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

        const isProcessRunning = runningCwds.has(stripSlash(cwd));

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
      const normalizedKey = cwd.toLowerCase().replace(/\/+$/, '');

      this.projects.set(normalizedKey, {
        id: `codex-${normalizedKey}`,
        name: projectName,
        path: cwd,
        fileCount: 0,
        agents,
      });
    }

    this.onChange(new Map(this.projects));
  }
}
