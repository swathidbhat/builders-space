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
  errorReason?: string;
  startedAt?: string;
  elapsedMs?: number;
  /** Epoch ms of the last transcript write or hook event. The UI derives "for 14 min" from this. */
  lastActivityMs?: number;
  /** `now - lastActivityMs` at the moment this state was published. Recompute from `lastActivityMs` if the tab stays open. */
  quietForMs?: number;
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

export interface HumanizeResponse {
  texts: Record<string, string>;
  usedLLM: boolean;
  error?: string;
}
