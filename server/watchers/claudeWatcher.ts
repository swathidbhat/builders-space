import { readdirSync, existsSync } from 'fs';
import { join, basename, isAbsolute } from 'path';
import { homedir } from 'os';
import {
  beginClaudeParseScan,
  endClaudeParseScan,
  parseClaudeSessionFile,
} from '../utils/parseTranscript';
import { extractProjectName, resolveEncodedProjectPath } from '../utils/projectName';
import { logCaught } from '../log';
import { watchJsonlTree, type JsonlWatch, FALLBACK_SCAN_MS, MISSING_DIR_RETRY_MS } from './fsWatch';
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

  constructor(onChange: ClaudeWatcherCallback, options: ClaudeWatcherOptions = {}) {
    this.claudeBase = options.base ?? join(homedir(), '.claude', 'projects');
    this.onChange = onChange;
    this.fallbackScanMs = options.fallbackScanMs ?? FALLBACK_SCAN_MS;
    this.missingDirRetryMs = options.missingDirRetryMs ?? MISSING_DIR_RETRY_MS;
    this.processes = new CwdCache('claude', () => this.scan());
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
    this.scan();
    this.processes.start();
    try {
      this.jsonlWatch = watchJsonlTree(this.claudeBase, () => this.scan(), 'ClaudeWatcher');
    } catch (err) {
      logCaught('ClaudeWatcher', err, 'starting file watch');
    }
    this.scanInterval = setInterval(() => this.scan(), this.fallbackScanMs);
    this.scanInterval.unref?.();
    console.log(`[ClaudeWatcher] Watching ${this.claudeBase}`);
  }

  private scan(): void {
    this.projects.clear();

    let projectDirs: string[];
    try {
      projectDirs = readdirSync(this.claudeBase, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch (err) {
      logCaught('ClaudeWatcher', err, `reading ${this.claudeBase}`);
      this.onChange(new Map());
      return;
    }

    beginClaudeParseScan();
    try {
      this.scanProjects(projectDirs);
    } finally {
      endClaudeParseScan();
    }
  }

  private scanProjects(projectDirs: string[]): void {
    const runningCwds = this.processes.current();

    for (const dirName of projectDirs) {
      const dirPath = join(this.claudeBase, dirName);
      const agents: AgentInfo[] = [];
      let bestSlug: string | undefined;

      let sessionFiles: string[];
      try {
        sessionFiles = readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'));
      } catch (err) {
        logCaught('ClaudeWatcher', err, `reading ${dirPath}`);
        continue;
      }

      for (const file of sessionFiles) {
        const data = parseClaudeSessionFile(join(dirPath, file));
        if (!data) continue;

        const claudeAgeMs = Date.now() - data.lastActivityMs;
        if (claudeAgeMs > MAX_SESSION_AGE_MS) continue;

        if (data.slug) bestSlug = data.slug;

        const projectPath =
          data.cwd && isAbsolute(data.cwd)
            ? stripSlash(data.cwd)
            : resolveEncodedProjectPath(dirName);

        const isProcessRunning = data.cwd ? runningCwds.has(stripSlash(data.cwd)) : false;
        const status = inferSessionStatus({
          lastActivityMs: data.lastActivityMs,
          processRunning: isProcessRunning,
          turnFinished: data.turnFinished,
        });

        agents.push({
          id: `claude-${data.sessionId}`,
          source: 'claude-code',
          sessionId: data.sessionId,
          status,
          statusSource: 'inferred',
          currentTask: data.latestTask,
          lastAction: data.lastAction,
          lastActivityMs: data.lastActivityMs,
          sessionMeta: {
            projectPath,
            sessionId: data.sessionId,
            cwd: data.cwd || projectPath,
          },
        });
      }

      if (agents.length === 0) continue;

      const groups = new Map<string, AgentInfo[]>();
      for (const agent of agents) {
        const key = stripSlash(
          agent.sessionMeta?.projectPath || resolveEncodedProjectPath(dirName),
        );
        const list = groups.get(key) ?? [];
        list.push(agent);
        groups.set(key, list);
      }

      for (const [pathKey, group] of groups) {
        const existing = this.projects.get(pathKey);
        if (existing) {
          existing.agents.push(...group);
          continue;
        }
        let name = basename(pathKey) || extractProjectName(dirName);
        if (GENERIC_DIRS.includes(name)) {
          name = bestSlug ?? name.toLowerCase();
        }
        this.projects.set(pathKey, {
          id: `claude-${pathKey}`,
          name,
          path: pathKey,
          fileCount: 0,
          agents: group,
        });
      }
    }

    this.onChange(new Map(this.projects));
  }
}
