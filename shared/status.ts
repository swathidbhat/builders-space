import { ONE_HOUR_MS, RECENT_ACTIVITY_MS } from './config';
import type { AgentStatus } from './types';

export const STATUS_RANK: Record<AgentStatus, number> = {
  error: 0,
  waiting: 1,
  working: 2,
  done: 3,
};

export const STATUS_COLOR: Record<AgentStatus | 'empty', string> = {
  error: '#ff4444',
  waiting: '#ffaa44',
  working: '#44ffaa',
  done: '#6688aa',
  empty: '#444',
};

export type PlanetState = 'active' | 'idle' | 'waiting' | 'error';

export function compareAgentStatus(a: AgentStatus, b: AgentStatus): number {
  return STATUS_RANK[a] - STATUS_RANK[b];
}

/** Highest-priority status across a project's agents. */
export function dominantStatus(agents: Array<{ status: AgentStatus }>): AgentStatus | 'empty' {
  if (agents.length === 0) return 'empty';
  let best: AgentStatus = 'done';
  for (const agent of agents) {
    if (STATUS_RANK[agent.status] < STATUS_RANK[best]) best = agent.status;
  }
  return best;
}

export function projectStatusColor(agents: Array<{ status: AgentStatus }>): string {
  return STATUS_COLOR[dominantStatus(agents)];
}

export function derivePlanetState(project: {
  agents: Array<{ status: AgentStatus }>;
}): PlanetState {
  const status = dominantStatus(project.agents);
  if (status === 'error') return 'error';
  if (status === 'waiting') return 'waiting';
  if (status === 'working') return 'active';
  return 'idle';
}

/**
 * File-scan status shared by Cursor, Claude, and Codex.
 *
 * A recent write is working. "Needs you" (`waiting`) requires a finished turn:
 * the transcript's last message is a completed assistant turn or question, or a
 * hook Stop overlay applied elsewhere. A live process that has not handed the
 * turn back stays working — quiet, possibly still busy. Anything else is done.
 * File age alone is not "needs you".
 */
export function inferSessionStatus(options: {
  lastActivityMs: number;
  now?: number;
  processRunning?: boolean;
  /** Last transcript message is a completed assistant turn or a question. */
  turnFinished?: boolean;
}): AgentStatus {
  const now = options.now ?? Date.now();
  const age = now - options.lastActivityMs;
  if (age < RECENT_ACTIVITY_MS) return 'working';
  if (options.turnFinished) return age < ONE_HOUR_MS ? 'waiting' : 'done';
  if (options.processRunning) return 'working';
  return 'done';
}
