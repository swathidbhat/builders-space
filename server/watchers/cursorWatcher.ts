import { readdirSync, existsSync } from 'fs';
import { join, basename, isAbsolute } from 'path';
import { homedir } from 'os';
import { parseTranscriptDir, parseTranscriptFile } from '../utils/parseTranscript';
import { extractProjectName, resolveEncodedProjectPath } from '../utils/projectName';
import { logCaught } from '../log';
import { watchJsonlTree, type JsonlWatch, FALLBACK_SCAN_MS, MISSING_DIR_RETRY_MS } from './fsWatch';
import type { AgentInfo, AgentStatus, ProjectInfo } from '../types';

export type CursorWatcherCallback = (projects: Map<string, ProjectInfo>) => void;

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

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

  constructor(onChange: CursorWatcherCallback, options: CursorWatcherOptions = {}) {
    this.cursorBase = options.base ?? join(homedir(), '.cursor', 'projects');
    this.onChange = onChange;
    this.fallbackScanMs = options.fallbackScanMs ?? FALLBACK_SCAN_MS;
    this.missingDirRetryMs = options.missingDirRetryMs ?? MISSING_DIR_RETRY_MS;
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
      this.jsonlWatch = watchJsonlTree(this.cursorBase, () => this.scan(), 'CursorWatcher');
    } catch (err) {
      logCaught('CursorWatcher', err, 'starting file watch');
    }
    this.scanInterval = setInterval(() => this.scan(), this.fallbackScanMs);
    this.scanInterval.unref?.();
    console.log(`[CursorWatcher] Watching ${this.cursorBase}`);
  }

  private scan(): void {
    this.projects.clear();

    let projectDirs: string[];
    try {
      projectDirs = readdirSync(this.cursorBase, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch (err) {
      logCaught('CursorWatcher', err, `reading ${this.cursorBase}`);
      this.onChange(new Map());
      return;
    }

    for (const dirName of projectDirs) {
      if (/^\d+$/.test(dirName)) continue;

      const encodedPath = join(this.cursorBase, dirName);
      const agents: AgentInfo[] = [];
      let cwdFromSession: string | undefined;

      const transcriptsDir = join(encodedPath, 'agent-transcripts');
      if (existsSync(transcriptsDir)) {
        try {
          const entries = readdirSync(transcriptsDir, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.isDirectory()) {
              const subDir = join(transcriptsDir, entry.name);
              const data = parseTranscriptDir(subDir);
              if (!data) continue;

              const transcriptAgeMs = Date.now() - data.lastActivityMs;
              if (transcriptAgeMs > MAX_AGE_MS) continue;

              const agentId = `cursor-agent-${entry.name}`;
              if (agents.some(a => a.id === agentId)) continue;

              if (data.cwd && isAbsolute(data.cwd)) cwdFromSession = stripSlash(data.cwd);

              let status: AgentStatus;
              if (data.isRecentlyActive) {
                status = 'working';
              } else {
                status = transcriptAgeMs < ONE_HOUR_MS ? 'waiting' : 'done';
              }

              agents.push({
                id: agentId,
                source: 'cursor',
                sessionId: entry.name,
                status,
                statusSource: 'inferred',
                currentTask: data.userQuery,
                lastAction: data.lastAction,
                lastActivityMs: data.lastActivityMs,
                sessionMeta: {
                  projectPath: '',
                  transcriptPath: subDir,
                },
              });
            } else if (entry.name.endsWith('.txt')) {
              const data = parseTranscriptFile(join(transcriptsDir, entry.name));
              if (!data) continue;

              const txtAgeMs = Date.now() - data.lastActivityMs;
              if (txtAgeMs > MAX_AGE_MS) continue;

              const agentId = `cursor-agent-${basename(entry.name, '.txt')}`;
              if (agents.some(a => a.id === agentId)) continue;

              let status: AgentStatus;
              if (data.isRecentlyActive) {
                status = 'working';
              } else {
                status = txtAgeMs < ONE_HOUR_MS ? 'waiting' : 'done';
              }

              agents.push({
                id: agentId,
                source: 'cursor',
                sessionId: basename(entry.name, '.txt'),
                status,
                statusSource: 'inferred',
                currentTask: data.userQuery,
                lastAction: data.lastAction,
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

      const path = cwdFromSession ?? resolveEncodedProjectPath(dirName);
      const name = cwdFromSession ? (basename(path) || extractProjectName(dirName)) : extractProjectName(dirName);

      for (const agent of agents) {
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

    this.onChange(new Map(this.projects));
  }
}
