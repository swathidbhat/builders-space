/**
 * Owns the camera across all three states: orbiting in space, falling toward a
 * planet, and standing on its surface.
 *
 * OrbitControls drives the space view only. Once you land, orbiting around the
 * planet centre is the wrong verb — you are standing on the ground, so drag
 * slides your footing along the surface instead.
 */
import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSpaceStore } from '../store';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { layoutOrbitalLanes } from './layout';
import { planSurfaceCamp, selectSurfaceAgents } from './surfacePlacement';
import { terrainHeight } from './surfaceTerrain';
import { descentState } from './descentState';
import {
  makePose,
  computeLandedPose,
  computeOverviewPose,
  computePannedPose,
  sampleDescent,
  descentProgress,
} from './surfaceCamera';
import {
  EYE_HEIGHT,
  BAND_HALF_ANGLE,
  CAMERA_PITCH,
  HORIZON_ANGLE,
} from './surfaceConstants';

const FOV = 60;

/**
 * How far the standing point may slide either side of the camp.
 *
 * Only a little past the band itself. Walking further is authentic — on a
 * sphere this small the agents you left behind visibly lean away as your local
 * up rotates — but it also carries the whole camp off the edge of the frame.
 */
const PAN_LIMIT = BAND_HALF_ANGLE * 1.15;

/** Radians of pan per pixel dragged. */
const DRAG_SENSITIVITY = 0.0011;

/** Altitude range reachable by scrolling, world units above the ground. */
const ALT_MIN = 0.25;
const ALT_MAX = 1.4;

export function CameraRig() {
  const { camera, gl } = useThree();
  const reduced = usePrefersReducedMotion();
  const controlsRef = useRef<any>(null);

  const projects = useSpaceStore((s) => s.projects);
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const cameraMode = useSpaceStore((s) => s.cameraMode);

  const { positions, ringRadii } = useMemo(
    () => layoutOrbitalLanes(projects),
    [projects],
  );

  const selectedIdx = selectedId
    ? projects.findIndex((p) => p.id === selectedId)
    : -1;
  const project = selectedIdx >= 0 ? projects[selectedIdx] : undefined;

  const camp = useMemo(
    () => (project ? planSurfaceCamp(selectSurfaceAgents(project.agents), project.name) : null),
    [project],
  );

  const planetCenter = useMemo(() => {
    const p = selectedIdx >= 0 ? positions[selectedIdx] : undefined;
    return p ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3();
  }, [positions, selectedIdx]);

  // A project can vanish underneath us: its last agent finishes and the next
  // socket push drops it. Landed on that planet, `project` goes undefined, the
  // landed branch stops running, and the camera is stranded on the surface of a
  // world that no longer exists. Deselecting flies us home through the normal
  // ascent instead.
  const deselectPlanet = useSpaceStore((s) => s.deselectPlanet);
  useEffect(() => {
    if (selectedId && !project) deselectPlanet();
  }, [selectedId, project, deselectPlanet]);

  /**
   * Where the camera is actually looking right now.
   *
   * Kept by every branch so a transition can start from the true gaze rather
   * than from OrbitControls' target, which is only meaningful in orbit.
   */
  const currentLookAt = useRef(new THREE.Vector3());
  const from = useRef(makePose());
  const to = useRef(makePose());
  const out = useRef(makePose());
  const elapsed = useRef(0);
  const phase = useRef<'space' | 'descending' | 'landed' | 'ascending'>('space');
  const pan = useRef({ band: 0, pitch: 0, altitude: EYE_HEIGHT });
  const drag = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });

  const groundAt = useCallback(
    (dir: THREE.Vector3) =>
      project ? terrainHeight(project.name, [dir.x, dir.y, dir.z]) : 0,
    [project],
  );

  // --- Transitions --------------------------------------------------------

  const prev = useRef<{ mode: string; id: string | null }>({
    mode: 'space',
    id: null,
  });

  useEffect(() => {
    const changed =
      cameraMode !== prev.current.mode || selectedId !== prev.current.id;
    if (!changed) return;
    prev.current = { mode: cameraMode, id: selectedId };

    // Start the new transition from where the camera actually is — including
    // its roll and its real gaze point. Reading the gaze off OrbitControls'
    // target is only right in the orbital view; leaving the surface it holds a
    // stale orbital point, and `up` would jump from the surface normal to world
    // up on the first frame instead of rolling back.
    from.current.position.copy(camera.position);
    from.current.up.copy(camera.up);
    from.current.lookAt.copy(currentLookAt.current);

    if (cameraMode === 'surface' && camp && project) {
      const anchor = new THREE.Vector3().fromArray(camp.anchor);
      const depth = new THREE.Vector3().fromArray(camp.depthAxis);
      computeLandedPose(
        to.current,
        planetCenter,
        anchor,
        depth,
        terrainHeight(project.name, camp.anchor),
      );
      pan.current = { band: 0, pitch: 0, altitude: EYE_HEIGHT };
      phase.current = 'descending';
      descentState.planetId = selectedId;
      descentState.phase = 'descending';
    } else {
      computeOverviewPose(to.current, ringRadii, FOV);
      phase.current = 'ascending';
      descentState.phase = 'ascending';
    }

    elapsed.current = 0;
    if (controlsRef.current) controlsRef.current.enabled = false;
  }, [cameraMode, selectedId, camp, project, planetCenter, ringRadii, camera]);

  // Frame the whole system once, when the first projects arrive. A one-shot
  // snap rather than an ease: the ease only advanced on layout changes, so in
  // practice the camera never left its arbitrary starting position, and the
  // framing this computes went unexercised until the first return from a
  // planet suddenly jumped to it.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || ringRadii.length === 0 || selectedId) return;
    framed.current = true;
    computeOverviewPose(to.current, ringRadii, FOV);
    camera.position.copy(to.current.position);
    camera.up.set(0, 1, 0);
    currentLookAt.current.copy(to.current.lookAt);
    if (controlsRef.current) {
      controlsRef.current.target.copy(to.current.lookAt);
      controlsRef.current.update();
    }
  }, [ringRadii, selectedId, camera]);

  // --- Landed pan controls ------------------------------------------------

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      if (phase.current !== 'landed') return;
      drag.current = { active: true, x: e.clientX, y: e.clientY };
    };

    const onMove = (e: PointerEvent) => {
      if (!drag.current.active || phase.current !== 'landed') return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;

      const s = pan.current;
      s.band = THREE.MathUtils.clamp(
        s.band - dx * DRAG_SENSITIVITY,
        -PAN_LIMIT,
        PAN_LIMIT,
      );
      s.pitch = THREE.MathUtils.clamp(
        s.pitch + dy * DRAG_SENSITIVITY,
        -CAMERA_PITCH * 0.8,
        HORIZON_ANGLE * 0.9,
      );
    };

    const onUp = () => {
      drag.current.active = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (phase.current !== 'landed') return;
      e.preventDefault();
      pan.current.altitude = THREE.MathUtils.clamp(
        pan.current.altitude * (1 + e.deltaY * 0.001),
        ALT_MIN,
        ALT_MAX,
      );
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl]);

  // --- Frame loop ---------------------------------------------------------

  useFrame((_state, delta) => {
    const controls = controlsRef.current;
    if (phase.current === 'descending' || phase.current === 'ascending') {
      elapsed.current += delta;
      const t = descentProgress(elapsed.current, reduced);

      sampleDescent(out.current, from.current, to.current, planetCenter, t);
      camera.position.copy(out.current.position);
      camera.up.copy(out.current.up);
      camera.lookAt(out.current.lookAt);
      currentLookAt.current.copy(out.current.lookAt);

      descentState.progress =
        phase.current === 'descending' ? t : 1 - t;

      if (t >= 1) {
        if (phase.current === 'descending') {
          phase.current = 'landed';
          descentState.phase = 'landed';
          descentState.progress = 1;
          // Hand the landed branch the gaze point the descent just arrived at,
          // or it eases from wherever the vector last sat and the view swings
          // to the horizon over the first ~20 frames instead of being level on
          // touchdown.
          currentLookAt.current.copy(to.current.lookAt);
        } else {
          phase.current = 'space';
          descentState.phase = 'space';
          descentState.progress = 0;
          descentState.planetId = null;
          // OrbitControls assumes world up; hand it back cleanly.
          camera.up.set(0, 1, 0);
          currentLookAt.current.copy(to.current.lookAt);
          if (controls) {
            controls.target.copy(to.current.lookAt);
            controls.enabled = true;
            controls.update();
          }
        }
      }
      return;
    }

    if (phase.current === 'landed' && camp && project) {
      const anchor = _v1.fromArray(camp.anchor);
      const depth = _v2.fromArray(camp.depthAxis);
      const s = pan.current;

      computePannedPose(
        out.current,
        planetCenter,
        anchor,
        depth,
        groundAt,
        s.band,
        s.pitch,
        s.altitude,
      );

      // Ease rather than snap so dragging feels weighted.
      const k = 1 - Math.exp(-12 * delta);
      camera.position.lerp(out.current.position, k);
      currentLookAt.current.lerp(out.current.lookAt, k);
      camera.up.copy(out.current.up);
      camera.lookAt(currentLookAt.current);
      return;
    }

    if (controls) {
      controls.update();
      currentLookAt.current.copy(controls.target);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      minDistance={3}
      maxDistance={150}
      enablePan={false}
    />
  );
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
