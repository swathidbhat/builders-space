import { describe, expect, it } from 'vitest';
import { planetCameraTarget, spaceCameraTarget } from '../cameraTarget';
import { FiberClock } from '../fiberClock';
import { buildColors, getPlanetType, hashString, seededRandom } from '../planetLook';
import { prettifyName } from '../../prettifyName';
import { STATUS_RING_COUNT, sampleStatusRing, statusRingLook } from '../statusRingMotion';

describe('camera targets', () => {
  it('offsets a planet camera and looks at the planet', () => {
    expect(planetCameraTarget([3, 1, -2])).toEqual({
      pos: { x: 7, y: 3, z: 2 },
      lookAt: { x: 3, y: 1, z: -2 },
    });
  });

  it('fits the widest ring and never sits closer than 14', () => {
    const close = spaceCameraTarget([2]);
    expect(close.pos.y).toBeCloseTo(14 * 0.65);
    expect(close.pos.z).toBeCloseTo(14 * 0.6);
    expect(close.lookAt).toEqual({ x: 0, y: 0, z: 0 });

    const wide = spaceCameraTarget([4, 40]);
    const fovRad = (60 / 2) * (Math.PI / 180);
    const dist = (40 * 1.5) / Math.tan(fovRad);
    expect(wide.pos.y).toBeCloseTo(dist * 0.65);
    expect(wide.pos.z).toBeCloseTo(dist * 0.6);
  });

  it('uses a default radius when there are no rings', () => {
    const target = spaceCameraTarget([]);
    const fovRad = (60 / 2) * (Math.PI / 180);
    const dist = Math.max(14, (10 * 1.5) / Math.tan(fovRad));
    expect(target.pos.y).toBeCloseTo(dist * 0.65);
  });
});

describe('status ring motion', () => {
  it('styles error and waiting rings and hides the rest', () => {
    expect(statusRingLook('error')).toEqual({ thickness: 0.06, color: '#ff4444' });
    expect(statusRingLook('waiting')).toEqual({ thickness: 0.05, color: '#ffaa44' });
    expect(statusRingLook('active')).toBeNull();
    expect(statusRingLook('idle')).toBeNull();
  });

  it('expands four error rings and only the first waiting ring', () => {
    const error = sampleStatusRing('error', 0.2, 2, 1);
    expect(error.scale).toBeGreaterThan(2 * 1.2);
    expect(error.scale).toBeLessThan(2 * 2.5);
    expect(error.opacity).toBeGreaterThanOrEqual(0);

    const waiting = sampleStatusRing('waiting', 0, 2, 0);
    expect(waiting.scale).toBeCloseTo(2 * 1.2);
    expect(waiting.opacity).toBeCloseTo(0.9);

    for (let index = 1; index < STATUS_RING_COUNT; index++) {
      expect(sampleStatusRing('waiting', 0.5, 2, index)).toEqual({ opacity: 0, scale: null });
    }
  });
});

describe('planet look', () => {
  it('hashes a name to a stable planet type and palette', () => {
    expect(hashString('lumen')).toBe(hashString('lumen'));
    expect(hashString('lumen')).not.toBe(hashString('nova'));
    const seed = hashString('lumen');
    expect(getPlanetType(seed)).toBe(getPlanetType(seed));

    const first = buildColors(getPlanetType(seed), seededRandom(seed));
    const second = buildColors(getPlanetType(seed), seededRandom(seed));
    expect(first.color1.getHexString()).toBe(second.color1.getHexString());
    expect(first.rimColor.getHexString()).toBe(second.rimColor.getHexString());

    for (const type of ['gasGiant', 'rocky', 'oceanic', 'volcanic', 'ice'] as const) {
      const colors = buildColors(type, seededRandom(3));
      expect(colors.color1.getHexString()).toMatch(/^[0-9a-f]{6}$/);
      expect(colors.color3.getHexString()).not.toBe('');
    }
  });
});

describe('prettifyName', () => {
  it('turns separators into title case', () => {
    expect(prettifyName('lumen-lab')).toBe('Lumen Lab');
    expect(prettifyName('foo_bar')).toBe('Foo Bar');
  });
});

describe('FiberClock', () => {
  it('tracks elapsed time without constructing THREE.Clock', () => {
    const clock = new FiberClock(false);
    expect(clock.getDelta()).toBe(0);
    expect(clock.running).toBe(false);
    clock.start();
    expect(clock.running).toBe(true);
    expect(clock.getElapsedTime()).toBeGreaterThanOrEqual(0);
    clock.stop();
    expect(clock.running).toBe(false);
    expect(clock.autoStart).toBe(false);
  });

  it('starts itself on the first delta when autoStart is left on', () => {
    const clock = new FiberClock();
    expect(clock.getDelta()).toBe(0);
    expect(clock.running).toBe(true);
    expect(clock.getDelta()).toBeGreaterThanOrEqual(0);
  });
});
