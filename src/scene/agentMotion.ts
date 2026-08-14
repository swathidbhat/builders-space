/**
 * Which animation an agent plays, and how it moves across the ground.
 *
 * Pure and renderer-free: AgentFigure turns these into limb rotations, and the
 * tests pin the properties that matter without touching Three.js.
 *
 * The `f` parameter is an animation clock in sixtieths of a second — the frame
 * count of a nominal 60fps. Callers pass `elapsedTime * 60` rather than a raw
 * frame counter so the motion runs at the same speed on any display.
 */
import type { AgentInfo } from '../types';
import { WALK_WORLD_RANGE } from './surfaceConstants';

/** Stable non-negative hash of an agent id. Use it to build the motion seed. */
export function hashAgentId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h) + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Per-agent animation phase. Spread over 97 so neighbouring seeds rarely move
 * in lockstep, and stable because it comes from the id rather than the agent's
 * position in an array — the socket rebuilds that array every tick.
 */
export function phaseOf(seed: number): number {
  return Math.abs(seed | 0) % 97;
}

export interface AgentAnim {
  kind: 'walk' | 'dig' | 'shake' | 'rest';
}

/** Animation kind per agent, derived from status. Stable per agent id. */
export function computeAnims(agents: AgentInfo[]): Map<string, AgentAnim> {
  const anims = new Map<string, AgentAnim>();
  for (const a of agents) {
    if (a.status === 'working') {
      anims.set(a.id, { kind: hashAgentId(a.id) % 3 === 0 ? 'walk' : 'dig' });
    } else if (a.status === 'error') {
      anims.set(a.id, { kind: 'shake' });
    } else {
      anims.set(a.id, { kind: 'rest' });
    }
  }
  return anims;
}

/**
 * Signed offset along the band, in world units, for a walking agent.
 * Zero for every other kind — only walkers travel.
 */
export function walkOffset(f: number, seed: number, anim: AgentAnim): number {
  if (anim.kind !== 'walk') return 0;
  return Math.sin(f * 0.025 + phaseOf(seed) * 2) * WALK_WORLD_RANGE;
}

/**
 * Whether a walking agent faces left (against the band axis).
 *
 * It faces the direction it is travelling, which is the sign of `walkOffset`'s
 * derivative — hence cos where the offset itself is sin. Keying facing off
 * position instead moonwalks for a quarter of every cycle.
 */
export function walkFacesLeft(f: number, seed: number): boolean {
  return Math.cos(f * 0.025 + phaseOf(seed) * 2) < 0;
}

/** Normalised stride position in [-1, 1] — drives leg and arm swing. */
export function strideCycle(f: number, seed: number): number {
  return Math.sin(f * 0.18 + phaseOf(seed));
}

/** Normalised swing of a dig stroke in [0, 1], 0 = raised, 1 = struck. */
export function digCycle(f: number, seed: number): number {
  const c = Math.sin(f * 0.12 + phaseOf(seed));
  return (c + 1) / 2;
}

/** Small vertical breathing offset as a fraction of agent height. */
export function breath(f: number, seed: number, anim: AgentAnim): number {
  const rate = anim.kind === 'rest' ? 0.015 : 0.05;
  return Math.sin(f * rate + phaseOf(seed) * 2.7) * 0.012;
}
