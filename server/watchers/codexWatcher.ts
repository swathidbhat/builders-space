import { readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import {
  beginCodexParseScan,
  endCodexParseScan,
  parseCodexSessionFile,
  parseCodexSessionMeta,
} from '../utils/parseCodexSession';
import { logCaught } from '../log';
import { watchJsonlTree, type JsonlWatch, FALLBACK_SCAN_MS, MISSING_DIR_RETRY_MS } from './fsWatch';
import { CwdCache } from '../process/cwdCache';
import { foldAppendOnly, type FoldCache } from '../io/incrementalRead';
import { parseIndexLine } from '../schema/sessionLog';
import { MAX_SESSION_AGE_MS } from '../../shared/config';
import { inferSessionStatus } from '../../shared/status';
import type { AgentInfo, ProjectInfo } from '../types';

export type CodexWatcherCallback = (projects: Map<string, ProjectInfo>) => void;

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
  private processes: CwdCache;
  private indexCache = new Map<string, FoldCache<Map<string, string>>>();

  constructor(onChange: CodexWatcherCallback, options: CodexWatcherOptions = {}) {
    const codexBase = join(homedir(), '.codex');
    this.sessionsDir = options.sessionsDir ?? join(codexBase, 'sessions');
    this.indexFile = options.indexFile ?? join(codexBase, 'session_index.jsonl');
    this.onChange = onChange;
    this.fallbackScanMs = options.fallbackScanMs ?? FALLBACK_SCAN_MS;
    this.missingDirRetryMs = options.missingDirRetryMs ?? MISSING_DIR_RETRY_MS;
    this.processes = new CwdCache('codex', () => this.scan());
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
    this.processes.stop();
    void this.jsonlWatch?.close();
    this.jsonlWatch = null;
    if (this.scanInterval) clearInterval(this.scanInterval);
    if (this.retryInterval) clearInterval(this.retryInterval);
    this.scanInterval = null;
    this.retryInterval = null;
  }

  private arm(): void {
    this.scan();
    this.processes.start();
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
    if (!existsSync(this.indexFile)) return new Map();
    const names = foldAppendOnly(
      this.indexFile,
      this.indexCache,
      () => new Map<string, string>(),
      (fold, line) => {
        try {
          const entry = parseIndexLine(JSON.parse(line));
          if (entry) fold.set(entry.id, entry.thread_name);
        } catch (err) {
          logCaught('CodexWatcher', err, 'session index line');
        }
      },
    );
    return names ?? new Map();
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
    beginCodexParseScan();
    try {
      if (sessionFiles.length === 0) {
        this.onChange(new Map());
        return;
      }
      this.scanSessions(sessionFiles);
    } finally {
      endCodexParseScan();
    }
  }

  private scanSessions(sessionFiles: string[]): void {
    const threadNames = this.getThreadNames();
    const runningCwds = this.processes.current();

    const projectSessions = new Map<
      string,
      Array<{
        file: string;
        sessionId: string;
        lastActivityMs: number;
      }>
    >();

    for (const file of sessionFiles) {
      const meta = parseCodexSessionMeta(file);
      if (!meta || !meta.cwd) continue;

      const codexAgeMs = Date.now() - meta.lastActivityMs;
      if (codexAgeMs > MAX_SESSION_AGE_MS) continue;

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

        const status = inferSessionStatus({
          lastActivityMs: data.lastActivityMs,
          processRunning: runningCwds.has(stripSlash(cwd)),
          turnFinished: data.turnFinished,
        });

        const threadName = threadNames.get(data.sessionId);

        agents.push({
          id: `codex-${data.sessionId}`,
          source: 'codex',
          sessionId: data.sessionId,
          status,
          statusSource: 'inferred',
          currentTask: data.latestTask,
          lastAction: data.lastAction,
          pendingQuestion: data.pendingQuestion,
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
