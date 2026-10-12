import { existsSync } from 'fs';
import { join, basename, dirname, isAbsolute } from 'path';
import { homedir } from 'os';
import {
  beginClaudeParseScan,
  endClaudeParseScan,
  parseClaudeSessionFile,
} from '../utils/parseTranscript';
import { extractProjectName, resolveEncodedProjectPath } from '../utils/projectName';
import { logCaught } from '../log';
import {
  watchJsonlTree,
  type FsChange,
  type JsonlWatch,
  FALLBACK_SCAN_MS,
  MISSING_DIR_RETRY_MS,
} from './fsWatch';
import { collectSessionFiles, topDir } from './sessionFiles';
import { CwdCache } from '../process/cwdCache';
import { MAX_SESSION_AGE_MS } from '../../shared/config';
import { inferSessionStatus } from '../../shared/status';
import type { AgentInfo, ProjectInfo } from '../types';

export type ClaudeWatcherCallback = (projects: Map<string, ProjectInfo>) => void;

const GENERIC_DIRS = ['Documents', 'Desktop', 'Downloads', 'home', 'Users'];

export interface ClaudeWatcherOptions {
  base?: string;
  fallbackScanMs?: number;
  missingDirRetryMs?: number;
}

function stripSlash(path: string): string {
  return path.replace(/\/+$/, '');
}

export class ClaudeWatcher {
  private claudeBase: string;
  private projects = new Map<string, ProjectInfo>();
  private onChange: ClaudeWatcherCallback;
  private jsonlWatch: JsonlWatch | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private fallbackScanMs: number;
  private missingDirRetryMs: number;
  private processes: CwdCache;
  private sessions = new Map<string, AgentInfo>();
  private sessionDir = new Map<string, string>();
  private slugs = new Map<string, string>();
  private turns = new Map<string, boolean>();
  private queue: Promise<void> = Promise.resolve();
  /** Directories read while scanning. Tests use this to see that a save does not walk the tree. */
  readonly walked: string[] = [];

  constructor(onChange: ClaudeWatcherCallback, options: ClaudeWatcherOptions = {}) {
    this.claudeBase = options.base ?? join(homedir(), '.claude', 'projects');
    this.onChange = onChange;
    this.fallbackScanMs = options.fallbackScanMs ?? FALLBACK_SCAN_MS;
    this.missingDirRetryMs = options.missingDirRetryMs ?? MISSING_DIR_RETRY_MS;
    this.processes = new CwdCache('claude', () => {
      this.enqueue(() => this.publish());
    });
  }

  start(): void {
    if (!existsSync(this.claudeBase)) {
      console.log('[ClaudeWatcher] No .claude/projects directory found, will retry');
      this.retryInterval = setInterval(() => {
        if (existsSync(this.claudeBase)) {
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
    this.enqueue(() => this.scanAll());
    this.processes.start();
    try {
      this.jsonlWatch = watchJsonlTree(
        this.claudeBase,
        (changes) => {
          this.enqueue(() => this.scanChanges(changes));
        },
        'ClaudeWatcher',
      );
    } catch (err) {
      logCaught('ClaudeWatcher', err, 'starting file watch');
    }
    this.scanInterval = setInterval(() => {
      this.enqueue(() => this.scanAll());
    }, this.fallbackScanMs);
    this.scanInterval.unref?.();
    console.log(`[ClaudeWatcher] Watching ${this.claudeBase}`);
  }

  private enqueue(job: () => void | Promise<void>): void {
    this.queue = this.queue.then(job).catch((err) => logCaught('ClaudeWatcher', err, 'scan'));
  }

  /** Full tree walk. Startup and the fallback interval only. */
  private async scanAll(): Promise<void> {
    this.walked.push(this.claudeBase);
    const files = collectSessionFiles(this.claudeBase, ['.jsonl'], 'ClaudeWatcher');
    const live = new Set(files);
    for (const file of this.sessions.keys()) {
      if (!live.has(file)) this.sessions.delete(file);
    }
    beginClaudeParseScan();
    try {
      for (const file of files) await this.ingest(file);
    } finally {
      endClaudeParseScan();
    }
    this.publish();
  }

  /** Update the files the watch already named. Does not reread sibling projects. */
  private async scanChanges(changes: FsChange[]): Promise<void> {
    const dirs = new Set<string>();
    for (const change of changes) {
      if (change.event === 'unlink' || change.event === 'unlinkDir') {
        this.forget(change.path);
        continue;
      }
      const dirName = topDir(this.claudeBase, change.path);
      if (dirName) dirs.add(dirName);
    }
    for (const dirName of dirs) {
      const dirPath = join(this.claudeBase, dirName);
      this.walked.push(dirPath);
      for (const file of this.sessions.keys()) {
        if (dirname(file) === dirPath) this.sessions.delete(file);
      }
      for (const file of collectSessionFiles(dirPath, ['.jsonl'], 'ClaudeWatcher')) {
        await this.ingest(file);
      }
    }
    this.publish();
  }

  private forget(target: string): void {
    for (const file of [...this.sessions.keys()]) {
      if (file === target || file.startsWith(`${target}/`)) {
        this.sessions.delete(file);
        this.sessionDir.delete(file);
        this.slugs.delete(file);
        this.turns.delete(file);
      }
    }
  }

  private async ingest(file: string): Promise<void> {
    const dirName = basename(dirname(file));
    const data = await parseClaudeSessionFile(file);
    if (!data || Date.now() - data.lastActivityMs > MAX_SESSION_AGE_MS) {
      this.sessions.delete(file);
      return;
    }
    if (data.slug) this.slugs.set(file, data.slug);
    this.turns.set(file, data.turnFinished);
    const projectPath =
      data.cwd && isAbsolute(data.cwd) ? stripSlash(data.cwd) : resolveEncodedProjectPath(dirName);
    this.sessionDir.set(file, dirName);
    this.sessions.set(file, {
      id: `claude-${data.sessionId}`,
      source: 'claude-code',
      sessionId: data.sessionId,
      status: 'working',
      statusSource: 'inferred',
      currentTask: data.latestTask,
      lastAction: data.lastAction,
      pendingQuestion: data.pendingQuestion,
      lastActivityMs: data.lastActivityMs,
      sessionMeta: {
        projectPath,
        sessionId: data.sessionId,
        cwd: data.cwd || projectPath,
      },
    });
  }

  private publish(): void {
    const runningCwds = this.processes.current();
    this.projects.clear();
    const slugByPath = new Map<string, string>();

    for (const [file, stored] of this.sessions) {
      const projectPath = stripSlash(
        stored.sessionMeta?.projectPath ||
          resolveEncodedProjectPath(this.sessionDir.get(file) || ''),
      );
      const cwd = stored.sessionMeta?.cwd;
      const agent: AgentInfo = {
        ...stored,
        status: inferSessionStatus({
          lastActivityMs: stored.lastActivityMs ?? 0,
          processRunning: cwd ? runningCwds.has(stripSlash(cwd)) : false,
          turnFinished: this.turns.get(file),
        }),
        sessionMeta: stored.sessionMeta
          ? { ...stored.sessionMeta, projectPath }
          : stored.sessionMeta,
      };
      const slug = this.slugs.get(file);
      if (slug) slugByPath.set(projectPath, slug);
      const existing = this.projects.get(projectPath);
      if (existing) {
        existing.agents.push(agent);
        continue;
      }
      const dirName = this.sessionDir.get(file) || '';
      let name = basename(projectPath) || extractProjectName(dirName);
      if (GENERIC_DIRS.includes(name)) name = slug ?? name.toLowerCase();
      this.projects.set(projectPath, {
        id: `claude-${projectPath}`,
        name,
        path: projectPath,
        fileCount: 0,
        agents: [agent],
      });
    }

    for (const [pathKey, project] of this.projects) {
      if (!GENERIC_DIRS.includes(project.name)) continue;
      const slug = slugByPath.get(pathKey);
      if (slug) project.name = slug;
    }

    this.onChange(new Map(this.projects));
  }
}
