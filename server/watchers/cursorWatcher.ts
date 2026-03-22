import { watch } from 'chokidar';
import { readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { parseTranscriptDir, parseTranscriptFile } from '../utils/parseTranscript';
import { extractProjectName, dirNameToPath } from '../utils/projectName';
import type { AgentInfo, AgentStatus, ProjectInfo } from '../types';

export type CursorWatcherCallback = (projects: Map<string, ProjectInfo>) => void;

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

export class CursorWatcher {
  private cursorBase: string;
  private projects = new Map<string, ProjectInfo>();
  private onChange: CursorWatcherCallback;
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(onChange: CursorWatcherCallback) {
    this.cursorBase = join(homedir(), '.cursor', 'projects');
    this.onChange = onChange;
  }

  start(): void {
    if (!existsSync(this.cursorBase)) {
      console.log('[CursorWatcher] No .cursor/projects directory found, skipping');
      return;
    }

    this.scan();

    this.watcher = watch(join(this.cursorBase, '*/agent-transcripts/**/*.jsonl'), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this.watcher.on('add', () => this.scan());
    this.watcher.on('change', () => this.scan());
    this.watcher.on('unlink', () => this.scan());

    console.log(`[CursorWatcher] Watching ${this.cursorBase}`);
  }

  stop(): void {
    this.watcher?.close();
  }

  private scan(): void {
    this.projects.clear();

    let projectDirs: string[];
    try {
      projectDirs = readdirSync(this.cursorBase, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch {
      return;
    }

    for (const dirName of projectDirs) {
      if (/^\d+$/.test(dirName)) continue;

      const projectPath = join(this.cursorBase, dirName);
      const agents: AgentInfo[] = [];

      const transcriptsDir = join(projectPath, 'agent-transcripts');
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
                  projectPath: dirNameToPath(dirName),
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
                  projectPath: dirNameToPath(dirName),
                  transcriptPath: join(transcriptsDir, entry.name),
                },
              });
            }
          }
        } catch { /* skip */ }
      }

      if (agents.length === 0) continue;

      const name = extractProjectName(dirName);
      const path = dirNameToPath(dirName);

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
