import { EventEmitter } from 'events';
import type { SpaceData, ProjectInfo, AgentSource, AgentStatus, AgentInfo } from './types';
import { HOOK_ACTIVE_TTL_MS, HOOK_TERMINAL_TTL_MS } from '../shared/config';
import { hookEntryExpired, loadHookRuntime, saveHookRuntime } from './hookRuntimeStore';
import { logCaught } from './log';
import { projectKey } from './projectKey';

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

export interface StateManagerOptions {
  /** When set, hook overlays are reloaded from this file and written back with their TTL. */
  runtimeFile?: string;
}

export class StateManager extends EventEmitter {
  private cursorProjects = new Map<string, ProjectInfo>();
  private claudeProjects = new Map<string, ProjectInfo>();
  private codexProjects = new Map<string, ProjectInfo>();
  private hookRuntimeByKey = new Map<string, HookRuntimeEntry>();
  private state: SpaceData = { projects: [], lastUpdated: Date.now() };
  private publishedProjects = '';
  private runtimeFile?: string;

  constructor(options: StateManagerOptions = {}) {
    super();
    this.runtimeFile = options.runtimeFile;
    if (!this.runtimeFile) return;
    const loaded = loadHookRuntime(this.runtimeFile);
    for (const entry of loaded.entries) {
      const cwd = normalizeCwd(entry.cwd);
      const stored = cwd === entry.cwd ? entry : { ...entry, cwd };
      this.hookRuntimeByKey.set(makeAgentKey(stored.source, stored.sessionId, stored.cwd), stored);
    }
    if (loaded.dropped) this.persistRuntime();
  }

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
    this.persistRuntime();
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
    this.persistRuntime();
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
    let expired = false;
    for (const [key, entry] of this.hookRuntimeByKey) {
      if (hookEntryExpired(entry, now)) {
        this.hookRuntimeByKey.delete(key);
        expired = true;
      }
    }
    if (expired) this.persistRuntime();

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

    const publishedAt = Date.now();
    for (const project of projects) {
      for (const agent of project.agents) {
        if (typeof agent.lastActivityMs === 'number') {
          agent.quietForMs = Math.max(0, publishedAt - agent.lastActivityMs);
        }
      }
    }

    this.state = {
      projects,
      lastUpdated: publishedAt,
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

    const normalizedPath = projectKey(projectPath);
    for (const entry of this.hookRuntimeByKey.values()) {
      if (entry.sessionId) continue;
      if (entry.source === agent.source && entry.cwd && projectKey(entry.cwd) === normalizedPath) {
        return entry;
      }
    }

    return undefined;
  }

  private normalizeKey(path: string): string {
    return projectKey(path);
  }

  private persistRuntime(): void {
    if (!this.runtimeFile) return;
    try {
      saveHookRuntime(this.runtimeFile, [...this.hookRuntimeByKey.values()]);
    } catch (err) {
      logCaught('hookRuntime', err, this.runtimeFile);
    }
  }
}
