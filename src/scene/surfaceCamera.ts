/**
 * Camera poses and the orbit -> surface descent path.
 *
 * A straight positional lerp is wrong for this transition: it grazes inner-ring
 * planets on the way down and the perceived zoom rate is wildly uneven across a
 * ~30x change in scale. Instead the path is interpolated in planet-relative
 * spherical terms — direction slerps, distance eases geometrically — so the
 * descent reads as a constant-rate fall toward the surface.
 */
import * as THREE from 'three';
import {
  PLANET_RADIUS,
  EYE_HEIGHT,
  CAMERA_PITCH,
  HORIZON_ANGLE,
  DESCENT_SECONDS,
  DESCENT_SECONDS_REDUCED,
  OVERVIEW_OFFSET,
} from './surfaceConstants';

export interface CameraPose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  /**
   * Roll reference for `camera.lookAt`.
   *
   * Not optional decoration: standing anywhere but the north pole, the local
   * surface normal is not world-up, and leaving `camera.up` at (0,1,0) rolls
   * the horizon by the angle between them — up to fully vertical for a camp in
   * the southern hemisphere.
   */
  up: THREE.Vector3;
}

export function makePose(): CameraPose {
  return {
    position: new THREE.Vector3(),
    lookAt: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
  };
}

export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Gentler than cubic: peak velocity is 1.57x the average rather than 2x.
 * Used for everything on the descent, because peak angular rate is what
 * actually makes a camera move uncomfortable to watch.
 */
export function easeInOutSine(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return -(Math.cos(Math.PI * c) - 1) / 2;
}

/** Remap `t` onto a [start, end] sub-interval, clamped. */
function stage(t: number, start: number, end: number): number {
  return easeInOutSine(THREE.MathUtils.clamp((t - start) / (end - start), 0, 1));
}

/**
 * Where the camera stands once landed.
 *
 * `anchor` is the camp's ground point and `depthAxis` the tangent pointing at
 * the agents, so the camera stands on the anchor looking along depthAxis,
 * pitched down by CAMERA_PITCH. The gaze target sits a little short of the
 * horizon, which puts the horizon line in the lower third of the frame.
 */
export function computeLandedPose(
  out: CameraPose,
  planetCenter: THREE.Vector3,
  anchor: THREE.Vector3,
  depthAxis: THREE.Vector3,
  groundHeight: number,
): CameraPose {
  const up = _v1.copy(anchor).normalize();
  const forward = _v2.copy(depthAxis).normalize();

  // Re-orthogonalise: placement hands us tangents that should already be
  // perpendicular, but a drifted axis would tilt the horizon.
  forward.addScaledVector(up, -forward.dot(up)).normalize();

  out.position
    .copy(planetCenter)
    .addScaledVector(up, PLANET_RADIUS + groundHeight + EYE_HEIGHT);

  const gaze = _v3
    .copy(forward)
    .multiplyScalar(Math.cos(CAMERA_PITCH))
    .addScaledVector(up, -Math.sin(CAMERA_PITCH))
    .normalize();

  // Line-of-sight distance to the horizon, aimed slightly short of it.
  const d = PLANET_RADIUS + groundHeight + EYE_HEIGHT;
  const toHorizon = Math.sqrt(Math.max(0, d * d - PLANET_RADIUS * PLANET_RADIUS));

  out.lookAt.copy(out.position).addScaledVector(gaze, toHorizon * 0.7);
  out.up.copy(up);
  return out;
}

/** The pull-back pose that frames every planet in the orbital view. */
export function computeOverviewPose(
  out: CameraPose,
  ringRadii: number[],
  fovDeg: number,
): CameraPose {
  const maxR = ringRadii.length > 0 ? Math.max(...ringRadii) : 10;
  const fovRad = (fovDeg / 2) * (Math.PI / 180);
  // The margin covers what the ring radius alone does not: planet radius,
  // status rings, the floating label, and the fact that the near side of the
  // ring is much closer to the camera than the origin it is framed on.
  const fitDist = (maxR * 1.85) / Math.tan(fovRad);
  const dist = Math.max(14, fitDist);

  // Same offset the landing anchor is built from, so the camera is already
  // above the spot every descent lands on.
  out.position.set(0, dist * OVERVIEW_OFFSET.up, dist * OVERVIEW_OFFSET.back);
  out.lookAt.set(0, 0, 0);
  out.up.set(0, 1, 0);
  return out;
}

/**
 * Sample the descent path at `t` in [0, 1].
 *
 * The path is dominated by one decision made elsewhere: `anchorFrame` plants
 * the camp on the face of the sphere already turned toward the camera. So by
 * the time this runs, `dir0` and `dir1` are near-identical and the swing stage
 * has almost nothing to do — the descent is a fall straight down the camera's
 * existing view ray. It used to be a trip around the planet, because the camp
 * was hashed anywhere on the sphere.
 *
 *   t 0.00 - 0.55   line up over the landing site (now near-zero)
 *   t 0.02 - 0.38   level onto the local surface normal
 *   t 0.12 - 0.62   swing the gaze from the planet out to the horizon
 *   t 0.55 - 1.00   pure radial descent
 *
 * The levelling is likewise near-free now. `up` turns from world-up to the
 * surface normal at the landing point, and both lie in the plane containing
 * the camera and its focus — so the turn is about the camera's own right axis.
 * That is a pitch, like an aircraft flaring: the horizon stays level in frame
 * instead of rotating. Off-centre planets carry a small genuine roll, bounded
 * by their angle off that plane, and it is still spent early against starfield
 * where there is nothing to watch move.
 *
 * The staged schedule is kept even though the rotations are now small: it costs
 * nothing when they are, and it is what keeps the rare off-axis case calm.
 *
 * Distance eases geometrically — exp(lerp(log d0, log d1)) — so each frame
 * covers a constant *fraction* of the remaining gap. That keeps the apparent
 * zoom rate even across a ~13x change of scale.
 */
export function sampleDescent(
  out: CameraPose,
  from: CameraPose,
  to: CameraPose,
  planetCenter: THREE.Vector3,
  t: number,
): CameraPose {
  const fromOff = _v1.copy(from.position).sub(planetCenter);
  const toOff = _v2.copy(to.position).sub(planetCenter);

  const d0 = Math.max(1e-6, fromOff.length());
  const d1 = Math.max(1e-6, toOff.length());

  const dir0 = _v3.copy(fromOff).divideScalar(d0);
  const dir1 = _v4.copy(toOff).divideScalar(d1);

  // Line up over the landing site early, so the last 45% is a straight drop.
  _qFull.setFromUnitVectors(dir0, dir1);
  _qStep.identity().slerp(_qFull, stage(t, 0, 0.55));

  const dist = Math.exp(
    THREE.MathUtils.lerp(Math.log(d0), Math.log(d1), easeInOutSine(t)),
  );

  out.position
    .copy(dir0)
    .applyQuaternion(_qStep)
    .multiplyScalar(dist)
    .add(planetCenter);

  out.lookAt.copy(from.lookAt).lerp(to.lookAt, stage(t, 0.12, 0.62));

  // Slerped, not lerped: a camp in the far hemisphere makes from.up and to.up
  // near-antipodal, where a component-wise lerp passes through the zero vector
  // and blows up the view matrix.
  _qFull.setFromUnitVectors(from.up, to.up);
  _qStep.identity().slerp(_qFull, stage(t, 0.02, 0.38));
  out.up.copy(from.up).applyQuaternion(_qStep).normalize();

  return out;
}

/** Descent progress for an elapsed time, clamped to [0, 1]. */
export function descentProgress(elapsedSeconds: number, reduced = false): number {
  const span = reduced ? DESCENT_SECONDS_REDUCED : DESCENT_SECONDS;
  return THREE.MathUtils.clamp(elapsedSeconds / span, 0, 1);
}

/**
 * Re-seat a landed camera after the user has panned.
 *
 * `bandOffset` slides the standing point across the camp, `pitchOffset` tilts
 * the gaze. Altitude is clamped so the horizon never flattens out of frame and
 * the eye never drops below the ground.
 */
export function computePannedPose(
  out: CameraPose,
  planetCenter: THREE.Vector3,
  anchor: THREE.Vector3,
  depthAxis: THREE.Vector3,
  groundHeightAt: (dir: THREE.Vector3) => number,
  bandOffset: number,
  pitchOffset: number,
  altitude: number,
): CameraPose {
  // Slide the standing point along the band by rotating about the depth axis.
  const up = _v1.copy(anchor).normalize();
  _qFull.setFromAxisAngle(_v2.copy(depthAxis).normalize(), bandOffset);
  up.applyQuaternion(_qFull).normalize();

  const forward = _v3.copy(depthAxis).applyQuaternion(_qFull);
  forward.addScaledVector(up, -forward.dot(up)).normalize();

  const h = groundHeightAt(up);
  const eye = PLANET_RADIUS + h + altitude;

  out.position.copy(planetCenter).addScaledVector(up, eye);

  // Drag can look up past the horizon into the sky, or down at the near
  // ground, but never far enough to lose the horizon out of frame entirely.
  const pitch = THREE.MathUtils.clamp(
    CAMERA_PITCH + pitchOffset,
    -HORIZON_ANGLE * 0.5,
    HORIZON_ANGLE * 1.15,
  );

  const gaze = _v4
    .copy(forward)
    .multiplyScalar(Math.cos(pitch))
    .addScaledVector(up, -Math.sin(pitch))
    .normalize();

  const toHorizon = Math.sqrt(
    Math.max(0, eye * eye - PLANET_RADIUS * PLANET_RADIUS),
  );
  out.lookAt.copy(out.position).addScaledVector(gaze, toHorizon * 0.7);
  out.up.copy(up);
  return out;
}

// Frame-loop scratch. These functions run every frame during a descent, so
// they must not allocate.
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _qFull = new THREE.Quaternion();
const _qStep = new THREE.Quaternion();
