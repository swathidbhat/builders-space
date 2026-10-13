import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, basename, isAbsolute } from 'path';
import { homedir } from 'os';
import {
  beginCursorParseScan,
  endCursorParseScan,
  parseTranscriptDir,
  parseTranscriptFile,
} from '../utils/parseTranscript';
import { projectLabel, resolveEncodedProject } from '../utils/projectName';
import { logCaught } from '../log';
import {
  watchJsonlTree,
  type FsChange,
  type JsonlWatch,
  FALLBACK_SCAN_MS,
  MISSING_DIR_RETRY_MS,
} from './fsWatch';
import { topDir } from './sessionFiles';
import { CwdCache } from '../process/cwdCache';
import { cursorLiveCwds } from '../process/runningCwds';
import { MAX_SESSION_AGE_MS } from '../../shared/config';
import { inferSessionStatus } from '../../shared/status';
import type { AgentInfo, ProjectInfo } from '../types';

export type CursorWatcherCallback = (projects: Map<string, ProjectInfo>) => void;

export interface CursorWatcherOptions {
  base?: string;
  fallbackScanMs?: number;
  missingDirRetryMs?: number;
}

function stripSlash(path: string): string {
  return path.replace(/\/+$/, '');
}

export class CursorWatcher {
  private cursorBase: string;
  private projects = new Map<string, ProjectInfo>();
  private onChange: CursorWatcherCallback;
  private jsonlWatch: JsonlWatch | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private fallbackScanMs: number;
  private missingDirRetryMs: number;
  private processes: CwdCache;
  private queue: Promise<void> = Promise.resolve();

  constructor(onChange: CursorWatcherCallback, options: CursorWatcherOptions = {}) {
    this.cursorBase = options.base ?? join(homedir(), '.cursor', 'projects');
    this.onChange = onChange;
    this.fallbackScanMs = options.fallbackScanMs ?? FALLBACK_SCAN_MS;
    this.missingDirRetryMs = options.missingDirRetryMs ?? MISSING_DIR_RETRY_MS;
    this.processes = new CwdCache(
      'cursor',
      () => {
        this.enqueue(() => this.scanAll());
      },
      () => cursorLiveCwds(),
    );
  }

  start(): void {
    if (!existsSync(this.cursorBase)) {
      console.log('[CursorWatcher] No .cursor/projects directory found, will retry');
      this.retryInterval = setInterval(() => {
        if (existsSync(this.cursorBase)) {
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
        this.cursorBase,
        (changes) => {
          this.enqueue(() => this.scanChanges(changes));
        },
        'CursorWatcher',
      );
    } catch (err) {
      logCaught('CursorWatcher', err, 'starting file watch');
    }
    this.scanInterval = setInterval(() => {
      this.enqueue(() => this.scanAll());
    }, this.fallbackScanMs);
    this.scanInterval.unref?.();
    console.log(`[CursorWatcher] Watching ${this.cursorBase}`);
  }

  private enqueue(job: () => Promise<void>): void {
    this.queue = this.queue.then(job).catch((err) => logCaught('CursorWatcher', err, 'scan'));
  }

  private async scanAll(): Promise<void> {
    this.projects.clear();
    let projectDirs: string[];
    try {
      projectDirs = (await readdir(this.cursorBase, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch (err) {
      logCaught('CursorWatcher', err, `reading ${this.cursorBase}`);
      this.onChange(new Map());
      return;
    }
    await this.scanProjects(projectDirs, true);
  }

  /** Rescan only the encoded project directories named by the watch events. */
  private async scanChanges(changes: FsChange[]): Promise<void> {
    const dirs = new Set<string>();
    for (const change of changes) {
      const dirName = topDir(this.cursorBase, change.path);
      if (!dirName || /^\d+$/.test(dirName)) continue;
      if (change.event === 'unlinkDir' && change.path === join(this.cursorBase, dirName)) {
        this.projects.delete(dirName);
        continue;
      }
      dirs.add(dirName);
    }
    if (dirs.size === 0) {
      this.onChange(new Map(this.projects));
      return;
    }
    for (const dirName of dirs) this.projects.delete(dirName);
    await this.scanProjects([...dirs], false);
  }

  private async scanProjects(projectDirs: string[], full: boolean): Promise<void> {
    const live = this.processes.current();
    if (full) beginCursorParseScan();
    try {
      await this.readProjectDirs(projectDirs, live);
    } finally {
      if (full) endCursorParseScan();
    }
    this.onChange(new Map(this.projects));
  }

  private async readProjectDirs(projectDirs: string[], live: Set<string>): Promise<void> {
    for (const dirName of projectDirs) {
      if (/^\d+$/.test(dirName)) continue;

      const encodedPath = join(this.cursorBase, dirName);
      const agents: AgentInfo[] = [];
      let cwdFromSession: string | undefined;

      const drafts: Array<{ turnFinished: boolean }> = [];
      const transcriptsDir = join(encodedPath, 'agent-transcripts');
      if (existsSync(transcriptsDir)) {
        try {
          const entries = await readdir(transcriptsDir, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.isDirectory()) {
              const subDir = join(transcriptsDir, entry.name);
              const data = await parseTranscriptDir(subDir);
              if (!data) continue;

              const transcriptAgeMs = Date.now() - data.lastActivityMs;
              if (transcriptAgeMs > MAX_SESSION_AGE_MS) continue;

              const agentId = `cursor-agent-${entry.name}`;
              if (agents.some((a) => a.id === agentId)) continue;

              if (data.cwd && isAbsolute(data.cwd)) cwdFromSession = stripSlash(data.cwd);

              drafts.push({ turnFinished: data.turnFinished });
              agents.push({
                id: agentId,
                source: 'cursor',
                sessionId: entry.name,
                status: 'working',
                statusSource: 'inferred',
                currentTask: data.userQuery,
                lastAction: data.lastAction,
                pendingQuestion: data.pendingQuestion,
                lastActivityMs: data.lastActivityMs,
                sessionMeta: {
                  projectPath: '',
                  transcriptPath: subDir,
                  cwd: data.cwd,
                },
              });
            } else if (entry.name.endsWith('.txt')) {
              const data = await parseTranscriptFile(join(transcriptsDir, entry.name));
              if (!data) continue;

              const txtAgeMs = Date.now() - data.lastActivityMs;
              if (txtAgeMs > MAX_SESSION_AGE_MS) continue;

              const agentId = `cursor-agent-${basename(entry.name, '.txt')}`;
              if (agents.some((a) => a.id === agentId)) continue;

              drafts.push({ turnFinished: data.turnFinished });
              agents.push({
                id: agentId,
                source: 'cursor',
                sessionId: basename(entry.name, '.txt'),
                status: 'working',
                statusSource: 'inferred',
                currentTask: data.userQuery,
                lastAction: data.lastAction,
                pendingQuestion: data.pendingQuestion,
                lastActivityMs: data.lastActivityMs,
                sessionMeta: {
                  projectPath: '',
                  transcriptPath: join(transcriptsDir, entry.name),
                },
              });
            }
          }
        } catch (err) {
          logCaught('CursorWatcher', err, `reading ${transcriptsDir}`);
        }
      }

      if (agents.length === 0) continue;

      const resolved = cwdFromSession
        ? { path: cwdFromSession, matched: true }
        : resolveEncodedProject(dirName);
      const path = resolved.path;
      const name = projectLabel(path, dirName, resolved.matched);
      const processRunning = live.has(path);

      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const cwd = agent.sessionMeta?.cwd;
        agent.status = inferSessionStatus({
          lastActivityMs: agent.lastActivityMs ?? 0,
          processRunning: processRunning || (cwd ? live.has(stripSlash(cwd)) : false),
          turnFinished: drafts[i]?.turnFinished,
        });
        if (agent.sessionMeta) agent.sessionMeta.projectPath = path;
      }

      this.projects.set(dirName, {
        id: `cursor-${dirName}`,
        name,
        path,
        fileCount: 0,
        agents,
      });
    }
  }
}
