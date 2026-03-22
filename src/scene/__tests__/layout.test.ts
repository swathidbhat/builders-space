import { describe, it, expect } from 'vitest';
import { layoutOrbitalLanes } from '../layout';
import type { ProjectInfo } from '../../types';

function makeProject(
  name: string,
  agents: { status: string; lastActivityMs?: number }[] = [],
): ProjectInfo {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    path: `/home/user/${name}`,
    fileCount: 10,
    agents: agents.map((a, i) => ({
      id: `${name}-agent-${i}`,
      source: 'claude-code' as const,
      sessionId: `session-${i}`,
      status: a.status as any,
      lastActivityMs: a.lastActivityMs,
    })),
  };
}

describe('layoutOrbitalLanes', () => {
  it('returns empty layout for no projects', () => {
    const result = layoutOrbitalLanes([]);
    expect(result.positions).toEqual([]);
    expect(result.ringRadii).toEqual([]);
  });

  it('places a single project at the origin', () => {
    const result = layoutOrbitalLanes([makeProject('Solo')]);
    expect(result.positions).toEqual([[0, 0, 0]]);
    expect(result.ringRadii).toEqual([]);
  });

  it('places all projects on the XZ plane (y = 0)', () => {
    const projects = [
      makeProject('Alpha'),
      makeProject('Beta'),
      makeProject('Gamma'),
    ];
    const { positions } = layoutOrbitalLanes(projects);
    for (const [, y] of positions) {
      expect(y).toBe(0);
    }
  });

  it('assigns positions deterministically by project name', () => {
    const projects = [
      makeProject('Zeta'),
      makeProject('Alpha'),
      makeProject('Mango'),
    ];
    const a = layoutOrbitalLanes(projects);
    const b = layoutOrbitalLanes(projects);
    expect(a.positions).toEqual(b.positions);
    expect(a.ringRadii).toEqual(b.ringRadii);
  });

  it('does NOT change positions when agent status changes', () => {
    const idle = [
      makeProject('Alpha', [{ status: 'waiting', lastActivityMs: 100 }]),
      makeProject('Beta', [{ status: 'done', lastActivityMs: 50 }]),
      makeProject('Gamma', []),
    ];
    const active = [
      makeProject('Alpha', [{ status: 'working', lastActivityMs: 9999 }]),
      makeProject('Beta', [{ status: 'working', lastActivityMs: 8000 }]),
      makeProject('Gamma', [{ status: 'error', lastActivityMs: 7000 }]),
    ];
    const idleLayout = layoutOrbitalLanes(idle);
    const activeLayout = layoutOrbitalLanes(active);
    expect(idleLayout.positions).toEqual(activeLayout.positions);
    expect(idleLayout.ringRadii).toEqual(activeLayout.ringRadii);
  });

  it('does NOT change positions when lastActivityMs changes', () => {
    const before = [
      makeProject('Alpha', [{ status: 'working', lastActivityMs: 100 }]),
      makeProject('Beta', [{ status: 'working', lastActivityMs: 200 }]),
    ];
    const after = [
      makeProject('Alpha', [{ status: 'working', lastActivityMs: 99999 }]),
      makeProject('Beta', [{ status: 'working', lastActivityMs: 1 }]),
    ];
    expect(layoutOrbitalLanes(before).positions).toEqual(
      layoutOrbitalLanes(after).positions,
    );
  });

  it('distributes >8 projects across multiple rings', () => {
    const projects = Array.from({ length: 12 }, (_, i) =>
      makeProject(`Project-${String.fromCharCode(65 + i)}`),
    );
    const { positions, ringRadii } = layoutOrbitalLanes(projects);
    expect(positions).toHaveLength(12);
    expect(ringRadii.length).toBeGreaterThanOrEqual(2);

    const radii = positions.map(([x, , z]) => Math.sqrt(x * x + z * z));
    const uniqueRadii = new Set(radii.map((r) => Math.round(r * 100)));
    expect(uniqueRadii.size).toBeGreaterThanOrEqual(2);
  });

  it('gives every project a unique position', () => {
    const projects = Array.from({ length: 6 }, (_, i) =>
      makeProject(`P${i}`),
    );
    const { positions } = layoutOrbitalLanes(projects);
    const serialized = positions.map((p) => p.join(','));
    expect(new Set(serialized).size).toBe(6);
  });

  it('preserves positions when input order changes', () => {
    const a = makeProject('Alpha');
    const b = makeProject('Beta');
    const c = makeProject('Gamma');

    const layout1 = layoutOrbitalLanes([a, b, c]);
    const layout2 = layoutOrbitalLanes([c, a, b]);

    const pos1ByName = { Alpha: layout1.positions[0], Beta: layout1.positions[1], Gamma: layout1.positions[2] };
    const pos2ByName = { Alpha: layout2.positions[1], Beta: layout2.positions[2], Gamma: layout2.positions[0] };

    for (const name of ['Alpha', 'Beta', 'Gamma'] as const) {
      expect(pos1ByName[name]).toEqual(pos2ByName[name]);
    }
  });
});
