import { describe, it, expect } from 'vitest';
import { terrainHeight, buildGroundPatch } from '../surfaceTerrain';
import {
  PATCH_ANGLE,
  PATCH_RINGS,
  PATCH_SEGMENTS,
  PLANET_RADIUS,
  TERRAIN_MAX,
  TERRAIN_MIN,
} from '../surfaceConstants';

type Dir = [number, number, number];

/** Deterministic LCG so a failure is always reproducible. */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeDirections(count: number, seed = 20260812): Dir[] {
  const rand = makeRandom(seed);
  return Array.from({ length: count }, () => {
    const z = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), r * Math.sin(a), z] as Dir;
  });
}

function normalize([x, y, z]: Dir): Dir {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

describe('terrainHeight', () => {
  it('is deterministic for the same project and direction', () => {
    for (const dir of makeDirections(50)) {
      expect(terrainHeight('builders-space', dir)).toBe(
        terrainHeight('builders-space', dir),
      );
    }
  });

  it('stays within [TERRAIN_MIN, TERRAIN_MAX] everywhere on the sphere', () => {
    for (const name of ['builders-space', 'Alpha', 'zeta-project', '']) {
      for (const dir of makeDirections(400)) {
        const h = terrainHeight(name, dir);
        expect(h).toBeGreaterThanOrEqual(TERRAIN_MIN);
        expect(h).toBeLessThanOrEqual(TERRAIN_MAX);
      }
    }
  });

  it('covers a useful part of the band rather than hugging the middle', () => {
    let min = Infinity;
    let max = -Infinity;
    for (const dir of makeDirections(2000)) {
      const h = terrainHeight('builders-space', dir);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect((max - min) / (TERRAIN_MAX - TERRAIN_MIN)).toBeGreaterThan(0.5);
  });

  it('is continuous: a 1e-4 step moves the height by well under 5e-4', () => {
    const bases = makeDirections(600, 777);
    const offsets = makeDirections(600, 31337);
    for (let i = 0; i < bases.length; i++) {
      const a = bases[i];
      const o = offsets[i];
      const b = normalize([
        a[0] + o[0] * 1e-4,
        a[1] + o[1] * 1e-4,
        a[2] + o[2] * 1e-4,
      ]);
      const delta = Math.abs(
        terrainHeight('builders-space', a) - terrainHeight('builders-space', b),
      );
      expect(delta).toBeLessThan(5e-4);
    }
  });

  it('has no seam at the poles or the +-180 meridian', () => {
    const seamPairs: [Dir, Dir][] = [
      [[1e-6, 1, 0], [-1e-6, 1, 0]],
      [[0, 1, 1e-6], [0, 1, -1e-6]],
      [[0, -1, 1e-6], [0, -1, -1e-6]],
      [[-1, 0, 1e-6], [-1, 0, -1e-6]],
      [[-1, 0.3, 1e-6], [-1, 0.3, -1e-6]],
    ];
    for (const [a, b] of seamPairs) {
      const delta = Math.abs(
        terrainHeight('builders-space', normalize(a)) -
          terrainHeight('builders-space', normalize(b)),
      );
      expect(delta).toBeLessThan(1e-5);
    }
  });

  it('gives different projects different height fields', () => {
    const dirs = makeDirections(200);
    const a = dirs.map((d) => terrainHeight('Alpha', d));
    const b = dirs.map((d) => terrainHeight('Beta', d));
    expect(a).not.toEqual(b);

    const meanAbsDiff =
      a.reduce((acc, h, i) => acc + Math.abs(h - b[i]), 0) / a.length;
    expect(meanAbsDiff).toBeGreaterThan(0.1 * (TERRAIN_MAX - TERRAIN_MIN));
  });

  it('ignores the magnitude of a non-unit direction', () => {
    const [x, y, z] = makeDirections(1)[0];
    expect(terrainHeight('builders-space', [x * 7, y * 7, z * 7])).toBeCloseTo(
      terrainHeight('builders-space', [x, y, z]),
      12,
    );
  });
});

describe('buildGroundPatch', () => {
  const anchors: Dir[] = [
    [0, 1, 0],
    [0, -1, 0],
    [1, 0, 0],
    normalize([0.3, 0.8, 0.5]),
  ];

  it('returns a geometry with position, color, index and normals', () => {
    const geometry = buildGroundPatch('builders-space', [0, 1, 0]);
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex();

    expect(position).toBeDefined();
    expect(color).toBeDefined();
    expect(normal).toBeDefined();
    expect(index).not.toBeNull();

    expect(position.count).toBe(1 + PATCH_RINGS * PATCH_SEGMENTS);
    expect(color.count).toBe(position.count);
    expect(normal.count).toBe(position.count);
    expect(index!.count).toBe(PATCH_SEGMENTS * (2 * PATCH_RINGS - 1) * 3);

    let shortest = Infinity;
    let longest = -Infinity;
    for (let i = 0; i < normal.count; i++) {
      const len = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
      shortest = Math.min(shortest, len);
      longest = Math.max(longest, len);
    }
    expect(shortest).toBeCloseTo(1, 4);
    expect(longest).toBeCloseTo(1, 4);
  });

  it('orients normals away from the planet centre', () => {
    for (const anchor of anchors) {
      const geometry = buildGroundPatch('builders-space', anchor);
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      let minDot = Infinity;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const r = Math.hypot(x, y, z);
        const dot =
          (x * normal.getX(i) + y * normal.getY(i) + z * normal.getZ(i)) / r;
        minDot = Math.min(minDot, dot);
      }
      expect(minDot).toBeGreaterThan(0.5);
    }
  });

  it('indexes only existing vertices', () => {
    const geometry = buildGroundPatch('builders-space', [0, 1, 0]);
    const index = geometry.getIndex()!;
    const count = geometry.getAttribute('position').count;
    let outOfRange = 0;
    for (let i = 0; i < index.count; i++) {
      const v = index.getX(i);
      if (v < 0 || v >= count) outOfRange++;
    }
    expect(outOfRange).toBe(0);
  });

  it('keeps every vertex within PATCH_ANGLE of the anchor', () => {
    for (const anchor of anchors) {
      const position = buildGroundPatch('builders-space', anchor).getAttribute(
        'position',
      );
      let widest = 0;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const r = Math.hypot(x, y, z);
        const dot = (x * anchor[0] + y * anchor[1] + z * anchor[2]) / r;
        widest = Math.max(widest, Math.acos(Math.min(1, Math.max(-1, dot))));
      }
      expect(widest).toBeLessThanOrEqual(PATCH_ANGLE + 1e-6);
      // and the patch really does reach the far edge
      expect(widest).toBeGreaterThan(PATCH_ANGLE - 1e-6);
    }
  });

  it('keeps every vertex radius inside the displaced sphere band', () => {
    for (const anchor of anchors) {
      const position = buildGroundPatch('builders-space', anchor).getAttribute(
        'position',
      );
      let lowest = Infinity;
      let highest = -Infinity;
      for (let i = 0; i < position.count; i++) {
        const r = Math.hypot(
          position.getX(i),
          position.getY(i),
          position.getZ(i),
        );
        lowest = Math.min(lowest, r);
        highest = Math.max(highest, r);
      }
      expect(lowest).toBeGreaterThanOrEqual(PLANET_RADIUS + TERRAIN_MIN - 1e-6);
      expect(highest).toBeLessThanOrEqual(PLANET_RADIUS + TERRAIN_MAX + 1e-6);
    }
  });

  it('places vertices at the same height terrainHeight reports', () => {
    const geometry = buildGroundPatch('builders-space', [0, 1, 0]);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 257) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const r = Math.hypot(x, y, z);
      const expected =
        PLANET_RADIUS +
        terrainHeight('builders-space', [x / r, y / r, z / r]);
      expect(r).toBeCloseTo(expected, 5);
    }
  });

  it('has no NaN in any attribute', () => {
    for (const anchor of anchors) {
      const geometry = buildGroundPatch('builders-space', anchor);
      for (const name of ['position', 'color', 'normal']) {
        const values = geometry.getAttribute(name).array;
        let bad = 0;
        for (let i = 0; i < values.length; i++) {
          if (!Number.isFinite(values[i])) bad++;
        }
        expect(`${name}: ${bad}`).toBe(`${name}: 0`);
      }
      const index = geometry.getIndex()!.array;
      let badIndex = 0;
      for (let i = 0; i < index.length; i++) {
        if (!Number.isFinite(index[i])) badIndex++;
      }
      expect(badIndex).toBe(0);
    }
  });

  it('colours vertices by height', () => {
    const geometry = buildGroundPatch('builders-space', [0, 1, 0]);
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');

    let lowest = 0;
    let highest = 0;
    let lowR = Infinity;
    let highR = -Infinity;
    for (let i = 0; i < position.count; i++) {
      const r = Math.hypot(
        position.getX(i),
        position.getY(i),
        position.getZ(i),
      );
      if (r < lowR) {
        lowR = r;
        lowest = i;
      }
      if (r > highR) {
        highR = r;
        highest = i;
      }
    }

    const luma = (i: number) =>
      0.299 * color.getX(i) + 0.587 * color.getY(i) + 0.114 * color.getZ(i);
    expect(luma(highest)).toBeGreaterThan(luma(lowest));

    const channels = color.array;
    let outOfGamut = 0;
    for (let i = 0; i < channels.length; i++) {
      if (channels[i] < 0 || channels[i] > 1) outOfGamut++;
    }
    expect(outOfGamut).toBe(0);
  });

  it('concentrates ring resolution near the anchor', () => {
    const geometry = buildGroundPatch('builders-space', [0, 1, 0]);
    const position = geometry.getAttribute('position');

    // Ring r occupies vertices [1 + (r-1)*SEGMENTS, ...]; compare the arc gap
    // between the first two rings against the gap between the last two.
    const arcOf = (ring: number) => {
      const i = 1 + (ring - 1) * PATCH_SEGMENTS;
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      return Math.acos(Math.min(1, y / Math.hypot(x, y, z)));
    };

    const nearGap = arcOf(2) - arcOf(1);
    const farGap = arcOf(PATCH_RINGS) - arcOf(PATCH_RINGS - 1);
    expect(nearGap).toBeLessThan(farGap * 0.25);
  });

  it('is a closed fan: no duplicate directed edge, boundary only at the rim', () => {
    const index = buildGroundPatch('builders-space', [0, 1, 0]).getIndex()!;
    const key = (a: number, b: number) => a * 65536 + b;
    const seen = new Set<number>();
    let duplicates = 0;
    for (let t = 0; t < index.count; t += 3) {
      const tri = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      for (let e = 0; e < 3; e++) {
        const k = key(tri[e], tri[(e + 1) % 3]);
        if (seen.has(k)) duplicates++;
        seen.add(k);
      }
    }
    expect(duplicates).toBe(0);

    // An edge with no opposing twin is on the patch boundary, and for a fan
    // closed at the anchor that is exactly the outermost ring.
    const rimStart = 1 + (PATCH_RINGS - 1) * PATCH_SEGMENTS;
    let boundary = 0;
    let offRim = 0;
    for (const k of seen) {
      const a = Math.floor(k / 65536);
      const b = k % 65536;
      if (seen.has(key(b, a))) continue;
      boundary++;
      if (a < rimStart || b < rimStart) offRim++;
    }
    expect(boundary).toBe(PATCH_SEGMENTS);
    expect(offRim).toBe(0);
  });

  it('falls back to a valid frame for a degenerate anchor', () => {
    const values = buildGroundPatch('builders-space', [0, 0, 0]).getAttribute(
      'position',
    ).array;
    let bad = 0;
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(values[i])) bad++;
    }
    expect(bad).toBe(0);
  });

  it('is deterministic per project name', () => {
    const a = buildGroundPatch('builders-space', [0, 1, 0]).getAttribute(
      'position',
    ).array;
    const b = buildGroundPatch('builders-space', [0, 1, 0]).getAttribute(
      'position',
    ).array;
    const c = buildGroundPatch('other-project', [0, 1, 0]).getAttribute(
      'position',
    ).array;

    let sameAsB = 0;
    let sameAsC = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) sameAsB++;
      if (a[i] === c[i]) sameAsC++;
    }
    expect(sameAsB).toBe(a.length);
    expect(sameAsC).toBeLessThan(a.length);
  });
});
