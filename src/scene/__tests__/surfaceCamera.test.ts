import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  makePose,
  easeInOutCubic,
  computeLandedPose,
  computeOverviewPose,
  sampleDescent,
  descentProgress,
  computePannedPose,
} from '../surfaceCamera';
import {
  PLANET_RADIUS,
  EYE_HEIGHT,
  DESCENT_SECONDS,
  CAMERA_PITCH,
  HORIZON_ANGLE,
} from '../surfaceConstants';

const CENTER = new THREE.Vector3(8, 0, -3);
const ANCHOR = new THREE.Vector3(0.3, 0.8, 0.5).normalize();
const DEPTH = new THREE.Vector3()
  .crossVectors(ANCHOR, new THREE.Vector3(0, 1, 0))
  .normalize();
const BAND = new THREE.Vector3().crossVectors(DEPTH, ANCHOR).normalize();

describe('easeInOutCubic', () => {
  it('pins the endpoints and the midpoint', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
  });

  it('clamps out-of-range input', () => {
    expect(easeInOutCubic(-3)).toBe(0);
    expect(easeInOutCubic(7)).toBe(1);
  });

  it('increases monotonically', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = easeInOutCubic(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('computeLandedPose', () => {
  it('stands the camera at eye height above the displaced ground', () => {
    const pose = computeLandedPose(makePose(), CENTER, ANCHOR, DEPTH, 0.03);
    const height = pose.position.distanceTo(CENTER);
    expect(height).toBeCloseTo(PLANET_RADIUS + 0.03 + EYE_HEIGHT, 10);
  });

  it('places the camera along the anchor direction', () => {
    const pose = computeLandedPose(makePose(), CENTER, ANCHOR, DEPTH, 0);
    const dir = pose.position.clone().sub(CENTER).normalize();
    expect(dir.dot(ANCHOR)).toBeCloseTo(1, 10);
  });

  it('aims below the local horizontal so the ground is in frame', () => {
    const pose = computeLandedPose(makePose(), CENTER, ANCHOR, DEPTH, 0);
    const up = pose.position.clone().sub(CENTER).normalize();
    const gaze = pose.lookAt.clone().sub(pose.position).normalize();
    expect(gaze.dot(up)).toBeLessThan(0);
  });

  it('aims toward the agents, not away from them', () => {
    const pose = computeLandedPose(makePose(), CENTER, ANCHOR, DEPTH, 0);
    const gaze = pose.lookAt.clone().sub(pose.position).normalize();
    expect(gaze.dot(DEPTH)).toBeGreaterThan(0.5);
  });

  it('keeps the horizon in frame rather than staring at its feet', () => {
    const pose = computeLandedPose(makePose(), CENTER, ANCHOR, DEPTH, 0);
    const up = pose.position.clone().sub(CENTER).normalize();
    const gaze = pose.lookAt.clone().sub(pose.position).normalize();
    // CAMERA_PITCH is 29 degrees: sin(29 deg) ~= 0.485.
    expect(-gaze.dot(up)).toBeCloseTo(Math.sin(CAMERA_PITCH), 6);
    // Shallower than the horizon dip would put the ground off-screen.
    expect(CAMERA_PITCH).toBeLessThan(HORIZON_ANGLE);
  });

  it('rolls the camera onto the local surface normal', () => {
    // Regression: leaving camera.up at world (0,1,0) tilts the horizon by the
    // angle between world up and the local normal — near-vertical for a camp
    // in the far hemisphere. Every position assertion still passes when this
    // is wrong, so it has to be asserted directly.
    const pose = computeLandedPose(makePose(), CENTER, ANCHOR, DEPTH, 0);
    expect(pose.up.dot(ANCHOR)).toBeCloseTo(1, 10);
  });

  it('rolls correctly for a camp in the southern hemisphere', () => {
    const southern = new THREE.Vector3(-0.836, -0.471, -0.282).normalize();
    const depth = new THREE.Vector3()
      .crossVectors(southern, new THREE.Vector3(1, 0, 0))
      .normalize();

    const pose = computeLandedPose(makePose(), CENTER, southern, depth, 0);
    expect(pose.up.dot(southern)).toBeCloseTo(1, 10);
    // The whole point: this is nothing like world up.
    expect(pose.up.dot(new THREE.Vector3(0, 1, 0))).toBeLessThan(0);
  });

  it('tolerates a depth axis that has drifted off-tangent', () => {
    const skewed = DEPTH.clone().addScaledVector(ANCHOR, 0.4);
    const pose = computeLandedPose(makePose(), CENTER, ANCHOR, skewed, 0);
    const up = pose.position.clone().sub(CENTER).normalize();
    const gaze = pose.lookAt.clone().sub(pose.position).normalize();
    expect(gaze.dot(up)).toBeLessThan(0);
    expect(Number.isNaN(gaze.x)).toBe(false);
  });
});

describe('computeOverviewPose', () => {
  it('is deterministic', () => {
    const a = computeOverviewPose(makePose(), [8, 14], 60);
    const b = computeOverviewPose(makePose(), [8, 14], 60);
    expect(a.position.toArray()).toEqual(b.position.toArray());
  });

  it('pulls further back for wider ring layouts', () => {
    const near = computeOverviewPose(makePose(), [8], 60);
    const far = computeOverviewPose(makePose(), [8, 14, 20, 26], 60);
    expect(far.position.length()).toBeGreaterThan(near.position.length());
  });

  it('looks at the origin from above', () => {
    const pose = computeOverviewPose(makePose(), [8, 14], 60);
    expect(pose.lookAt.toArray()).toEqual([0, 0, 0]);
    expect(pose.position.y).toBeGreaterThan(0);
  });
});

describe('sampleDescent', () => {
  const from = makePose();
  const to = makePose();

  from.position.set(0, 20, 30);
  from.lookAt.set(0, 0, 0);
  computeLandedPose(to, CENTER, ANCHOR, DEPTH, 0.03);

  it('starts at the origin pose', () => {
    const out = sampleDescent(makePose(), from, to, CENTER, 0);
    expect(out.position.distanceTo(from.position)).toBeLessThan(1e-9);
    expect(out.lookAt.distanceTo(from.lookAt)).toBeLessThan(1e-9);
  });

  it('ends at the landed pose', () => {
    const out = sampleDescent(makePose(), from, to, CENTER, 1);
    expect(out.position.distanceTo(to.position)).toBeLessThan(1e-6);
    expect(out.lookAt.distanceTo(to.lookAt)).toBeLessThan(1e-6);
  });

  it('never passes through the planet', () => {
    const out = makePose();
    for (let i = 0; i <= 200; i++) {
      sampleDescent(out, from, to, CENTER, i / 200);
      expect(out.position.distanceTo(CENTER)).toBeGreaterThan(PLANET_RADIUS);
    }
  });

  it('closes on the planet monotonically', () => {
    const out = makePose();
    let prev = Infinity;
    for (let i = 0; i <= 200; i++) {
      sampleDescent(out, from, to, CENTER, i / 200);
      const d = out.position.distanceTo(CENTER);
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      prev = d;
    }
  });

  it('finishes rolling well before arrival', () => {
    // The comfort rule this path is built around: rotation happens while the
    // planet is far away and the screen is mostly sky. By 40% the roll must be
    // done, so the close approach carries no roll at all.
    const out = sampleDescent(makePose(), from, to, CENTER, 0.4);
    expect(out.up.dot(to.up)).toBeCloseTo(1, 6);
  });

  it('finishes swinging the gaze well before arrival', () => {
    const out = sampleDescent(makePose(), from, to, CENTER, 0.65);
    expect(out.lookAt.distanceTo(to.lookAt)).toBeLessThan(1e-6);
  });

  it('lines up over the landing site before the final drop', () => {
    // After the alignment stage the camera must already be on the landing
    // site's radial, so the last 45% is a straight descent with no swing.
    const out = sampleDescent(makePose(), from, to, CENTER, 0.6);
    const dir = out.position.clone().sub(CENTER).normalize();
    const target = to.position.clone().sub(CENTER).normalize();
    expect(dir.dot(target)).toBeCloseTo(1, 6);
  });

  it('rotates nothing during the final approach', () => {
    // Peak angular rate is what makes a descent uncomfortable, and it is worst
    // when the ground fills the frame. Across the last 40% the camera's
    // orientation basis must be effectively static.
    const a = sampleDescent(makePose(), from, to, CENTER, 0.62);
    const b = sampleDescent(makePose(), from, to, CENTER, 1);

    expect(a.up.angleTo(b.up)).toBeLessThan(1e-4);

    const gazeA = a.lookAt.clone().sub(a.position).normalize();
    const gazeB = b.lookAt.clone().sub(b.position).normalize();
    // Only the natural flare of dropping toward a fixed horizon point remains.
    expect(gazeA.angleTo(gazeB)).toBeLessThan(Math.PI / 2);
  });

  it('keeps peak angular rate well below the old late-roll schedule', () => {
    // Sample the frame-to-frame rotation of the view basis and check the worst
    // step, which is the number that actually correlates with discomfort.
    const steps = 200;
    let worstRoll = 0;
    const prev = makePose();
    const cur = makePose();
    sampleDescent(prev, from, to, CENTER, 0);
    for (let i = 1; i <= steps; i++) {
      sampleDescent(cur, from, to, CENTER, i / steps);
      worstRoll = Math.max(worstRoll, prev.up.angleTo(cur.up));
      prev.position.copy(cur.position);
      prev.lookAt.copy(cur.lookAt);
      prev.up.copy(cur.up);
    }
    // Total roll here is ~90 degrees; spread over its stage no single 1/200th
    // of the descent may carry more than ~1.5 degrees of it.
    expect(worstRoll).toBeLessThan(0.027);
  });

  it('produces no NaN anywhere along the path', () => {
    const out = makePose();
    for (let i = 0; i <= 100; i++) {
      sampleDescent(out, from, to, CENTER, i / 100);
      for (const c of [
        ...out.position.toArray(),
        ...out.lookAt.toArray(),
        ...out.up.toArray(),
      ]) {
        expect(Number.isFinite(c)).toBe(true);
      }
    }
  });

  it('keeps the up vector unit length throughout the roll', () => {
    const out = makePose();
    for (let i = 0; i <= 100; i++) {
      sampleDescent(out, from, to, CENTER, i / 100);
      expect(out.up.length()).toBeCloseTo(1, 9);
    }
  });

  it('slerps roll through an antipodal up without collapsing', () => {
    // from.up is world up; a camp at the south pole makes to.up its exact
    // opposite, where a component-wise lerp passes through the zero vector.
    const south = makePose();
    south.position.copy(CENTER).addScaledVector(new THREE.Vector3(0, -1, 0), 2.3);
    south.lookAt.copy(south.position).add(new THREE.Vector3(1, 0, 0));
    south.up.set(0, -1, 0);

    const out = makePose();
    for (let i = 0; i <= 100; i++) {
      sampleDescent(out, from, south, CENTER, i / 100);
      expect(out.up.length()).toBeCloseTo(1, 9);
    }
    expect(out.up.dot(south.up)).toBeCloseTo(1, 6);
  });

  it('ends rolled onto the landing site normal', () => {
    const out = sampleDescent(makePose(), from, to, CENTER, 1);
    expect(out.up.dot(to.up)).toBeCloseTo(1, 9);
  });

  it('survives a start pose directly opposite the landing site', () => {
    const antipodal = makePose();
    antipodal.position.copy(CENTER).addScaledVector(ANCHOR, -30);
    antipodal.lookAt.copy(CENTER);

    const out = makePose();
    for (let i = 0; i <= 50; i++) {
      sampleDescent(out, antipodal, to, CENTER, i / 50);
      expect(Number.isFinite(out.position.x)).toBe(true);
      expect(out.position.distanceTo(CENTER)).toBeGreaterThan(PLANET_RADIUS);
    }
  });
});

describe('descentProgress', () => {
  it('spans zero to one over the descent duration', () => {
    expect(descentProgress(0)).toBe(0);
    expect(descentProgress(DESCENT_SECONDS)).toBe(1);
    expect(descentProgress(DESCENT_SECONDS / 2)).toBeCloseTo(0.5, 10);
  });

  it('clamps past the end', () => {
    expect(descentProgress(DESCENT_SECONDS * 10)).toBe(1);
    expect(descentProgress(-1)).toBe(0);
  });
});

describe('computePannedPose', () => {
  const flatGround = () => 0.02;

  it('reduces to the landed pose with no offsets', () => {
    const landed = computeLandedPose(makePose(), CENTER, ANCHOR, DEPTH, 0.02);
    const panned = computePannedPose(
      makePose(), CENTER, ANCHOR, DEPTH, flatGround, 0, 0, EYE_HEIGHT,
    );
    expect(panned.position.distanceTo(landed.position)).toBeLessThan(1e-9);
    expect(panned.lookAt.distanceTo(landed.lookAt)).toBeLessThan(1e-9);
    // Roll too. Asserting only position and look-at lets the exact regression
    // the landed-pose tests were written for slip back in through this path,
    // which is the one that actually drives the camera while you stand there.
    expect(panned.up.distanceTo(landed.up)).toBeLessThan(1e-9);
  });

  it('keeps the roll on the local normal as you walk across the surface', () => {
    const out = makePose();
    for (let band = -1; band <= 1; band += 0.1) {
      computePannedPose(
        out, CENTER, ANCHOR, DEPTH, flatGround, band, 0, EYE_HEIGHT,
      );
      // Standing point moved, so "up" must move with it — it is the direction
      // from the planet's centre to where you are now, not where you started.
      const normal = out.position.clone().sub(CENTER).normalize();
      expect(out.up.dot(normal)).toBeCloseTo(1, 9);
    }
  });

  it('keeps the roll on the local normal at every pitch and altitude', () => {
    const out = makePose();
    for (const pitch of [-0.5, 0, 0.5, 5]) {
      for (const alt of [0.25, 0.5, 1.4]) {
        computePannedPose(
          out, CENTER, ANCHOR, DEPTH, flatGround, 0.2, pitch, alt,
        );
        const normal = out.position.clone().sub(CENTER).normalize();
        expect(out.up.dot(normal)).toBeCloseTo(1, 9);
      }
    }
  });

  it('slides the standing point along the band', () => {
    const base = computePannedPose(
      makePose(), CENTER, ANCHOR, DEPTH, flatGround, 0, 0, EYE_HEIGHT,
    );
    const moved = computePannedPose(
      makePose(), CENTER, ANCHOR, DEPTH, flatGround, 0.2, 0, EYE_HEIGHT,
    );
    const delta = moved.position.clone().sub(base.position).normalize();
    expect(Math.abs(delta.dot(BAND))).toBeGreaterThan(0.9);
  });

  it('never drops the eye below the ground', () => {
    const out = makePose();
    for (let band = -1; band <= 1; band += 0.1) {
      computePannedPose(
        out, CENTER, ANCHOR, DEPTH, flatGround, band, 0, EYE_HEIGHT,
      );
      expect(out.position.distanceTo(CENTER)).toBeGreaterThan(PLANET_RADIUS);
    }
  });

  it('clamps pitch so the camera cannot flip over', () => {
    const out = makePose();
    for (const p of [-5, -1, 1, 5]) {
      computePannedPose(
        out, CENTER, ANCHOR, DEPTH, flatGround, 0, p, EYE_HEIGHT,
      );
      const up = out.position.clone().sub(CENTER).normalize();
      const gaze = out.lookAt.clone().sub(out.position).normalize();
      // Never straight up and never straight down.
      expect(Math.abs(gaze.dot(up))).toBeLessThan(0.75);
    }
  });
});
