import { describe, expect, it } from 'vitest';
import { Object3D, PerspectiveCamera } from 'three';
import { planetCameraTarget, spaceCameraTarget } from '../cameraTarget';
import {
  chromeForbidden,
  clampedLabelScale,
  labelPriority,
  labelStyle,
  MIN_LABEL_PX,
  resolveLabelCollisions,
} from '../labelPlacement';
import { FiberClock } from '../fiberClock';
import { advancePlanetMesh } from '../Planet';
import {
  buildColors,
  fragmentShader,
  getPlanetType,
  hashString,
  seededRandom,
} from '../planetLook';
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
    expect(statusRingLook('waiting')).toEqual({ thickness: 0.09, color: '#ffc14d' });
    expect(statusRingLook('active')).toBeNull();
    expect(statusRingLook('idle')).toBeNull();
  });

  it('expands four error rings and keeps two waiting rings visible', () => {
    const error = sampleStatusRing('error', 0.2, 2, 1);
    expect(error.scale).toBeGreaterThan(2 * 1.2);
    expect(error.scale).toBeLessThan(2 * 2.5);
    expect(error.opacity).toBeGreaterThanOrEqual(0);

    const waiting = sampleStatusRing('waiting', 0, 2, 0);
    expect(waiting.scale).toBeCloseTo(2 * 1.2);
    expect(waiting.opacity).toBeCloseTo(0.95);

    const second = sampleStatusRing('waiting', 0, 2, 1);
    expect(second.scale).toBeGreaterThan(2 * 1.2);
    expect(second.opacity).toBeGreaterThanOrEqual(0.55);

    for (let index = 2; index < STATUS_RING_COUNT; index++) {
      expect(sampleStatusRing('waiting', 0.5, 2, index)).toEqual({ opacity: 0, scale: null });
    }
  });
});

describe('planet mesh motion', () => {
  it('spins a busy planet faster and swells it while hovered', () => {
    const mesh = {
      rotation: { y: 0 },
      scale: {
        x: 1,
        setScalar(value: number) {
          this.x = value;
        },
      },
    };
    advancePlanetMesh(mesh, 1, false, true);
    expect(mesh.rotation.y).toBeCloseTo(0.06);
    expect(mesh.scale.x).toBeGreaterThan(1);

    const idle = {
      rotation: { y: 0 },
      scale: {
        x: 1.04,
        setScalar(value: number) {
          this.x = value;
        },
      },
    };
    advancePlanetMesh(idle, 1, true, false);
    expect(idle.rotation.y).toBeCloseTo(0.006);
    expect(idle.scale.x).toBeLessThan(1.04);
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
    expect(fragmentShader).toContain('uDim * 0.72');
    expect(fragmentShader).toContain('uHover');

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
    expect(prettifyName('checkout-service')).toBe('Checkout Service');
    expect(prettifyName('ml-pipeline')).toBe('ML Pipeline');
    expect(prettifyName('api-gateway')).toBe('API Gateway');
  });
});

describe('label placement', () => {
  it('places a label in front of the camera and hides one behind it', () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 500);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const front = new Object3D();
    front.position.set(0, 0, 0);
    const shown = labelStyle(front, camera, 200, 200, 10);
    expect(shown.visible).toBe(true);
    expect(shown.transform).toContain('translate3d(');
    expect(shown.transform).toContain('scale(');
    expect(Number(shown.zIndex)).not.toBeNaN();

    const behind = new Object3D();
    behind.position.set(0, 0, 20);
    expect(labelStyle(behind, camera, 200, 200, 10).visible).toBe(false);
  });

  it('keeps the on-screen size between 13px and the CSS size', () => {
    expect(clampedLabelScale(0.2)).toBeCloseTo(MIN_LABEL_PX / 14);
    expect(clampedLabelScale(4)).toBe(1);
    expect(clampedLabelScale(Number.NaN)).toBeCloseTo(MIN_LABEL_PX / 14);

    const camera = new PerspectiveCamera(60, 1, 0.1, 2000);
    camera.position.set(0, 20, 30);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const far = new Object3D();
    far.position.set(80, 0, -40);
    const shown = labelStyle(far, camera, 1920, 1080, 10);
    const scale = Number(/scale\(([^)]+)\)/.exec(shown.transform)?.[1]);
    expect(scale).toBeGreaterThanOrEqual(MIN_LABEL_PX / 14 - 0.001);
    expect(scale).toBeLessThanOrEqual(1);
  });

  it('moves attention labels below the HUD and apart from each other', () => {
    const boxes = [
      {
        id: 'quiet',
        x: 400,
        y: 40,
        width: 140,
        height: 36,
        priority: labelPriority('idle', false),
      },
      {
        id: 'error',
        x: 400,
        y: 40,
        width: 140,
        height: 36,
        priority: labelPriority('error', false),
      },
      {
        id: 'wait',
        x: 420,
        y: 48,
        width: 140,
        height: 36,
        priority: labelPriority('waiting', false),
      },
    ];
    const viewport = { width: 1920, height: 1080 };
    const placed = resolveLabelCollisions(
      boxes,
      chromeForbidden(1920, 1080, {
        sidebarOpen: true,
        panelOpen: true,
      }),
      viewport,
    );
    const byId = Object.fromEntries(placed.map((spot) => [spot.id, spot]));
    expect(byId.error.y).toBeGreaterThanOrEqual(112);
    expect(byId.wait.y).toBeGreaterThanOrEqual(112);
    expect(byId.quiet.y).toBeGreaterThan(byId.error.y);
    expect(Math.abs(byId.error.y - byId.wait.y)).toBeGreaterThanOrEqual(14);

    const clear = resolveLabelCollisions(
      [{ id: 'solo', x: 900, y: 400, width: 80, height: 30, priority: 3 }],
      chromeForbidden(1920, 1080, { sidebarOpen: false, panelOpen: false }),
      viewport,
    );
    expect(clear).toEqual([{ id: 'solo', x: 900, y: 400 }]);
  });

  it('slides a label out of the sidebar and the detail panel', () => {
    const viewport = { width: 1000, height: 800 };
    const placed = resolveLabelCollisions(
      [
        { id: 'left', x: 40, y: 300, width: 100, height: 32, priority: 3 },
        { id: 'right', x: 960, y: 300, width: 100, height: 32, priority: 2 },
      ],
      chromeForbidden(1000, 800, { sidebarOpen: true, panelOpen: true }),
      viewport,
    );
    const byId = Object.fromEntries(placed.map((spot) => [spot.id, spot]));
    expect(byId.left.x - 50).toBeGreaterThanOrEqual(248);
    expect(byId.right.x + 50).toBeLessThanOrEqual(1000 - 420);
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
