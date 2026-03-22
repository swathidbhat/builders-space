import { watch } from 'chokidar';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { parseClaudeSessionFile } from '../utils/parseTranscript';
import { extractProjectName, dirNameToPath } from '../utils/projectName';
import type { AgentInfo, AgentStatus, ProjectInfo } from '../types';

export type ClaudeWatcherCallback = (projects: Map<string, ProjectInfo>) => void;

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

export class ClaudeWatcher {
  private claudeBase: string;
  private projects = new Map<string, ProjectInfo>();
  private onChange: ClaudeWatcherCallback;
  private watcher: ReturnType<typeof watch> | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;

  constructor(onChange: ClaudeWatcherCallback) {
    this.claudeBase = join(homedir(), '.claude', 'projects');
    this.onChange = onChange;
  }

  start(): void {
    if (!existsSync(this.claudeBase)) {
      console.log('[ClaudeWatcher] No .claude/projects directory found, skipping');
      return;
    }

    this.scan();

    this.watcher = watch(join(this.claudeBase, '*/*.jsonl'), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
    });

    this.watcher.on('add', () => this.scan());
    this.watcher.on('change', () => this.scan());
    this.watcher.on('unlink', () => this.scan());

    this.scanInterval = setInterval(() => this.scan(), 60_000);

    console.log(`[ClaudeWatcher] Watching ${this.claudeBase}`);
  }

  stop(): void {
    this.watcher?.close();
    if (this.scanInterval) clearInterval(this.scanInterval);
  }

  private getRunningClaudeProcesses(): Map<string, number> {
    const cwdToPid = new Map<string, number>();
    try {
      const output = execSync('ps aux', { encoding: 'utf-8', timeout: 5000 });
      const lines = output.split('\n');
      for (const line of lines) {
        if (!line.includes('claude') || line.includes('grep')) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const pid = parseInt(parts[1], 10);
        if (isNaN(pid)) continue;

        try {
          const cwd = execSync(`lsof -p ${pid} -Fn 2>/dev/null | grep '^n/' | head -1`, {
            encoding: 'utf-8',
            timeout: 3000,
          }).trim().replace(/^n/, '');
          if (cwd) cwdToPid.set(cwd, pid);
        } catch { /* couldn't get CWD */ }
      }
    } catch { /* ps failed */ }
    return cwdToPid;
  }

  private scan(): void {
    this.projects.clear();

    let projectDirs: string[];
    try {
      projectDirs = readdirSync(this.claudeBase, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch {
      return;
    }

    const runningProcesses = this.getRunningClaudeProcesses();

    const GENERIC_DIRS = ['Documents', 'Desktop', 'Downloads', 'home', 'Users'];

    for (const dirName of projectDirs) {
      const projectPath = join(this.claudeBase, dirName);
      const agents: AgentInfo[] = [];
      let bestSlug: string | undefined;

      try {
        const sessionFiles = readdirSync(projectPath).filter(f => f.endsWith('.jsonl'));
        for (const file of sessionFiles) {
          const data = parseClaudeSessionFile(join(projectPath, file));
          if (!data) continue;

          const claudeAgeMs = Date.now() - data.lastActivityMs;
          if (claudeAgeMs > MAX_AGE_MS) continue;

          if (data.slug) bestSlug = data.slug;

          const isProcessRunning = Array.from(runningProcesses.entries()).some(
            ([cwd]) => data.cwd && cwd.startsWith(data.cwd)
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
              projectPath: dirNameToPath(dirName),
              sessionId: data.sessionId,
              cwd: data.cwd,
            },
          });
        }
      } catch {
        continue;
      }

      if (agents.length === 0) continue;

      let name = extractProjectName(dirName);
      if (GENERIC_DIRS.includes(name)) {
        name = bestSlug ?? name.toLowerCase();
      }
      const path = dirNameToPath(dirName);

      this.projects.set(dirName, {
        id: `claude-${dirName}`,
        name,
        path,
        fileCount: 0,
        agents,
      });
    }

    this.onChange(new Map(this.projects));
  }
}
