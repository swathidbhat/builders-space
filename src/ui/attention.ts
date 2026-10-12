import { dominantStatus, STATUS_RANK } from '../../shared/status';
import type { AgentInfo, AgentSource, ProjectInfo } from '../types';

const SOURCE_LABELS: Record<AgentSource, string> = {
  'claude-code': 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
};

export function quietMs(
  agent: { lastActivityMs?: number; quietForMs?: number },
  now = Date.now(),
): number {
  if (typeof agent.lastActivityMs === 'number') return Math.max(0, now - agent.lastActivityMs);
  if (typeof agent.quietForMs === 'number') return Math.max(0, agent.quietForMs);
  return 0;
}

/** A waiting question longer than this is clamped, with the rest behind Show more. */
export const QUESTION_CLAMP_CHARS = 140;

export function questionOverflows(text: string): boolean {
  return text.includes('\n') || text.trim().length > QUESTION_CLAMP_CHARS;
}

export interface ActivityClock {
  /** The socket is down, so ages are last-known and must not read as live. */
  disconnected?: boolean;
  /** Epoch ms of the last snapshot. Shown as "as of 4:52" while disconnected. */
  asOfMs?: number;
}

/** Local time, hour unpadded, so 4:52 stays 4:52. */
export function formatAsOf(ms: number): string {
  const date = new Date(ms);
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `as of ${date.getHours()}:${minutes}`;
}

/**
 * "quiet for N min" once a minute has passed, otherwise the last-activity line.
 * While disconnected, a fresh stamp is "as of H:MM" and never "just now".
 */
export function activityPhrase(
  agent: { lastActivityMs?: number; quietForMs?: number },
  now = Date.now(),
  clock?: ActivityClock,
): string | null {
  const hasStamp = typeof agent.lastActivityMs === 'number' || typeof agent.quietForMs === 'number';
  const asOf =
    clock?.disconnected && typeof clock.asOfMs === 'number' ? formatAsOf(clock.asOfMs) : null;
  if (!hasStamp) return asOf;
  const minutes = Math.floor(quietMs(agent, now) / 60_000);
  const quiet = minutes >= 1 ? `quiet for ${minutes} min` : null;
  if (clock?.disconnected) {
    if (quiet && asOf) return `${quiet} · ${asOf}`;
    return quiet ?? asOf;
  }
  return quiet ?? 'last activity just now';
}

export function agentTask(agent: AgentInfo): string {
  const task = agent.currentTask?.trim() || agent.title?.trim();
  if (task) return task;
  return SOURCE_LABELS[agent.source] || agent.source;
}

export function attentionDetail(agent: AgentInfo): string {
  if (agent.status === 'error') {
    return agent.errorReason?.trim() || agent.lastAction?.trim() || 'Error';
  }
  if (agent.status === 'waiting') {
    return agent.pendingQuestion?.trim() || 'Needs you';
  }
  return (
    agent.currentTask?.trim() || agent.lastAction?.trim() || agent.title?.trim() || 'Needs you'
  );
}

export interface AttentionRow {
  projectId: string;
  projectName: string;
  agentId: string;
  status: 'error' | 'waiting';
  task: string;
  detail: string;
  duration: string;
  quietMs: number;
}

function attentionRow(
  project: ProjectInfo,
  agent: AgentInfo,
  now: number,
  clock?: ActivityClock,
): AttentionRow {
  const disconnected = Boolean(clock?.disconnected);
  return {
    projectId: project.id,
    projectName: project.name,
    agentId: agent.id,
    status: agent.status as 'error' | 'waiting',
    task: agentTask(agent),
    detail: attentionDetail(agent),
    duration:
      activityPhrase(agent, now, clock) ?? (disconnected ? 'last known' : 'last activity just now'),
    quietMs: quietMs(agent, now),
  };
}

function moreUrgent(next: AttentionRow, prev: AttentionRow): boolean {
  if (next.status !== prev.status) return next.status === 'error';
  return next.quietMs > prev.quietMs;
}

/** One row per project: the agent that most needs you. */
export function needsYouRows(
  projects: ProjectInfo[],
  now = Date.now(),
  clock?: ActivityClock,
): AttentionRow[] {
  const byProject = new Map<string, AttentionRow>();
  for (const project of projects) {
    for (const agent of project.agents) {
      if (agent.status !== 'error' && agent.status !== 'waiting') continue;
      const row = attentionRow(project, agent, now, clock);
      const prev = byProject.get(project.id);
      if (!prev || moreUrgent(row, prev)) byProject.set(project.id, row);
    }
  }
  return [...byProject.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'error' ? -1 : 1;
    return b.quietMs - a.quietMs || a.projectName.localeCompare(b.projectName);
  });
}

export function projectsByUrgency(projects: ProjectInfo[], now = Date.now()): ProjectInfo[] {
  const quiet = new Map(needsYouRows(projects, now).map((row) => [row.projectId, row.quietMs]));
  return [...projects].sort((a, b) => {
    const rankA = dominantStatus(a.agents);
    const rankB = dominantStatus(b.agents);
    const scoreA = rankA === 'empty' ? 4 : STATUS_RANK[rankA];
    const scoreB = rankB === 'empty' ? 4 : STATUS_RANK[rankB];
    if (scoreA !== scoreB) return scoreA - scoreB;
    const quietA = quiet.get(a.id) ?? 0;
    const quietB = quiet.get(b.id) ?? 0;
    if (scoreA <= 1 && quietA !== quietB) return quietB - quietA;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
