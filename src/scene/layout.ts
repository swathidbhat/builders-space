import type { ProjectInfo } from '../types';
import { hashProjectName } from '../ui/planetIdentity';

export interface OrbitalLayout {
  positions: [number, number, number][];
  /** Every planet's distance from the origin, ascending. Used to frame the view. */
  ringRadii: number[];
}

/** Closest and furthest a planet sits from the origin. */
const INNER_RADIUS = 7;
const RADIAL_SPAN = 15;

/** How far a planet may drift above or below the midplane, at the outer edge. */
const VERTICAL_SPREAD = 4.2;

/** Jitter as a fraction of the gap to the next planet, so scatter cannot collide. */
const RADIAL_JITTER = 0.34;
const ANGULAR_JITTER = 0.28;

/**
 * The golden angle. Successive planets land ~137.5 degrees apart, which never
 * repeats into spokes or rings the way any rational fraction of a turn does.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Deterministic value in [0, 1) from a seed string. */
function unitHash(seed: string): number {
  return (hashProjectName(seed) % 10007) / 10007;
}

/**
 * Scatter projects through a volume of space around the origin.
 *
 * Positions are stable: they depend only on the set of project names, never on
 * agent status, activity timestamps, or the order the array arrives in.
 *
 * The distribution is a phyllotactic spiral — the arrangement seeds take in a
 * sunflower head — rather than concentric rings. Rings put every planet at one
 * of a few radii on a flat disc, and the eye reads that instantly as a circle;
 * the golden angle never closes into a ring or a spoke, so the same number of
 * planets reads as a scattered field. Radius grows with sqrt(index), which
 * spaces them evenly by area instead of bunching the outer ones.
 *
 * On top of that each planet is nudged by a hash of its own name — outward,
 * around, and off the midplane — so the underlying spiral does not show
 * through as a pattern either. The nudges are bounded by a fraction of the gap
 * to the next planet, so scatter can never collapse two together.
 */
export function layoutOrbitalLanes(projects: ProjectInfo[]): OrbitalLayout {
  if (projects.length === 0) return { positions: [], ringRadii: [] };
  if (projects.length === 1) return { positions: [[0, 0, 0]], ringRadii: [] };

  const sorted = projects
    .map((p, i) => ({ name: p.name, originalIndex: i }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const n = sorted.length;
  const positions: [number, number, number][] = new Array(n);
  const radii: number[] = [];

  // Even spacing by area: the gap between consecutive radii shrinks as the
  // spiral winds out, so the ring of space each planet occupies stays similar.
  const step = RADIAL_SPAN / Math.sqrt(n);

  for (let i = 0; i < n; i++) {
    const { name, originalIndex } = sorted[i];

    const t = (i + 0.5) / n;
    const baseRadius = INNER_RADIUS + RADIAL_SPAN * Math.sqrt(t);
    const baseAngle = i * GOLDEN_ANGLE;

    // Signed nudges in [-1, 1], each from its own seed so they don't correlate.
    const dr = 2 * unitHash(`${name}#r`) - 1;
    const da = 2 * unitHash(`${name}#a`) - 1;
    const dy = 2 * unitHash(`${name}#y`) - 1;

    const radius = baseRadius + dr * step * RADIAL_JITTER;
    const angle = baseAngle + (da * ANGULAR_JITTER * step) / Math.max(radius, 1);

    // Outer planets may sit further off the midplane than inner ones, so the
    // field opens out into a volume rather than thickening into a slab.
    const lift = dy * VERTICAL_SPREAD * (0.35 + 0.65 * Math.sqrt(t));

    positions[originalIndex] = [
      Math.cos(angle) * radius,
      lift,
      Math.sin(angle) * radius,
    ];
    radii.push(Math.hypot(radius, lift));
  }

  return { positions, ringRadii: radii.sort((a, b) => a - b) };
}
