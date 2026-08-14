export type AgentSource = 'cursor' | 'claude-code' | 'codex';

export type AgentStatus = 'working' | 'waiting' | 'done' | 'error';

export type AgentStatusSource = 'realtime' | 'inferred';

export interface SessionMeta {
  projectPath: string;
  transcriptPath?: string;
  sessionId?: string;
  cwd?: string;
}

export interface AgentInfo {
  id: string;
  source: AgentSource;
  sessionId: string;
  status: AgentStatus;
  statusSource?: AgentStatusSource;
  currentTask?: string;
  lastAction?: string;
  /** What the agent is asking you, when it is waiting rather than working. */
  question?: string;
  errorReason?: string;
  startedAt?: string;
  elapsedMs?: number;
  lastActivityMs?: number;
  title?: string;
  sessionMeta?: SessionMeta;
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  fileCount: number;
  agents: AgentInfo[];
}

export interface SpaceData {
  projects: ProjectInfo[];
  lastUpdated: number;
}

/** One agent's own contribution to its party's goal. */
export interface AgentIntent {
  id: string;
  intent: string;
  /** What you must now decide, inferred from the agent's last message. */
  decision: string;
}

/** Agents working toward the same outcome, under one shared goal. */
export interface AgentParty {
  id: string;
  goal: string;
  members: AgentIntent[];
}

/**
 * What the briefing is allowed to see. Deliberately narrow: this shape is the
 * cache key, so a volatile field here would bill a call on every socket tick.
 * `question` rides along only for agents that have actually stopped, where it
 * is fixed for as long as they wait.
 */
export interface BriefingAgentInput {
  id: string;
  task?: string;
  /** A stalled agent's last message, so the decision in it can be named. */
  question?: string;
}

/** Empty `parties` means nothing is known — there is no coarse second answer. */
export interface BriefingResponse {
  parties: AgentParty[];
}
