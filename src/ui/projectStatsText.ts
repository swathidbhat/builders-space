import type { AgentInfo } from '../types';

/** Counts the old stats boxes used to show, for the panel heading's accessible name. */
export function projectStatsText(agents: readonly AgentInfo[]): string {
  const working = agents.filter((agent) => agent.status === 'working').length;
  const errors = agents.filter((agent) => agent.status === 'error').length;
  const waiting = agents.filter((agent) => agent.status === 'waiting').length;
  const parts = [
    `${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}`,
    `${working} working`,
  ];
  if (errors > 0) parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
  if (waiting > 0) parts.push(`${waiting} waiting`);
  return parts.join(', ');
}
