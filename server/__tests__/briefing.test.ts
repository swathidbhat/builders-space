import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  briefProject,
  briefingKey,
  repairBriefing,
  validateRawBriefing,
  __setBriefingTransport,
  type AgentParty,
  type BriefingAgentInput,
  type RawBriefing,
} from '../services/briefing';

/**
 * The transport seam is injected rather than `vi.mock`ing the SDK, so these
 * tests exercise the real caching and repair logic — the parts that
 * decide what actually reaches the screen — instead of a stubbed module.
 */
function stubTransport(raw: RawBriefing) {
  const calls: BriefingAgentInput[][] = [];
  __setBriefingTransport(async (agents) => {
    calls.push(agents);
    return raw;
  });
  return calls;
}

const agent = (id: string, task?: string): BriefingAgentInput => ({ id, task });

/** Every input id lands in exactly one party — the invariant the UI relies on. */
function expectTotalPartition(parties: AgentParty[], agents: BriefingAgentInput[]) {
  const placed = parties.flatMap((p) => p.members.map((m) => m.id));
  expect([...placed].sort()).toEqual(agents.map((a) => a.id).sort());
  expect(new Set(placed).size).toBe(placed.length);
}

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  __setBriefingTransport(null);
});

afterEach(() => {
  __setBriefingTransport(null);
  vi.unstubAllEnvs();
});

describe('briefingKey', () => {
  const agents = [agent('b', 'ship checkout'), agent('a', 'fix the parser')];

  it('does not depend on array order', () => {
    // The socket hands out a fresh array every tick and watcher scan order is
    // not stable, so an order-sensitive key would re-ask on every emit.
    expect(briefingKey([...agents].reverse())).toBe(briefingKey(agents));
  });

  it('ignores whitespace and trailing punctuation', () => {
    expect(briefingKey([agent('a', '  Fix   the parser.  ')])).toBe(
      briefingKey([agent('a', 'fix the parser')]),
    );
  });

  it('changes when a task changes', () => {
    expect(briefingKey([agent('a', 'one')])).not.toBe(briefingKey([agent('a', 'two')]));
  });

  it('changes when membership changes', () => {
    expect(briefingKey([agent('a', 'x')])).not.toBe(
      briefingKey([agent('a', 'x'), agent('b', 'x')]),
    );
  });

  it('does not collide across an id/task boundary', () => {
    expect(briefingKey([agent('ab', 'c')])).not.toBe(briefingKey([agent('a', 'bc')]));
  });

  it('changes when a stalled agent asks something new', () => {
    // A new question is a new decision, so it has to re-ask rather than serve
    // the previous answer out of cache.
    const before = [{ id: 'a', task: 'ship it', question: 'Postgres or SQLite?' }];
    const after = [{ id: 'a', task: 'ship it', question: 'Ready to deploy?' }];
    expect(briefingKey(before)).not.toBe(briefingKey(after));
  });
});

describe('repairBriefing', () => {
  const agents = [agent('a', 'one'), agent('b', 'two'), agent('c', 'three')];

  it('drops ids the model invented', () => {
    const parties = repairBriefing(
      {
        parties: [
          { goal: 'g', members: [{ id: 'a', intent: 'i', decision: '' }, { id: 'ghost', intent: 'i', decision: '' }] },
          { goal: 'h', members: [{ id: 'b', intent: 'i', decision: '' }, { id: 'c', intent: 'i', decision: '' }] },
        ],
      },
      agents,
    )!;
    expectTotalPartition(parties, agents);
  });

  it('keeps only the first claim on a repeated id', () => {
    const parties = repairBriefing(
      {
        parties: [
          { goal: 'g', members: [{ id: 'a', intent: 'first', decision: '' }] },
          { goal: 'h', members: [{ id: 'a', intent: 'second', decision: '' }, { id: 'b', intent: 'i', decision: '' }] },
          { goal: 'j', members: [{ id: 'c', intent: 'i', decision: '' }] },
        ],
      },
      agents,
    )!;
    expectTotalPartition(parties, agents);
    expect(parties.find((p) => p.id === 'party-a')!.members[0].intent).toBe('first');
  });

  it('adds a forgotten agent back as its own party', () => {
    const parties = repairBriefing(
      { parties: [{ goal: 'g', members: [{ id: 'a', intent: 'i', decision: '' }, { id: 'b', intent: 'i', decision: '' }] }] },
      agents,
    )!;
    expectTotalPartition(parties, agents);
    expect(parties.find((p) => p.id === 'party-c')!.goal).toBe('');
  });

  it('drops a party left with no members', () => {
    const parties = repairBriefing(
      {
        parties: [
          { goal: 'empty', members: [{ id: 'ghost', intent: 'i', decision: '' }] },
          { goal: 'g', members: agents.map((a) => ({ id: a.id, intent: 'i', decision: '' })) },
        ],
      },
      agents,
    )!;
    expect(parties).toHaveLength(1);
    expect(parties[0].goal).toBe('g');
  });

  it('clamps goal and intent length', () => {
    const parties = repairBriefing(
      {
        parties: [
          { goal: 'g'.repeat(300), members: agents.map((a) => ({ id: a.id, intent: 'i'.repeat(300), decision: '' })) },
        ],
      },
      agents,
    )!;
    expect(parties[0].goal.length).toBeLessThanOrEqual(48);
    for (const m of parties[0].members) expect(m.intent.length).toBeLessThanOrEqual(64);
  });

  it('bails when the model dropped more than half the roster', () => {
    // The parties it did return are not more trustworthy than the ones it
    // forgot, so the caller falls back wholesale rather than rendering half an
    // answer stitched to half a guess.
    expect(
      repairBriefing({ parties: [{ goal: 'g', members: [{ id: 'a', intent: 'i', decision: '' }] }] }, agents),
    ).toBeNull();
  });

  it('names a party after its lowest member id, whatever order they arrive in', () => {
    const forward = repairBriefing(
      { parties: [{ goal: 'g', members: [{ id: 'a', intent: 'i', decision: '' }, { id: 'b', intent: 'i', decision: '' }, { id: 'c', intent: 'i', decision: '' }] }] },
      agents,
    )!;
    const reversed = repairBriefing(
      { parties: [{ goal: 'g', members: [{ id: 'c', intent: 'i', decision: '' }, { id: 'b', intent: 'i', decision: '' }, { id: 'a', intent: 'i', decision: '' }] }] },
      agents,
    )!;
    expect(forward).toEqual(reversed);
    expect(forward[0].id).toBe('party-a');
  });
});

describe('validateRawBriefing', () => {
  it('accepts a well-formed answer', () => {
    expect(validateRawBriefing({ parties: [{ goal: 'g', members: [{ id: 'a', intent: 'i', decision: '' }] }] }))
      .toEqual({ parties: [{ goal: 'g', members: [{ id: 'a', intent: 'i', decision: '' }] }] });
  });

  it.each([
    { why: 'no parties', bad: {} },
    { why: 'parties not an array', bad: { parties: 'nope' } },
    { why: 'goal not a string', bad: { parties: [{ goal: 5, members: [] }] } },
    { why: 'member without an id', bad: { parties: [{ goal: 'g', members: [{ intent: 'i' }] }] } },
  ])('rejects a briefing with $why', ({ bad }) => {
    expect(() => validateRawBriefing(bad)).toThrow();
  });
});

describe('briefProject', () => {
  const agents = [agent('a', 'ship checkout'), agent('b', 'ship checkout')];

  it('returns the model answer when it is sound', async () => {
    stubTransport({
      parties: [{ goal: 'Ship the checkout flow', members: [{ id: 'a', intent: 'x', decision: '' }, { id: 'b', intent: 'y', decision: '' }] }],
    });
    const result = await briefProject(agents);
    expect(result.parties.length).toBeGreaterThan(0);
    expect(result.parties[0].goal).toBe('Ship the checkout flow');
  });

  it('never calls out without an API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const calls = stubTransport({ parties: [] });
    __setBriefingTransport(null); // force the real transport lookup, which has no key
    const result = await briefProject(agents);
    expect(result.parties).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('sends only the id and the task', async () => {
    // The DTO is the cache key. A volatile field here would bill a call on
    // every socket tick.
    const calls = stubTransport({ parties: [{ goal: 'g', members: agents.map((a) => ({ id: a.id, intent: 'i', decision: '' })) }] });
    await briefProject(agents);
    for (const sent of calls[0]) {
      expect(Object.keys(sent).sort()).toEqual(['id', 'task']);
    }
  });

  it('forwards a stalled agent’s last message so the decision can be read', async () => {
    const stalled = [
      { id: 'a', task: 'write the launch posts', question: 'Done — four drafts. Which should go out?' },
      { id: 'b', task: 'write the launch posts' },
    ];
    const calls = stubTransport({
      parties: [
        {
          goal: 'Publish the launch posts',
          members: [
            { id: 'a', intent: 'drafted four posts', decision: 'Choose which draft to publish' },
            { id: 'b', intent: 'made the images', decision: '' },
          ],
        },
      ],
    });
    const result = await briefProject(stalled);

    expect(calls[0].find((x) => x.id === 'a')!.question).toContain('four drafts');
    // A working agent contributes no question at all — that is what keeps the
    // cache key still while it works.
    expect(calls[0].find((x) => x.id === 'b')!.question).toBeUndefined();

    const members = result.parties[0].members;
    expect(members.find((m) => m.id === 'a')!.decision).toBe(
      'Choose which draft to publish',
    );
    expect(members.find((m) => m.id === 'b')!.decision).toBe('');
  });

  it('includes an agent that has only a question and no task', async () => {
    // Codex sessions routinely parse to no task at all. Dropping them would
    // lose the one thing they do have — a decision waiting on you.
    const calls = stubTransport({
      parties: [{ goal: '', members: [{ id: 'q', intent: '', decision: 'Confirm the file path' }] }],
    });
    const result = await briefProject([{ id: 'q', question: 'Is /tmp/out.csv right?' }]);
    expect(calls[0]).toHaveLength(1);
    expect(result.parties[0].members[0].decision).toBe('Confirm the file path');
  });

  it('clamps an over-long decision', async () => {
    stubTransport({
      parties: [{ goal: 'g', members: [{ id: 'a', intent: 'i', decision: 'd'.repeat(400) }] }],
    });
    const result = await briefProject([{ id: 'a', task: 't', question: 'q' }]);
    expect(result.parties[0].members[0].decision.length).toBeLessThanOrEqual(72);
  });

  it('says nothing at all when there is no model', async () => {
    // No goals, no parties, no decisions — not a coarser answer. Naming what a
    // human must decide is the judgement no rule substitutes for, so with
    // nothing to ask, the surface stays quiet rather than guessing.
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    __setBriefingTransport(null);
    const result = await briefProject([
      { id: 'a', task: 'ship it', question: 'Done — which one should go out?' },
    ]);
    expect(result).toEqual({ parties: [] });
  });

  it('serves a repeat roster from cache', async () => {
    const calls = stubTransport({ parties: [{ goal: 'g', members: agents.map((a) => ({ id: a.id, intent: 'i', decision: '' })) }] });
    await briefProject(agents);
    await briefProject([...agents].reverse());
    expect(calls).toHaveLength(1);
  });

  it('collapses concurrent requests for the same roster into one call', async () => {
    const calls: BriefingAgentInput[][] = [];
    __setBriefingTransport(async (a) => {
      calls.push(a);
      await new Promise((r) => setTimeout(r, 10));
      return { parties: [{ goal: 'g', members: agents.map((x) => ({ id: x.id, intent: 'i', decision: '' })) }] };
    });
    const [one, two] = await Promise.all([briefProject(agents), briefProject(agents)]);
    expect(calls).toHaveLength(1);
    expect(one).toEqual(two);
  });

  it('paces distinct calls rather than dropping them', async () => {
    // The floor waits instead of refusing. With nothing to degrade to, refusing
    // would hand back silence for a roster we can brief a moment later — so
    // moving between planets quickly costs time, never the answer.
    __setBriefingTransport(async (a) => ({
      parties: [{ goal: 'g', members: a.map((x) => ({ id: x.id, intent: 'i', decision: '' })) }],
    }));
    const started = Date.now();
    await briefProject(agents);
    const second = await briefProject([agent('c', 'different work')]);
    expect(second.parties.length).toBeGreaterThan(0);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
  });

  it('says nothing when the transport throws', async () => {
    __setBriefingTransport(async () => {
      throw new Error('502 upstream');
    });
    const result = await briefProject(agents);
    expect(result).toEqual({ parties: [] });
  });

  it('says nothing when the model returns an unusable answer', async () => {
    stubTransport({ parties: [] });
    const result = await briefProject(agents);
    expect(result).toEqual({ parties: [] });
  });

  it('refuses an oversized roster without calling out', async () => {
    const calls = stubTransport({ parties: [] });
    const many = Array.from({ length: 20 }, (_, i) => agent(`a-${i}`, 'work'));
    const result = await briefProject(many);
    expect(calls).toHaveLength(0);
    expect(result).toEqual({ parties: [] });
  });

  it('returns nothing for an empty roster', async () => {
    const calls = stubTransport({ parties: [] });
    expect(await briefProject([])).toEqual({ parties: [] });
    expect(calls).toHaveLength(0);
  });
});
