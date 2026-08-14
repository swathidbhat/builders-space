import { describe, it, expect } from 'vitest';
import {
  campPoint,
  partyAnchor,
  planSurfaceCamp,
  selectSurfaceAgents,
  SURFACE_MAX_AGENTS,
} from '../surfacePlacement';
import type { SurfaceCamp, SurfaceSlot } from '../surfacePlacement';
import {
  BAND_HALF_ANGLE,
  DEPTH_FAR,
  DEPTH_NEAR,
  HORIZON_ANGLE,
  MIN_SEPARATION,
  VIEWER_DIR,
} from '../surfaceConstants';
import type { AgentInfo } from '../../types';

function makeAgent(id: string, overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id,
    source: 'claude-code',
    sessionId: `session-${id}`,
    status: 'working',
    ...overrides,
  };
}

function makeAgents(count: number, prefix = 'agent'): AgentInfo[] {
  return Array.from({ length: count }, (_, i) => makeAgent(`${prefix}-${i}`));
}

type Vec3 = [number, number, number];

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function angleBetween(a: Vec3, b: Vec3): number {
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
}

function slotById(camp: SurfaceCamp, agentId: string): SurfaceSlot {
  const slot = camp.slots.find((s) => s.agentId === agentId);
  if (!slot) throw new Error(`no slot for ${agentId}`);
  return slot;
}

const PROJECT = 'builders-space';

/**
 * Id shapes the watchers actually emit, alongside the synthetic `agent-N`.
 * Placement is hash-driven, so how the ids are shaped changes how much the
 * relaxation has to do — the churn invariants need to hold for both.
 */
const ID_FAMILIES: Record<string, (i: number) => string> = {
  sequential: (i) => `agent-${i}`,
  sessionUuid: (i) =>
    `claude-3f2a9c1e-77b4-4d0a-9e21-8c55aa12${i.toString(16).padStart(4, '0')}`,
  numericPid: (i) => `cursor-${100000 + i * 37}`,
};

describe('planSurfaceCamp', () => {
  it('returns a valid camp with no slots for an empty agent list', () => {
    const camp = planSurfaceCamp([], PROJECT);
    expect(camp.slots).toEqual([]);
    expect(camp.anchor).toHaveLength(3);
    expect(Math.hypot(...camp.anchor)).toBeCloseTo(1, 12);
  });

  it('produces one slot per agent, keyed by agent id', () => {
    const agents = makeAgents(6);
    const camp = planSurfaceCamp(agents, PROJECT);
    expect(camp.slots).toHaveLength(6);
    expect(camp.slots.map((s) => s.agentId).sort()).toEqual(
      agents.map((a) => a.id).sort(),
    );
  });

  it('is deterministic across repeated calls', () => {
    const agents = makeAgents(9);
    expect(planSurfaceCamp(agents, PROJECT)).toEqual(
      planSurfaceCamp(agents, PROJECT),
    );
  });

  it('INVARIANT: reordering the input produces identical per-agent slots', () => {
    const agents = makeAgents(10);
    const shuffled = [
      agents[7], agents[2], agents[9], agents[0], agents[5],
      agents[3], agents[8], agents[1], agents[6], agents[4],
    ];

    const a = planSurfaceCamp(agents, PROJECT);
    const b = planSurfaceCamp(shuffled, PROJECT);

    for (const agent of agents) {
      expect(slotById(b, agent.id)).toEqual(slotById(a, agent.id));
    }
    // Slots come back in id-sorted order, so the whole camp matches too.
    expect(b).toEqual(a);
  });

  it('INVARIANT: reversing the input produces identical per-agent slots', () => {
    const agents = makeAgents(7);
    const a = planSurfaceCamp(agents, PROJECT);
    const b = planSurfaceCamp([...agents].reverse(), PROJECT);
    expect(b).toEqual(a);
  });

  // The watchers drop a session from the array as soon as it ages out, so both
  // of these happen on a live tick with the surface view already on screen. A
  // slot derived from the agent's position in the array — rather than its id —
  // passes every reordering test above and still fails these: measured against
  // an index-derived scatter, survivors moved by up to 25.7°, most of the 36°
  // band. The bound here is one MIN_SEPARATION, i.e. no further than the gap
  // the layout already guarantees between neighbours.
  it('INVARIANT: removing an agent leaves the survivors where they were', () => {
    for (const [family, makeId] of Object.entries(ID_FAMILIES)) {
      const agents = Array.from({ length: 12 }, (_, i) => makeAgent(makeId(i)));
      const before = planSurfaceCamp(agents, PROJECT);

      for (let removed = 0; removed < agents.length; removed++) {
        const kept = agents.filter((_, i) => i !== removed);
        const after = planSurfaceCamp(kept, PROJECT);
        for (const agent of kept) {
          const moved = angleBetween(
            slotById(before, agent.id).dir,
            slotById(after, agent.id).dir,
          );
          expect(
            moved,
            `${family}: ${agent.id} moved when ${agents[removed].id} left`,
          ).toBeLessThan(MIN_SEPARATION);
        }
      }
    }
  });

  it('INVARIANT: adding an agent leaves the incumbents where they were', () => {
    for (const [family, makeId] of Object.entries(ID_FAMILIES)) {
      const agents = Array.from({ length: 12 }, (_, i) => makeAgent(makeId(i)));
      const before = planSurfaceCamp(agents, PROJECT);

      // Ids that sort before, inside and after the incumbent block.
      for (const newId of ['aaa-first', makeId(4) + 'x', 'zzz-last']) {
        const after = planSurfaceCamp([makeAgent(newId), ...agents], PROJECT);
        for (const agent of agents) {
          const moved = angleBetween(
            slotById(before, agent.id).dir,
            slotById(after, agent.id).dir,
          );
          expect(
            moved,
            `${family}: ${agent.id} moved when ${newId} arrived`,
          ).toBeLessThan(MIN_SEPARATION);
        }
      }
    }
  });

  it('INVARIANT: changing status or lastAction does not move an agent', () => {
    const before = makeAgents(8);
    const after = before.map((agent, i) =>
      makeAgent(agent.id, {
        status: (['waiting', 'done', 'error', 'working'] as const)[i % 4],
        statusSource: 'inferred',
        lastAction: `edited file ${i}`,
        currentTask: `task ${i}`,
        elapsedMs: i * 1000,
        lastActivityMs: 99999 - i,
      }),
    );
    expect(planSurfaceCamp(after, PROJECT)).toEqual(
      planSurfaceCamp(before, PROJECT),
    );
  });

  it('emits unit-length directions', () => {
    const camp = planSurfaceCamp(makeAgents(14), PROJECT);
    for (const slot of camp.slots) {
      expect(Math.hypot(...slot.dir)).toBeCloseTo(1, 9);
    }
  });

  it('keeps every slot inside the band and depth bounds', () => {
    for (const n of [1, 2, 5, 11, 20]) {
      const camp = planSurfaceCamp(makeAgents(n), PROJECT);
      for (const slot of camp.slots) {
        expect(slot.bandAngle).toBeGreaterThanOrEqual(-BAND_HALF_ANGLE);
        expect(slot.bandAngle).toBeLessThanOrEqual(BAND_HALF_ANGLE);
        expect(slot.depthAngle).toBeGreaterThanOrEqual(DEPTH_NEAR);
        expect(slot.depthAngle).toBeLessThanOrEqual(DEPTH_FAR);
      }
    }
  });

  it('keeps every slot strictly inside the horizon', () => {
    for (const n of [1, 4, 12, 20]) {
      const camp = planSurfaceCamp(makeAgents(n), PROJECT);
      for (const slot of camp.slots) {
        expect(angleBetween(slot.dir, camp.anchor)).toBeLessThan(HORIZON_ANGLE);
      }
    }
  });

  it('places every agent in front of the camera, not behind it', () => {
    // The load-bearing orientation invariant. The camera stands on `anchor`
    // looking along `+depthAxis`, so every slot must lie on that side. Flip the
    // sign of the depth term in slotDir and the maths stays perfectly
    // self-consistent — unit vectors, correct arc, correct separation — while
    // the whole camp silently moves behind the viewer and the surface renders
    // empty. No other assertion in this file catches that.
    for (const name of ['builders-space', 'alpha', 'zzz-project', 'x']) {
      const camp = planSurfaceCamp(makeAgents(8), name);
      for (const slot of camp.slots) {
        const disp: Vec3 = [
          slot.dir[0] - camp.anchor[0],
          slot.dir[1] - camp.anchor[1],
          slot.dir[2] - camp.anchor[2],
        ];
        expect(dot(disp, camp.depthAxis)).toBeGreaterThan(0);
      }
    }
  });

  it('reports a depthAngle that matches the actual arc travelled along the depth axis', () => {
    const camp = planSurfaceCamp(makeAgents(10), PROJECT);
    for (const slot of camp.slots) {
      // The band rotation is about the depth axis and so leaves this component
      // untouched: the direction's depth component is exactly sin(depthAngle),
      // independent of how far across the band the agent sits.
      expect(Math.asin(dot(slot.dir, camp.depthAxis))).toBeCloseTo(
        slot.depthAngle,
        9,
      );
    }
  });

  it('reports a bandAngle whose sign matches which way it leans along the band', () => {
    const camp = planSurfaceCamp(makeAgents(12), PROJECT);
    let sawLeft = false;
    let sawRight = false;
    for (const slot of camp.slots) {
      const alongBand = dot(slot.dir, camp.bandAxis);
      if (slot.bandAngle > 1e-6) {
        expect(alongBand).toBeGreaterThan(0);
        sawRight = true;
      } else if (slot.bandAngle < -1e-6) {
        expect(alongBand).toBeLessThan(0);
        sawLeft = true;
      }
    }
    expect(sawLeft && sawRight).toBe(true);
  });

  it('never places two agents closer than MIN_SEPARATION, up to band capacity', () => {
    const epsilon = 1e-9;
    // The band holds about 16 agents at full separation; beyond that no
    // arrangement can meet it and the target degrades on purpose.
    for (const n of [2, 3, 8, 16]) {
      const camp = planSurfaceCamp(makeAgents(n), PROJECT);
      for (let i = 0; i < camp.slots.length; i++) {
        for (let j = i + 1; j < camp.slots.length; j++) {
          const sep = angleBetween(camp.slots[i].dir, camp.slots[j].dir);
          expect(sep).toBeGreaterThanOrEqual(MIN_SEPARATION - epsilon);
        }
      }
    }
  });

  it('degrades gracefully rather than stacking agents when overcrowded', () => {
    // Past capacity the guarantee weakens, but agents must still be visibly
    // distinct — never coincident, never closer than half the target.
    for (const n of [24, 40]) {
      const camp = planSurfaceCamp(makeAgents(n), PROJECT);
      let worst = Infinity;
      for (let i = 0; i < camp.slots.length; i++) {
        for (let j = i + 1; j < camp.slots.length; j++) {
          worst = Math.min(
            worst,
            angleBetween(camp.slots[i].dir, camp.slots[j].dir),
          );
        }
      }
      expect(worst).toBeGreaterThan(MIN_SEPARATION * 0.5);
    }
  });

  it('crowds tighter as agent count rises', () => {
    const worstFor = (n: number) => {
      const camp = planSurfaceCamp(makeAgents(n), PROJECT);
      let worst = Infinity;
      for (let i = 0; i < camp.slots.length; i++) {
        for (let j = i + 1; j < camp.slots.length; j++) {
          worst = Math.min(
            worst,
            angleBetween(camp.slots[i].dir, camp.slots[j].dir),
          );
        }
      }
      return worst;
    };
    expect(worstFor(40)).toBeLessThan(worstFor(16));
  });

  it('scatters agents in depth rather than lining them up', () => {
    const camp = planSurfaceCamp(makeAgents(8), PROJECT);
    const depths = camp.slots.map((s) => s.depthAngle);
    const spread = Math.max(...depths) - Math.min(...depths);
    expect(spread).toBeGreaterThan((DEPTH_FAR - DEPTH_NEAR) * 0.5);
  });

  it('returns a mutually orthonormal anchor frame', () => {
    for (const name of ['Alpha', 'Beta', 'a', PROJECT, 'Project-Zeta']) {
      const { anchor, bandAxis, depthAxis } = planSurfaceCamp([], name);
      expect(dot(anchor, anchor)).toBeCloseTo(1, 12);
      expect(dot(bandAxis, bandAxis)).toBeCloseTo(1, 12);
      expect(dot(depthAxis, depthAxis)).toBeCloseTo(1, 12);
      expect(dot(anchor, bandAxis)).toBeCloseTo(0, 12);
      expect(dot(anchor, depthAxis)).toBeCloseTo(0, 12);
      expect(dot(bandAxis, depthAxis)).toBeCloseTo(0, 12);
    }
  });

  it('lands every project on the face turned toward the viewer', () => {
    // Deliberately the same anchor for all of them. Hashing it put the camp
    // anywhere on the sphere, so arriving meant swinging up to 180 degrees
    // around the planet and rolling up to 180 to stand up — the spin.
    const names = ['Alpha', 'Beta', 'Gamma', 'builders-space', 'a', 'b', 'ZZ'];
    for (const n of names) {
      expect(planSurfaceCamp([], n).anchor).toEqual([...VIEWER_DIR]);
    }
  });

  it('still turns each project a different way on that face', () => {
    // What distinguishes two camps is the roll of the band around the anchor,
    // not where on the sphere they sit.
    const names = ['Alpha', 'Beta', 'Gamma', 'builders-space', 'a', 'b', 'ZZ'];
    const facings = names.map((n) =>
      planSurfaceCamp([], n).bandAxis.map((v) => v.toFixed(9)).join(','),
    );
    expect(new Set(facings).size).toBe(names.length);
  });

  it('gives the same project name the same anchor every time', () => {
    expect(planSurfaceCamp([], PROJECT).anchor).toEqual(
      planSurfaceCamp(makeAgents(4), PROJECT).anchor,
    );
  });

  it('places the same agent id differently under different projects', () => {
    const agents = makeAgents(3);
    const a = planSurfaceCamp(agents, 'Alpha');
    const b = planSurfaceCamp(agents, 'Beta');
    expect(b.slots[0].dir).not.toEqual(a.slots[0].dir);
  });
});

describe('selectSurfaceAgents', () => {
  const withStatus = (id: string, status: AgentInfo['status']) =>
    makeAgent(id, { status });

  it('never puts a done agent on the ground', () => {
    const picked = selectSurfaceAgents([
      withStatus('a', 'done'),
      withStatus('b', 'done'),
      withStatus('c', 'working'),
    ]);
    expect(picked.map((a) => a.id)).toEqual(['c']);
  });

  it('caps the crowd at what the view can carry', () => {
    const picked = selectSurfaceAgents(
      Array.from({ length: 40 }, (_, i) => withStatus(`a-${i}`, 'working')),
    );
    expect(picked).toHaveLength(SURFACE_MAX_AGENTS);
  });

  it('keeps the agents that need you when it has to choose', () => {
    // Twelve working agents would fill the cap on their own; the one error and
    // one waiting agent must still make the cut.
    const agents = [
      ...Array.from({ length: 12 }, (_, i) => withStatus(`work-${i}`, 'working')),
      withStatus('boom', 'error'),
      withStatus('stuck', 'waiting'),
    ];
    const ids = selectSurfaceAgents(agents).map((a) => a.id);
    expect(ids[0]).toBe('boom');
    expect(ids[1]).toBe('stuck');
    expect(ids).toHaveLength(SURFACE_MAX_AGENTS);
  });

  it('does not reshuffle when the input order changes', () => {
    const agents = [
      withStatus('d', 'working'),
      withStatus('a', 'waiting'),
      withStatus('c', 'error'),
      withStatus('b', 'working'),
    ];
    const base = selectSurfaceAgents(agents).map((a) => a.id);
    for (const order of [[...agents].reverse(), agents.slice(2).concat(agents.slice(0, 2))]) {
      expect(selectSurfaceAgents(order).map((a) => a.id)).toEqual(base);
    }
  });

  it('does not mutate the array it is given', () => {
    const agents = [
      withStatus('z', 'working'),
      withStatus('a', 'error'),
    ];
    const before = agents.map((a) => a.id);
    selectSurfaceAgents(agents);
    expect(agents.map((a) => a.id)).toEqual(before);
  });

  it('hands the camp a roster it can place inside the band', () => {
    const agents = Array.from({ length: 30 }, (_, i) => withStatus(`a-${i}`, 'working'));
    const camp = planSurfaceCamp(selectSurfaceAgents(agents), PROJECT);
    expect(camp.slots).toHaveLength(SURFACE_MAX_AGENTS);
    for (let i = 0; i < camp.slots.length; i++) {
      for (let j = i + 1; j < camp.slots.length; j++) {
        expect(
          angleBetween(camp.slots[i].dir, camp.slots[j].dir),
        ).toBeGreaterThanOrEqual(MIN_SEPARATION - 1e-9);
      }
    }
  });

  it('keeps an error agent even when its id sorts last', () => {
    // The error/waiting ranking must come from the status, not from where the
    // ids happen to fall alphabetically.
    const agents = [
      withStatus('aaa-wait', 'waiting'),
      withStatus('bbb-wait', 'waiting'),
      withStatus('ccc-wait', 'waiting'),
      withStatus('ddd-wait', 'waiting'),
      withStatus('eee-wait', 'waiting'),
      withStatus('zzz-boom', 'error'),
    ];
    expect(selectSurfaceAgents(agents)[0].id).toBe('zzz-boom');
  });
});

describe('partyAnchor', () => {
  const CAMP = planSurfaceCamp(makeAgents(5), PROJECT);
  const ALL = CAMP.slots.map((s) => s.agentId);

  it('returns nothing when none of the members are standing here', () => {
    expect(partyAnchor(CAMP, ['nobody'])).toBeNull();
    expect(partyAnchor(CAMP, [])).toBeNull();
  });

  it('INVARIANT: is unchanged under member-id reordering', () => {
    // Floating-point addition is not associative, so an unsorted walk would
    // hand the same party subtly different anchors depending on the order its
    // members happened to arrive in — and the banner would jitter.
    for (const [family, idOf] of Object.entries(ID_FAMILIES)) {
      const agents = Array.from({ length: 5 }, (_, i) => makeAgent(idOf(i)));
      const camp = planSurfaceCamp(agents, PROJECT);
      const ids = camp.slots.map((s) => s.agentId);
      const base = partyAnchor(camp, ids);
      for (const order of [[...ids].reverse(), [...ids].sort(), ids.slice(2).concat(ids.slice(0, 2))]) {
        expect(partyAnchor(camp, order), family).toEqual(base);
      }
    }
  });

  it('INVARIANT: sits at the depth of its furthest-back member', () => {
    // Agent labels stagger upward with depth, so anchoring at the back of the
    // fan is what keeps the banner clear of every member chip.
    for (const members of [ALL, ALL.slice(0, 3), ALL.slice(1, 4)]) {
      const anchor = partyAnchor(CAMP, members)!;
      const depths = CAMP.slots
        .filter((s) => members.includes(s.agentId))
        .map((s) => s.depthAngle);
      expect(anchor.depthAngle).toBe(Math.max(...depths));
    }
  });

  it('INVARIANT: a single-member party anchors on that member', () => {
    for (const slot of CAMP.slots) {
      const anchor = partyAnchor(CAMP, [slot.agentId])!;
      expect(anchor.bandAngle).toBeCloseTo(slot.bandAngle, 12);
      expect(anchor.depthAngle).toBe(slot.depthAngle);
      expect(anchor.dir).toEqual(slot.dir);
    }
  });

  it('sits between its members across the band', () => {
    const anchor = partyAnchor(CAMP, ALL)!;
    const bands = CAMP.slots.map((s) => s.bandAngle);
    expect(anchor.bandAngle).toBeGreaterThanOrEqual(Math.min(...bands));
    expect(anchor.bandAngle).toBeLessThanOrEqual(Math.max(...bands));
  });

  it('stays inside the band and depth bounds', () => {
    for (const name of ['alpha', 'builders-space', 'zeta-9', 'a']) {
      const camp = planSurfaceCamp(makeAgents(5), name);
      const ids = camp.slots.map((s) => s.agentId);
      for (const members of [ids, ids.slice(0, 2), [ids[0]]]) {
        const anchor = partyAnchor(camp, members)!;
        expect(Math.abs(anchor.bandAngle)).toBeLessThanOrEqual(BAND_HALF_ANGLE + 1e-9);
        expect(anchor.depthAngle).toBeGreaterThanOrEqual(DEPTH_NEAR - 1e-9);
        expect(anchor.depthAngle).toBeLessThanOrEqual(DEPTH_FAR + 1e-9);
      }
    }
  });

  it('stays strictly inside the horizon', () => {
    for (const name of ['alpha', 'builders-space', 'zeta-9']) {
      const camp = planSurfaceCamp(makeAgents(5), name);
      const ids = camp.slots.map((s) => s.agentId);
      const anchor = partyAnchor(camp, ids)!;
      expect(angleBetween(anchor.dir, camp.anchor)).toBeLessThan(HORIZON_ANGLE);
    }
  });

  it('agrees with campPoint', () => {
    const anchor = partyAnchor(CAMP, ALL)!;
    expect(anchor.dir).toEqual(campPoint(CAMP, anchor.bandAngle, anchor.depthAngle));
  });

  it('INVARIANT: grouping cannot move anyone', () => {
    // Trivially true today, because `planSurfaceCamp` never sees a party. This
    // test exists to fail the day someone reaches for "just pass the parties in
    // so members cluster" — at which point placement stops being a pure
    // function of (projectName, agent.id) and agents teleport whenever the
    // briefing re-groups them.
    const agents = makeAgents(5);
    const base = planSurfaceCamp(selectSurfaceAgents(agents), PROJECT);

    const partitions = [
      [agents.map((a) => a.id)],
      agents.map((a) => [a.id]),
      [agents.slice(0, 2).map((a) => a.id), agents.slice(2).map((a) => a.id)],
    ];
    for (const partition of partitions) {
      // Deriving anchors for a partition must not disturb the camp it read.
      for (const party of partition) partyAnchor(base, party);
      expect(planSurfaceCamp(selectSurfaceAgents(agents), PROJECT)).toEqual(base);
    }
  });
});
