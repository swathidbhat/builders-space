import type { SpaceData } from '../shared/types';

/**
 * Sentence for the disable confirmation when agent status actually changed.
 * An unchanged sky, including current errors, produces no sentence.
 */
export function hookDisableStatusNote(before: SpaceData, after: SpaceData): string | undefined {
  const afterAgents = new Map<string, { status: string; errorReason: string }>();
  for (const project of after.projects) {
    for (const agent of project.agents) {
      afterAgents.set(agent.id, {
        status: agent.status,
        errorReason: agent.errorReason ?? '',
      });
    }
  }

  let changed = 0;
  for (const project of before.projects) {
    for (const agent of project.agents) {
      const next = afterAgents.get(agent.id);
      if (!next) continue;
      if (next.status !== agent.status || next.errorReason !== (agent.errorReason ?? '')) {
        changed += 1;
      }
    }
  }

  if (changed === 0) return undefined;
  return changed === 1 ? '1 session status changed.' : `${changed} session statuses changed.`;
}
