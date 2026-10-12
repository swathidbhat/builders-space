import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { stepCamera } from '../cameraMotion';

function rig(position: [number, number, number], target: [number, number, number]) {
  return {
    position: new Vector3(...position),
    targetPosition: new Vector3(...target),
    lookAt: new Vector3(0, 0, 0),
    targetLookAt: new Vector3(0, 1, 0),
  };
}

describe('camera motion', () => {
  it('keeps requesting frames until the camera settles, then stops', () => {
    const camera = rig([0, 20, 30], [4, 2, 4]);
    const first = stepCamera({
      delta: 0.016,
      reducedMotion: false,
      transitioning: true,
      ...camera,
    });
    expect(first.needsFrame).toBe(true);
    expect(first.transitioning).toBe(true);
    expect(camera.position.distanceTo(camera.targetPosition)).toBeGreaterThan(0.05);

    let step = first;
    for (let frame = 0; frame < 240 && step.needsFrame; frame++) {
      step = stepCamera({
        delta: 0.016,
        reducedMotion: false,
        transitioning: step.transitioning,
        ...camera,
      });
    }
    expect(step.needsFrame).toBe(false);
    expect(step.transitioning).toBe(false);
    expect(camera.position.distanceTo(camera.targetPosition)).toBe(0);
    expect(camera.lookAt.distanceTo(camera.targetLookAt)).toBe(0);
  });

  it('snaps to the target when motion is reduced', () => {
    const camera = rig([0, 20, 30], [4, 2, 4]);
    const step = stepCamera({
      delta: 0.016,
      reducedMotion: true,
      transitioning: true,
      ...camera,
    });
    expect(step).toEqual({ transitioning: false, needsFrame: false });
    expect(camera.position.equals(camera.targetPosition)).toBe(true);
    expect(camera.lookAt.equals(camera.targetLookAt)).toBe(true);
  });
});
