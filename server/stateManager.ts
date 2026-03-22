import { EventEmitter } from 'events';
import type { SpaceData, ProjectInfo, AgentSource, AgentStatus } from './types';

export const HOOK_ACTIVE_TTL_MS = 600_000;    // 10 minutes — non-terminal states
export const HOOK_TERMINAL_TTL_MS = 3_600_000; // 1 hour — terminal states

export interface HookRuntimeEntry {
  source: AgentSource;
  sessionId: string;
  cwd?: string;
  status: AgentStatus;
  lastAction?: string;
  errorReason?: string;
  lastEventAt: number;
  terminal: boolean;
  /** All hook overlays use realtime authority (including Cursor lifecycle hooks). */
  mode: 'realtime';
}

export function makeAgentKey(source: AgentSource, sessionId: string, cwd?: string): string {
  return `${source}::${sessionId}::${cwd ?? ''}`;
}

export class StateManager extends EventEmitter {
  private cursorProjects = new Map<string, ProjectInfo>();
  private claudeProjects = new Map<string, ProjectInfo>();
  private codexProjects = new Map<string, ProjectInfo>();
  private hookRuntimeByKey = new Map<string, HookRuntimeEntry>();
  private state: SpaceData = { projects: [], lastUpdated: Date.now() };

  updateCursorProjects(projects: Map<string, ProjectInfo>): void {
    this.cursorProjects = projects;
    this.rebuild();
  }

  updateClaudeProjects(projects: Map<string, ProjectInfo>): void {
    this.claudeProjects = projects;
    this.rebuild();
  }

  updateCodexProjects(projects: Map<string, ProjectInfo>): void {
    this.codexProjects = projects;
    this.rebuild();
  }

  getState(): SpaceData {
    return this.state;
  }

  applyHookOverlay(entry: HookRuntimeEntry): void {
    const key = makeAgentKey(entry.source, entry.sessionId, entry.cwd);
    this.hookRuntimeByKey.set(key, entry);
    this.rebuild();
  }

  clearHookRuntimeForSources(sources: AgentSource[]): void {
    if (sources.length === 0) return;
    const sourceSet = new Set(sources);
    for (const [key, entry] of this.hookRuntimeByKey) {
      if (sourceSet.has(entry.source)) {
        this.hookRuntimeByKey.delete(key);
      }
    }
    this.rebuild();
  }

  private rebuild(): void {
    const now = Date.now();

    // Step 1: Merge watcher project maps
    const merged = new Map<string, ProjectInfo>();

    for (const [_key, project] of this.cursorProjects) {
      merged.set(this.normalizeKey(project.path), { ...project, agents: [...project.agents] });
    }

    for (const [_key, project] of this.claudeProjects) {
      const normalizedKey = this.normalizeKey(project.path);
      const existing = merged.get(normalizedKey);
      if (existing) {
        existing.agents = [...existing.agents, ...project.agents];
      } else {
        merged.set(normalizedKey, { ...project, agents: [...project.agents] });
      }
    }

    for (const [_key, project] of this.codexProjects) {
      const normalizedKey = this.normalizeKey(project.path);
      const existing = merged.get(normalizedKey);
      if (existing) {
        existing.agents = [...existing.agents, ...project.agents];
      } else {
        merged.set(normalizedKey, { ...project, agents: [...project.agents] });
      }
    }

    // Step 2: Prune expired hook overlay entries
    for (const [key, entry] of this.hookRuntimeByKey) {
      const age = now - entry.lastEventAt;
      const ttl = entry.terminal ? HOOK_TERMINAL_TTL_MS : HOOK_ACTIVE_TTL_MS;
      if (age > ttl) {
        this.hookRuntimeByKey.delete(key);
      }
    }

    // Steps 3–6: For each agent, find and apply matching overlay
    const projects = Array.from(merged.values());

    for (const project of projects) {
      for (let i = 0; i < project.agents.length; i++) {
        const agent = { ...project.agents[i] };
        project.agents[i] = agent;

        const overlay = this.findOverlayForAgent(agent, project.path);

        if (overlay) {
          agent.statusSource = 'realtime';
          agent.status = overlay.status;
          agent.errorReason = overlay.errorReason;
          agent.lastActivityMs = overlay.lastEventAt;
          if (overlay.lastAction) {
            agent.lastAction = overlay.lastAction;
          }
        } else {
          agent.statusSource = 'inferred';
        }
      }
    }

    // Step 7: Emit
    this.state = {
      projects,
      lastUpdated: Date.now(),
    };

    this.emit('change', this.state);
  }

  private findOverlayForAgent(
    agent: { source: AgentSource; sessionId: string },
    projectPath: string,
  ): HookRuntimeEntry | undefined {
    // Tier 1: exact source + sessionId
    if (agent.sessionId) {
      for (const entry of this.hookRuntimeByKey.values()) {
        if (entry.source === agent.source && entry.sessionId === agent.sessionId) {
          return entry;
        }
      }
    }

    // Tier 2: exact source + cwd (case-insensitive path match)
    const normalizedPath = projectPath.toLowerCase();
    for (const entry of this.hookRuntimeByKey.values()) {
      if (
        entry.source === agent.source &&
        entry.cwd &&
        entry.cwd.toLowerCase() === normalizedPath
      ) {
        return entry;
      }
    }

    return undefined;
  }

  private normalizeKey(path: string): string {
    return path.toLowerCase().replace(/[_\s]/g, '-').replace(/\/+$/, '');
  }
}
