import { existsSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import {
  beginCodexParseScan,
  endCodexParseScan,
  parseCodexSessionFile,
  parseCodexSessionMeta,
} from '../utils/parseCodexSession';
import { logCaught } from '../log';
import { projectKey } from '../projectKey';
import {
  watchJsonlTree,
  type FsChange,
  type JsonlWatch,
  FALLBACK_SCAN_MS,
  MISSING_DIR_RETRY_MS,
} from './fsWatch';
import { collectSessionFiles } from './sessionFiles';
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
  private held = new Map<string, { cwd: string; turnFinished: boolean; agent: AgentInfo }>();
  private queue: Promise<void> = Promise.resolve();

  constructor(onChange: CodexWatcherCallback, options: CodexWatcherOptions = {}) {
    const codexBase = join(homedir(), '.codex');
    this.sessionsDir = options.sessionsDir ?? join(codexBase, 'sessions');
    this.indexFile = options.indexFile ?? join(codexBase, 'session_index.jsonl');
    this.onChange = onChange;
    this.fallbackScanMs = options.fallbackScanMs ?? FALLBACK_SCAN_MS;
    this.missingDirRetryMs = options.missingDirRetryMs ?? MISSING_DIR_RETRY_MS;
    this.processes = new CwdCache('codex', () => {
      this.enqueue(() => this.publish());
    });
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
    return Promise.all([this.queue, this.jsonlWatch?.ready ?? Promise.resolve()]).then(
      () => undefined,
    );
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
    this.enqueue(() => this.scanAll());
    this.processes.start();
    try {
      this.jsonlWatch = watchJsonlTree(
        this.sessionsDir,
        (changes) => {
          this.enqueue(() => this.scanChanges(changes));
        },
        'CodexWatcher',
      );
    } catch (err) {
      logCaught('CodexWatcher', err, 'starting file watch');
    }
    this.scanInterval = setInterval(() => {
      this.enqueue(() => this.scanAll());
    }, this.fallbackScanMs);
    this.scanInterval.unref?.();
    console.log(`[CodexWatcher] Watching ${this.sessionsDir}`);
  }

  private enqueue(job: () => Promise<void>): void {
    this.queue = this.queue.then(job).catch((err) => logCaught('CodexWatcher', err, 'scan'));
  }

  private async getThreadNames(): Promise<Map<string, string>> {
    if (!existsSync(this.indexFile)) return new Map();
    const names = await foldAppendOnly(
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

  private async scanAll(): Promise<void> {
    const files = collectSessionFiles(this.sessionsDir, ['.jsonl'], 'CodexWatcher');
    const live = new Set(files);
    for (const file of [...this.held.keys()]) {
      if (!live.has(file)) this.held.delete(file);
    }
    beginCodexParseScan();
    try {
      for (const file of files) await this.ingest(file);
    } finally {
      endCodexParseScan();
    }
    await this.publish();
  }

  private async scanChanges(changes: FsChange[]): Promise<void> {
    for (const change of changes) {
      if (change.event === 'unlink' || change.event === 'unlinkDir') {
        for (const file of [...this.held.keys()]) {
          if (file === change.path || file.startsWith(`${change.path}/`)) this.held.delete(file);
        }
        continue;
      }
      if (change.event === 'addDir') {
        for (const file of collectSessionFiles(change.path, ['.jsonl'], 'CodexWatcher')) {
          await this.ingest(file);
        }
        continue;
      }
      if (change.path.endsWith('.jsonl')) await this.ingest(change.path);
    }
    await this.publish();
  }

  private async ingest(file: string): Promise<void> {
    const meta = parseCodexSessionMeta(file);
    if (!meta?.cwd || Date.now() - meta.lastActivityMs > MAX_SESSION_AGE_MS) {
      this.held.delete(file);
      return;
    }
    const data = await parseCodexSessionFile(file);
    if (!data) {
      this.held.delete(file);
      return;
    }
    const cwd = stripSlash(meta.cwd);
    this.held.set(file, {
      cwd,
      turnFinished: data.turnFinished,
      agent: {
        id: `codex-${data.sessionId}`,
        source: 'codex',
        sessionId: data.sessionId,
        status: 'working',
        statusSource: 'inferred',
        currentTask: data.latestTask,
        lastAction: data.lastAction,
        pendingQuestion: data.pendingQuestion,
        lastActivityMs: data.lastActivityMs,
        sessionMeta: { projectPath: cwd, sessionId: data.sessionId, cwd },
      },
    });
  }

  private async publish(): Promise<void> {
    const threadNames = await this.getThreadNames();
    const runningCwds = this.processes.current();
    this.projects.clear();

    for (const held of this.held.values()) {
      const agent: AgentInfo = {
        ...held.agent,
        title: threadNames.get(held.agent.sessionId),
        status: inferSessionStatus({
          lastActivityMs: held.agent.lastActivityMs ?? 0,
          processRunning: runningCwds.has(held.cwd),
          turnFinished: held.turnFinished,
        }),
      };
      const key = projectKey(held.cwd);
      const existing = this.projects.get(key);
      if (existing) {
        existing.agents.push(agent);
        continue;
      }
      this.projects.set(key, {
        id: `codex-${key}`,
        name: basename(held.cwd),
        path: held.cwd,
        fileCount: 0,
        agents: [agent],
      });
    }

    this.onChange(new Map(this.projects));
  }
}
