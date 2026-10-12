import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../types';
import {
  activityPhrase,
  attentionDetail,
  formatAsOf,
  needsYouRows,
  questionOverflows,
} from './attention';
import { testProject } from '../test/fixtures';

function agent(partial: Partial<AgentInfo> & Pick<AgentInfo, 'status'>): AgentInfo {
  return {
    id: 'a',
    source: 'claude-code',
    sessionId: 'a',
    ...partial,
  };
}

describe('attention copy', () => {
  const asOfMs = new Date(2026, 9, 12, 4, 52, 0).getTime();

  it('formats a last-known clock without padding the hour', () => {
    expect(formatAsOf(asOfMs)).toBe('as of 4:52');
  });

  it('keeps quiet time and never says just now while disconnected', () => {
    expect(activityPhrase({ lastActivityMs: asOfMs }, asOfMs + 30_000)).toBe(
      'last activity just now',
    );
    expect(
      activityPhrase({ lastActivityMs: asOfMs }, asOfMs + 30_000, {
        disconnected: true,
        asOfMs,
      }),
    ).toBe('as of 4:52');
    expect(
      activityPhrase({ quietForMs: 65 * 60_000 }, asOfMs, { disconnected: true, asOfMs }),
    ).toBe('quiet for 65 min · as of 4:52');
    expect(activityPhrase({}, asOfMs, { disconnected: true, asOfMs })).toBe('as of 4:52');
  });

  it('shows the waiting question, not the task or the last command', () => {
    const waiting = agent({
      status: 'waiting',
      currentTask: 'migrate the payments dashboard',
      lastAction: 'Shell:psql',
      pendingQuestion: 'Should I delete it anyway, or keep it behind a flag?',
    });
    expect(attentionDetail(waiting)).toBe('Should I delete it anyway, or keep it behind a flag?');
    expect(attentionDetail(agent({ status: 'waiting' }))).toBe('Needs you');
    expect(
      attentionDetail(
        agent({ status: 'error', errorReason: 'TypeError: stripe', lastAction: 'x' }),
      ),
    ).toBe('TypeError: stripe');

    const project = testProject('billing', [{ id: 'ask', status: 'waiting' }]);
    project.agents[0] = { ...project.agents[0], ...waiting, id: 'ask' };
    const row = needsYouRows([project], asOfMs)[0];
    expect(row.detail).toBe(waiting.pendingQuestion);
    expect(row.detail).not.toMatch(/psql|migrate/);
    expect(questionOverflows(row.detail)).toBe(false);
    expect(questionOverflows(`${row.detail}\nmore`)).toBe(true);
    expect(questionOverflows('x'.repeat(141))).toBe(true);
  });
});
