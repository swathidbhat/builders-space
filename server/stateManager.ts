import { EventEmitter } from 'events';
import type { SpaceData, ProjectInfo, AgentSource, AgentStatus, AgentInfo } from './types';
import { HOOK_ACTIVE_TTL_MS, HOOK_TERMINAL_TTL_MS } from '../shared/config';

export { HOOK_ACTIVE_TTL_MS, HOOK_TERMINAL_TTL_MS };

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

export function normalizeCwd(cwd: string | undefined): string | undefined {
  if (!cwd) return cwd;
  const stripped = cwd.replace(/\/+$/, '');
  return stripped.length > 0 ? stripped : '/';
}

export function makeAgentKey(source: AgentSource, sessionId: string, cwd?: string): string {
  return `${source}::${sessionId}::${normalizeCwd(cwd) ?? ''}`;
}

export class StateManager extends EventEmitter {
  private cursorProjects = new Map<string, ProjectInfo>();
  private claudeProjects = new Map<string, ProjectInfo>();
  private codexProjects = new Map<string, ProjectInfo>();
  private hookRuntimeByKey = new Map<string, HookRuntimeEntry>();
  private state: SpaceData = { projects: [], lastUpdated: Date.now() };
  private publishedProjects = '';

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

  findAgentById(agentId: string): AgentInfo | undefined {
    for (const project of this.state.projects) {
      const agent = project.agents.find((candidate) => candidate.id === agentId);
      if (agent) return agent;
    }
    return undefined;
  }

  applyHookOverlay(entry: HookRuntimeEntry): void {
    const cwd = normalizeCwd(entry.cwd);
    const stored = cwd === entry.cwd ? entry : { ...entry, cwd };
    const key = makeAgentKey(stored.source, stored.sessionId, stored.cwd);
    const existing = this.hookRuntimeByKey.get(key);
    if (existing && existing.lastEventAt > stored.lastEventAt) return;
    this.hookRuntimeByKey.set(key, stored);
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

    for (const project of this.cursorProjects.values()) {
      merged.set(this.normalizeKey(project.path), { ...project, agents: [...project.agents] });
    }

    for (const project of this.claudeProjects.values()) {
      const normalizedKey = this.normalizeKey(project.path);
      const existing = merged.get(normalizedKey);
      if (existing) {
        existing.agents = [...existing.agents, ...project.agents];
      } else {
        merged.set(normalizedKey, { ...project, agents: [...project.agents] });
      }
    }

    for (const project of this.codexProjects.values()) {
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

        const overlay = this.findOverlayForAgent(agent, project.path, project.agents);

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

    const signature = JSON.stringify(projects);
    if (signature === this.publishedProjects) return;
    this.publishedProjects = signature;

    this.state = {
      projects,
      lastUpdated: Date.now(),
    };

    this.emit('change', this.state);
  }

  private findOverlayForAgent(
    agent: { source: AgentSource; sessionId: string },
    projectPath: string,
    siblings: { source: AgentSource; sessionId: string }[],
  ): HookRuntimeEntry | undefined {
    // Match a session's own events only. Another session in the same project
    // must not inherit this status.
    if (agent.sessionId) {
      let best: HookRuntimeEntry | undefined;
      for (const entry of this.hookRuntimeByKey.values()) {
        if (entry.source !== agent.source || entry.sessionId !== agent.sessionId) continue;
        if (!best || entry.lastEventAt >= best.lastEventAt) best = entry;
      }
      if (best) return best;
    }

    // Events with no session id can apply only when this project has a single
    // agent of that source. Otherwise we cannot tell who they belong to.
    const sameSource = siblings.filter((candidate) => candidate.source === agent.source);
    if (sameSource.length !== 1) return undefined;

    const normalizedPath = projectPath.toLowerCase().replace(/\/+$/, '');
    for (const entry of this.hookRuntimeByKey.values()) {
      if (entry.sessionId) continue;
      if (
        entry.source === agent.source &&
        entry.cwd &&
        entry.cwd.toLowerCase().replace(/\/+$/, '') === normalizedPath
      ) {
        return entry;
      }
    }

    return undefined;
  }

  private normalizeKey(path: string): string {
    return path.toLowerCase().replace(/\/+$/, '');
  }
}
