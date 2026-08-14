import { describe, it, expect } from 'vitest';
import { briefingInput, briefingRequestKey } from '../briefingRequest';
import type { AgentInfo } from '../../types';

function makeAgent(id: string, overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id,
    source: 'claude-code',
    sessionId: `session-${id}`,
    status: 'working',
    currentTask: 'ship the checkout flow',
    lastAction: 'Edit:cart.tsx',
    lastActivityMs: 1_700_000_000_000,
    ...overrides,
  };
}

describe('briefingInput', () => {
  it('carries the id and the task and nothing else while an agent works', () => {
    // INVARIANT: the DTO is the cache key. Every field on a working agent other
    // than these two changes on nearly every socket tick, so widening this
    // shape would re-ask the server several times a second — asserting on the
    // key set is what makes that regression fail here rather than on the bill.
    const [dto] = briefingInput([
      makeAgent('a', { status: 'working', question: 'mid-work chatter' }),
    ]);
    expect(Object.keys(dto).sort()).toEqual(['id', 'task']);
  });

  it('adds the question once an agent has actually stopped', () => {
    // Frozen for as long as it waits, and the only place the pending decision
    // can be read from — so it is safe here precisely when it is needed.
    const [dto] = briefingInput([
      makeAgent('a', { status: 'waiting', question: 'Postgres or SQLite?' }),
    ]);
    expect(Object.keys(dto).sort()).toEqual(['id', 'question', 'task']);
    expect(dto.question).toBe('Postgres or SQLite?');
  });

  it('omits the question from a waiting agent that never said anything', () => {
    const [dto] = briefingInput([
      makeAgent('a', { status: 'waiting', question: undefined }),
    ]);
    expect(Object.keys(dto).sort()).toEqual(['id', 'task']);
  });

  it('does not re-ask as a working agent talks', () => {
    const before = briefingInput([makeAgent('a', { status: 'working', question: 'one' })]);
    const after = briefingInput([makeAgent('a', { status: 'working', question: 'two' })]);
    expect(briefingRequestKey(after)).toBe(briefingRequestKey(before));
  });

  it('passes the task through untouched', () => {
    expect(briefingInput([makeAgent('a', { currentTask: 'Fix the parser' })])).toEqual([
      { id: 'a', task: 'Fix the parser' },
    ]);
  });

  it('tolerates an agent with no task', () => {
    expect(briefingInput([makeAgent('a', { currentTask: undefined })])).toEqual([
      { id: 'a', task: undefined },
    ]);
  });

  it('preserves the roster it was given', () => {
    expect(briefingInput([makeAgent('a'), makeAgent('b')]).map((d) => d.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('briefingRequestKey', () => {
  const roster = [makeAgent('b', { currentTask: 'two' }), makeAgent('a', { currentTask: 'one' })];

  it('is stable across a fresh array with identical content', () => {
    // The socket replaces the agents array wholesale on every emit, so
    // identity-based guarding would miss on every tick.
    const first = briefingRequestKey(briefingInput(roster));
    const second = briefingRequestKey(briefingInput(roster.map((a) => ({ ...a }))));
    expect(second).toBe(first);
  });

  it('does not depend on array order', () => {
    expect(briefingRequestKey(briefingInput([...roster].reverse()))).toBe(
      briefingRequestKey(briefingInput(roster)),
    );
  });

  it('ignores churn in the fields the DTO drops', () => {
    const busy = roster.map((a) => ({
      ...a,
      lastAction: 'Shell:npm test',
      lastActivityMs: Date.now(),
      status: 'waiting' as const,
    }));
    expect(briefingRequestKey(briefingInput(busy))).toBe(
      briefingRequestKey(briefingInput(roster)),
    );
  });

  it('ignores whitespace and trailing punctuation in the task', () => {
    expect(
      briefingRequestKey(briefingInput([makeAgent('a', { currentTask: '  Ship   it.  ' })])),
    ).toBe(briefingRequestKey(briefingInput([makeAgent('a', { currentTask: 'ship it' })])));
  });

  it('changes when a task changes', () => {
    expect(
      briefingRequestKey(briefingInput([makeAgent('a', { currentTask: 'one' })])),
    ).not.toBe(briefingRequestKey(briefingInput([makeAgent('a', { currentTask: 'two' })])));
  });

  it('changes when the roster changes', () => {
    expect(briefingRequestKey(briefingInput(roster))).not.toBe(
      briefingRequestKey(briefingInput([...roster, makeAgent('c')])),
    );
  });

  it('does not collide across an id/task boundary', () => {
    expect(briefingRequestKey([{ id: 'ab', task: 'c' }])).not.toBe(
      briefingRequestKey([{ id: 'a', task: 'bc' }]),
    );
  });
});
