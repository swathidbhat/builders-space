import type { Vector3 } from 'three';

export const CAMERA_SETTLE_DISTANCE = 0.05;

export function stepCamera(input: {
  delta: number;
  reducedMotion: boolean;
  position: Vector3;
  targetPosition: Vector3;
  lookAt: Vector3;
  targetLookAt: Vector3;
  transitioning: boolean;
}): { transitioning: boolean; needsFrame: boolean } {
  if (input.reducedMotion) {
    input.position.copy(input.targetPosition);
    input.lookAt.copy(input.targetLookAt);
    return { transitioning: false, needsFrame: false };
  }

  const factor = 1 - Math.exp(-5 * input.delta);
  input.position.lerp(input.targetPosition, factor);
  input.lookAt.lerp(input.targetLookAt, factor);

  const settled =
    input.position.distanceTo(input.targetPosition) < CAMERA_SETTLE_DISTANCE &&
    input.lookAt.distanceTo(input.targetLookAt) < CAMERA_SETTLE_DISTANCE;

  if (settled) {
    input.position.copy(input.targetPosition);
    input.lookAt.copy(input.targetLookAt);
    return { transitioning: false, needsFrame: false };
  }

  return { transitioning: input.transitioning, needsFrame: true };
}
