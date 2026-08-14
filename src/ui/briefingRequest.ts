/**
 * Deriving what to ask the briefing for, and whether it has already been asked.
 *
 * Pure and exported rather than inlined into the hook, because the test runner
 * has no DOM — this is the only way the request-storm guard can be tested at
 * all. It also puts the DTO narrowing in one place: everything volatile about
 * an agent is dropped here, at the boundary, rather than trusted not to be
 * added later.
 */
import type { AgentInfo, BriefingAgentInput } from '../types';

/**
 * The briefing's view of an agent.
 *
 * `lastAction` and `lastActivityMs` never cross this line: they change on
 * nearly every socket tick, and the request key is derived from this shape, so
 * including one would re-ask the server several times a second.
 *
 * `question` is the one field that gets in conditionally, and the condition is
 * the whole point. While an agent works, its last message changes every turn —
 * as volatile as anything else here. The moment it stops and waits, that
 * message is frozen, and it is the only place the decision it is blocked on
 * can be read from. So it rides along exactly when it is stable and needed,
 * and a working agent contributes nothing volatile at all.
 */
export function briefingInput(agents: AgentInfo[]): BriefingAgentInput[] {
  return agents.map((a) =>
    a.status === 'waiting' && a.question
      ? { id: a.id, task: a.currentTask, question: a.question }
      : { id: a.id, task: a.currentTask },
  );
}

/**
 * A stable identity for a roster's briefing.
 *
 * Mirrors `briefingKey` on the server: sorted so scan order cannot change it,
 * normalised so whitespace and trailing punctuation cannot either.
 */
export function briefingRequestKey(input: BriefingAgentInput[]): string {
  return input
    .map((a) => `${a.id}${normalizeTask(a.task)}${normalizeTask(a.question)}`)
    .sort()
    .join('');
}

function normalizeTask(task: string | undefined): string {
  return (task ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[.!?,;:]+$/, '');
}
