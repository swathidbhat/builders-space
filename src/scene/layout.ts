import type { ProjectInfo } from '../types';

export interface OrbitalLayout {
  positions: [number, number, number][];
  ringRadii: number[];
}

const MAX_PER_RING = 8;
const BASE_RADIUS = 8;
const RING_SPACING = 6;

/**
 * Distribute projects into concentric rings sorted alphabetically by name.
 * Positions are stable: agent status and activity timestamps have no effect.
 */
export function layoutOrbitalLanes(projects: ProjectInfo[]): OrbitalLayout {
  if (projects.length === 0) return { positions: [], ringRadii: [] };
  if (projects.length === 1) return { positions: [[0, 0, 0]], ringRadii: [] };

  const sorted = projects
    .map((p, i) => ({ name: p.name, originalIndex: i }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const positions: [number, number, number][] = new Array(projects.length);
  const ringRadii: number[] = [];
  const ringCount = Math.ceil(sorted.length / MAX_PER_RING);

  for (let ring = 0; ring < ringCount; ring++) {
    const radius = BASE_RADIUS + ring * RING_SPACING;
    ringRadii.push(radius);

    const startIdx = ring * MAX_PER_RING;
    const endIdx = Math.min(startIdx + MAX_PER_RING, sorted.length);
    const planetsInRing = endIdx - startIdx;

    for (let i = startIdx; i < endIdx; i++) {
      const angle = ((i - startIdx) / planetsInRing) * Math.PI * 2;
      positions[sorted[i].originalIndex] = [
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      ];
    }
  }

  return { positions, ringRadii };
}
