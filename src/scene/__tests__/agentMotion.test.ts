import { describe, it, expect } from 'vitest';
import {
  computeAnims,
  hashAgentId,
  phaseOf,
  walkOffset,
  walkFacesLeft,
  strideCycle,
  digCycle,
  breath,
} from '../agentMotion';
import type { AgentAnim } from '../agentMotion';
import { WALK_WORLD_RANGE } from '../surfaceConstants';
import type { AgentInfo, AgentStatus } from '../../types';

const IDS = Array.from({ length: 24 }, (_, i) => `agent-${i}`);
const KINDS: AgentAnim['kind'][] = ['walk', 'dig', 'shake', 'rest'];

function makeAgent(id: string, status: AgentStatus = 'working'): AgentInfo {
  return { id, source: 'claude-code', sessionId: `session-${id}`, status };
}

describe('hashAgentId', () => {
  it('is deterministic and non-negative', () => {
    for (const id of [...IDS, '', ' ', '😀', 'x'.repeat(500)]) {
      const h = hashAgentId(id);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(hashAgentId(id)).toBe(h);
    }
  });

  it('matches the legacy hash, so agents keep their identity across the port', () => {
    const legacy = (s: string): number => {
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
      }
      return Math.abs(h);
    };
    for (const id of ['', 'a', 'claude-code:abc123', 'cursor/9f8e7d', '😀x']) {
      expect(hashAgentId(id)).toBe(legacy(id));
    }
  });

  it('separates ids that differ by one character', () => {
    expect(hashAgentId('agent-1')).not.toBe(hashAgentId('agent-2'));
  });
});

describe('phaseOf', () => {
  it('spreads seeds rather than clustering them', () => {
    const phases = new Set(IDS.map((id) => phaseOf(hashAgentId(id))));
    // 24 ids over 97 slots: collisions are possible but near-total collapse
    // would mean every agent animates in lockstep.
    expect(phases.size).toBeGreaterThan(18);
  });

  it('is always a non-negative integer below 97', () => {
    for (const id of [...IDS, '', '😀']) {
      const p = phaseOf(hashAgentId(id));
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(97);
    }
  });
});

describe('computeAnims', () => {
  it('maps status to animation kind', () => {
    const anims = computeAnims([
      makeAgent('a', 'working'),
      makeAgent('b', 'error'),
      makeAgent('c', 'waiting'),
      makeAgent('d', 'done'),
    ]);
    expect(['walk', 'dig']).toContain(anims.get('a')!.kind);
    expect(anims.get('b')!.kind).toBe('shake');
    expect(anims.get('c')!.kind).toBe('rest');
    expect(anims.get('d')!.kind).toBe('rest');
  });

  it('derives the kind from the id, not the array index', () => {
    // The socket rebuilds the projects array every tick, so anything keyed off
    // position would flip an agent between walking and digging mid-frame.
    const agents = IDS.map((id) => makeAgent(id, 'working'));
    const base = computeAnims(agents);
    const orders = [
      [...agents].reverse(),
      agents.slice(7).concat(agents.slice(0, 7)),
      [...agents].sort((x, y) => x.id.localeCompare(y.id)),
      agents.slice(3, 9),
    ];
    for (const order of orders) {
      const shuffled = computeAnims(order);
      for (const a of order) {
        expect(shuffled.get(a.id)!.kind).toBe(base.get(a.id)!.kind);
      }
    }
  });

  it('splits working agents across both walk and dig', () => {
    const kinds = new Set(
      IDS.map((id) => computeAnims([makeAgent(id, 'working')]).get(id)!.kind),
    );
    expect(kinds).toEqual(new Set(['walk', 'dig']));
  });
});

describe('walkOffset', () => {
  it('is zero for every non-walking kind', () => {
    const seed = hashAgentId('agent-3');
    for (const kind of ['dig', 'shake', 'rest'] as AgentAnim['kind'][]) {
      for (let f = 0; f < 400; f++) {
        expect(walkOffset(f, seed, { kind })).toBe(0);
      }
    }
  });

  it('stays within WALK_WORLD_RANGE and reaches it', () => {
    const seed = hashAgentId('agent-5');
    let peak = 0;
    for (let f = 0; f < 5000; f++) {
      const o = walkOffset(f, seed, { kind: 'walk' });
      expect(Number.isFinite(o)).toBe(true);
      expect(Math.abs(o)).toBeLessThanOrEqual(WALK_WORLD_RANGE + 1e-9);
      peak = Math.max(peak, Math.abs(o));
    }
    expect(peak).toBeGreaterThan(WALK_WORLD_RANGE * 0.99);
  });

  it('faces the direction it is travelling, not the side it is on', () => {
    // Walking moves the figure across the surface, so facing has to follow the
    // sign of this offset's *change*. Keying it off the offset itself moonwalks
    // for a quarter of every cycle.
    const seed = hashAgentId('agent-9');
    const anim: AgentAnim = { kind: 'walk' };
    let disagreesWithPositionRule = false;

    for (let f = 0; f < 1200; f++) {
      const here = walkOffset(f, seed, anim);
      // Centred difference. A forward difference straddles the turning points,
      // where the velocity genuinely changes sign inside the step.
      const velocity =
        walkOffset(f + 0.01, seed, anim) - walkOffset(f - 0.01, seed, anim);
      if (Math.abs(velocity) < 1e-9) continue;

      const movingRight = velocity > 0;
      expect(walkFacesLeft(f, seed)).toBe(!movingRight);

      // Confirm the travel rule and the position rule genuinely disagree
      // somewhere, or this test would also pass against position-keyed facing.
      if (movingRight === here < 0) disagreesWithPositionRule = true;
    }

    expect(disagreesWithPositionRule).toBe(true);
  });

  it('depends on the id, not on position in any list', () => {
    const a = walkOffset(120, hashAgentId('agent-1'), { kind: 'walk' });
    const b = walkOffset(120, hashAgentId('agent-2'), { kind: 'walk' });
    expect(a).not.toBe(b);
    expect(walkOffset(120, hashAgentId('agent-1'), { kind: 'walk' })).toBe(a);
  });
});

describe('pose cycles', () => {
  it('keeps stride within [-1, 1] and uses the whole range', () => {
    const seed = hashAgentId('agent-7');
    let lo = Infinity;
    let hi = -Infinity;
    for (let f = 0; f < 5000; f++) {
      const v = strideCycle(f, seed);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeLessThan(-0.98);
    expect(hi).toBeGreaterThan(0.98);
  });

  it('keeps the dig stroke within [0, 1] and strikes fully', () => {
    const seed = hashAgentId('agent-4');
    let lo = Infinity;
    let hi = -Infinity;
    for (let f = 0; f < 5000; f++) {
      const v = digCycle(f, seed);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeLessThan(0.01);
    expect(hi).toBeGreaterThan(0.99);
  });

  it('breathes gently, and more slowly at rest than at work', () => {
    const seed = hashAgentId('agent-2');
    const swing = (kind: AgentAnim['kind']) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let f = 0; f < 200; f++) {
        const v = breath(f, seed, { kind });
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      return hi - lo;
    };
    // Over a short window the resting agent has barely moved, while a working
    // one has been through a full breath.
    expect(swing('rest')).toBeLessThan(swing('dig'));
    for (const kind of KINDS) {
      for (let f = 0; f < 500; f++) {
        expect(Math.abs(breath(f, seed, { kind }))).toBeLessThanOrEqual(0.0121);
      }
    }
  });

  it('is deterministic for a given id and clock', () => {
    const seed = hashAgentId('agent-11');
    for (const f of [0, 17, 340, 9999]) {
      expect(strideCycle(f, seed)).toBe(strideCycle(f, seed));
      expect(digCycle(f, seed)).toBe(digCycle(f, seed));
      expect(breath(f, seed, { kind: 'walk' })).toBe(
        breath(f, seed, { kind: 'walk' }),
      );
    }
  });
});
