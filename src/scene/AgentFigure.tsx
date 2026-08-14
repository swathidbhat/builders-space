/**
 * One agent, as lit geometry standing on the planet.
 *
 * Replaces the pixel-art billboard this view inherited from the old flat
 * strip. That art was ten pixels tall — fine as a thumbnail, but the landing
 * puts the camera close enough that each art pixel covered a dozen screen
 * pixels. Boxes have no resolution to run out of, take the scene's own light,
 * and cast a real shadow onto the displaced ground.
 *
 * Every part is the same shared unit box, scaled. Poses are limb rotations, so
 * the whole character costs one geometry and four materials.
 */
import { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentInfo } from '../types';
import { useOpenSession } from '../ui/useOpenSession';
import type { AgentIdentity } from '../ui/agentIdentity';
import { terrainHeight } from './surfaceTerrain';
import type { SurfaceCamp, SurfaceSlot } from './surfacePlacement';
import {
  type AgentAnim,
  walkOffset,
  walkFacesLeft,
  strideCycle,
  digCycle,
  breath,
} from './agentMotion';
import {
  PLANET_RADIUS,
  AGENT_WORLD_HEIGHT as H,
  AGENT_PARTS as P,
  DEPTH_NEAR,
  DEPTH_FAR,
} from './surfaceConstants';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const STATUS_DOT: Record<string, string> = {
  working: '#44ffaa',
  waiting: '#ffaa44',
  error: '#ff4444',
  done: '#8ab4ff',
};

/** Where each part sits when standing, in units of H measured from the feet. */
const LEG_Y = P.legHeight / 2;
const TORSO_Y = P.legHeight + P.torsoHeight / 2;
const HEAD_Y = P.legHeight + P.torsoHeight + P.headSize / 2;
const ARM_TOP_Y = P.legHeight + P.torsoHeight;

/** World size of one thought-bubble dot. */
const BUBBLE_DOT = 0.075 * H;

/** World size of one ember at birth. */
const EMBER_SIZE = 0.06 * H;

/** Hook error reasons arrive as raw, untruncated payload strings. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3).replace(/\s+\S*$/, '')}...`;
}

interface AgentFigureProps {
  agent: AgentInfo;
  slot: SurfaceSlot;
  camp: SurfaceCamp;
  identity: AgentIdentity | undefined;
  anim: AgentAnim;
  seed: number;
  projectName: string;
  planetPosition: [number, number, number];
  clockRef: React.MutableRefObject<number>;
  opacityRef: React.MutableRefObject<number>;
  /** This agent's own contribution to its party's goal. */
  intent?: string;
  /** What you must decide, as worked out from this agent's last message. */
  decision?: string;
  /** A party banner overhead is already saying why this agent is here. */
  inLabelledParty: boolean;
  /** Crowded enough that labels must fold back to a name until hovered. */
  dense: boolean;
  reduced: boolean;
}

export function AgentFigure({
  agent,
  slot,
  camp,
  identity,
  anim,
  seed,
  projectName,
  planetPosition,
  clockRef,
  opacityRef,
  intent,
  decision,
  inLabelledParty,
  dense,
  reduced,
}: AgentFigureProps) {
  const [hovered, setHovered] = useState(false);
  // Click-to-open lived on the deleted bar's chips. It belongs on the agent
  // itself: the figure standing in front of you is the thing you want to open.
  const { openSession, toast } = useOpenSession(agent);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const overhead = useRef<THREE.Group>(null);
  const embers = useRef<THREE.Group>(null);
  const bubble = useRef<THREE.Group>(null);

  const { camera } = useThree();

  // What this figure says under its name, most actionable first.
  //
  // A pending decision outranks everything and is exempt from `dense` below:
  // an agent that has stopped and is waiting on you is the one thing on this
  // planet that cannot wait for a hover. Below that, an agent already standing
  // under a party banner stays quiet — the banner has said why it is here.
  //
  // Only what a model worked out. `agent.question` — the agent's own last
  // message — is deliberately never rendered: handing you that text is the
  // reading work this exists to save, and it would sit in the same place as a
  // real decision while being a much weaker thing. Before the briefing lands,
  // and whenever it cannot run, the chip simply carries a name.
  const pending = agent.status === 'waiting' ? (decision ?? '') : '';

  const detail =
    agent.status === 'error' && agent.errorReason
      ? truncate(agent.errorReason, 120)
      : pending
        ? pending
        : inLabelledParty
          ? ''
          : (intent ?? '');
  const isQuestion = !!pending;

  // Depth within the band, 0 = nearest the camera, 1 = furthest back.
  const depth = THREE.MathUtils.clamp(
    (slot.depthAngle - DEPTH_NEAR) / (DEPTH_FAR - DEPTH_NEAR),
    0,
    1,
  );
  // Just clear of the head. Staggered only slightly by depth — enough to
  // break ties between neighbours, not enough to detach from the figure.
  const labelHeight = (0.42 + depth * 0.3) * H;
  const labelZ = (hovered ? 60 : 40) - Math.round(depth * 12);
  const showDetail = isQuestion || !dense || hovered;

  const colors = useMemo(
    () => ({
      skin: identity?.skinColor ?? '#e8b88a',
      hair: identity?.hairColor ?? '#4a3728',
      suit: identity?.suitColor ?? '#8888aa',
      suitDark: identity?.suitColorDark ?? '#555577',
    }),
    [identity],
  );

  const mats = useMemo(() => {
    const make = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0.02,
        transparent: true,
        opacity: 0,
        ...extra,
      });
    return {
      skin: make(colors.skin),
      hair: make(colors.hair),
      suit: make(colors.suit),
      suitDark: make(colors.suitDark),
      eye: make(agent.status === 'error' ? '#ff3b3b' : '#241f1c', {
        emissive: agent.status === 'error' ? '#ff2222' : '#000000',
        emissiveIntensity: agent.status === 'error' ? 1.4 : 0,
        roughness: 0.4,
      }),
      accent: make(identity?.gradient[0] ?? '#8ab4ff', {
        emissive: identity?.gradient[0] ?? '#8ab4ff',
        emissiveIntensity: 0.7,
      }),
      ember: make('#ff7a2a', { emissive: '#ff6a1a', emissiveIntensity: 2.2 }),
    };
  }, [colors, agent.status, identity]);

  useEffect(
    () => () => Object.values(mats).forEach((m) => m.dispose()),
    [mats],
  );

  useFrame(() => {
    const g = root.current;
    if (!g) return;

    const f = reduced ? 0 : clockRef.current;
    const alpha = opacityRef.current;
    for (const m of Object.values(mats)) m.opacity = alpha;
    g.visible = alpha > 0.01;
    if (!g.visible) return;

    // --- Placement on the sphere -----------------------------------------
    _dir.fromArray(slot.dir);
    const wander = walkOffset(f, seed, anim);
    if (wander !== 0) {
      _q.setFromAxisAngle(_axis.fromArray(camp.depthAxis), wander / PLANET_RADIUS);
      _dir.applyQuaternion(_q).normalize();
    }

    const h = terrainHeight(projectName, [_dir.x, _dir.y, _dir.z]);
    g.position.copy(_dir).multiplyScalar(PLANET_RADIUS + h);

    // --- Orientation ------------------------------------------------------
    // Walkers face where they are going; everyone else turns to face you, so
    // the pose reads front-on rather than in silhouette.
    _up.copy(_dir);
    if (anim.kind === 'walk') {
      _fwd.fromArray(camp.bandAxis).multiplyScalar(walkFacesLeft(f, seed) ? -1 : 1);
    } else {
      _camLocal.copy(camera.position).sub(_planet.fromArray(planetPosition));
      _fwd.copy(_camLocal).sub(g.position);
    }
    _fwd.addScaledVector(_up, -_fwd.dot(_up));
    if (_fwd.lengthSq() < 1e-12) _fwd.fromArray(camp.bandAxis);
    _fwd.normalize();

    _right.crossVectors(_up, _fwd).normalize();
    _basis.makeBasis(_right, _up, _fwd);
    g.quaternion.setFromRotationMatrix(_basis);


    // --- Pose -------------------------------------------------------------
    const bob = breath(f, seed, anim);
    const b = body.current;
    if (b) {
      b.position.set(0, bob * H, 0);
      b.rotation.set(0, 0, 0);
      b.scale.setScalar(1);
    }

    const stride = strideCycle(f, seed);

    if (legL.current && legR.current) {
      legL.current.rotation.x = 0;
      legR.current.rotation.x = 0;
      legL.current.position.set(-P.legGap * H, LEG_Y * H, 0);
      legR.current.position.set(P.legGap * H, LEG_Y * H, 0);
    }
    if (armL.current && armR.current) {
      armL.current.rotation.set(0, 0, 0);
      armR.current.rotation.set(0, 0, 0);
    }
    if (torso.current) torso.current.rotation.set(0, 0, 0);

    switch (anim.kind) {
      case 'walk': {
        // Hips and shoulders counter-rotate; the box legs pivot at the hip so
        // a swing lifts the foot rather than shearing it through the ground.
        const swing = stride * 0.55;
        if (legL.current && legR.current) {
          legL.current.rotation.x = swing;
          legR.current.rotation.x = -swing;
          // Raise the hip of whichever leg is swinging forward, so the box
          // foot clears the ground instead of scything through it.
          legL.current.position.y = LEG_Y * H + Math.max(0, swing) * 0.06 * H;
          legR.current.position.y = LEG_Y * H + Math.max(0, -swing) * 0.06 * H;
        }
        if (armL.current && armR.current) {
          armL.current.rotation.x = -swing * 0.8;
          armR.current.rotation.x = swing * 0.8;
        }
        if (torso.current) torso.current.rotation.x = 0.08;
        break;
      }
      case 'dig': {
        const d = digCycle(f, seed);
        // Lean into the stroke and bring both arms down together.
        if (torso.current) torso.current.rotation.x = 0.3 + d * 0.35;
        if (armL.current && armR.current) {
          const swing = -2.1 + d * 1.7;
          armL.current.rotation.x = swing;
          armR.current.rotation.x = swing;
        }
        if (b) b.position.y = (bob - d * 0.02) * H;
        break;
      }
      case 'shake': {
        // Trembling: fast jitter side to side plus an occasional stumble.
        const j = Math.sin(f * 0.9 + seed) * 0.012 * H;
        const stumble = (f + seed * 31) % 70 < 6 ? Math.sin(f * 1.7) * 0.02 * H : 0;
        if (b) {
          b.position.set(j + stumble, bob * H, 0);
          b.rotation.z = j * 1.5;
        }
        if (armL.current && armR.current) {
          armL.current.rotation.x = -0.25 + Math.sin(f * 0.8) * 0.15;
          armR.current.rotation.x = -0.25 - Math.sin(f * 0.8) * 0.15;
        }
        break;
      }
      case 'rest': {
        // Seated: thighs forward, body dropped to sit on its heels.
        if (legL.current && legR.current) {
          legL.current.rotation.x = -1.35;
          legR.current.rotation.x = -1.35;
          legL.current.position.y = LEG_Y * H * 0.55;
          legR.current.position.y = LEG_Y * H * 0.55;
        }
        if (b) b.position.y = (bob - 0.16) * H;
        if (armL.current && armR.current) {
          armL.current.rotation.x = -0.5;
          armR.current.rotation.x = -0.5;
        }
        break;
      }
    }

    // Anything shown over the head rides the body's own vertical offset, or a
    // seated agent's bubble and label hang in the air above where it used to be.
    if (overhead.current && b) {
      overhead.current.position.y = b.position.y + 1.06 * H;
    }

    // --- Status extras ----------------------------------------------------
    if (embers.current) {
      embers.current.visible = agent.status === 'error';
      if (embers.current.visible) {
        embers.current.children.forEach((e, i) => {
          const t = (((f + i * 37) % 110) / 110);
          e.position.set(
            Math.sin(t * 6 + i) * 0.1 * H,
            (0.9 + t * 0.9) * H,
            0,
          );
          e.scale.setScalar(Math.max(1e-4, (1 - t) * EMBER_SIZE));
        });
      }
    }

    if (bubble.current) {
      bubble.current.visible = agent.status === 'waiting';
      if (bubble.current.visible) {
        const cycle = (f + seed * 30) % 100;
        const active = cycle < 75 ? Math.floor(cycle / 25) : -1;
        bubble.current.children.forEach((d, i) => {
          const on = i === active;
          // Absolute size: the shared geometry is a unit box, so setScalar
          // here sets world size directly rather than scaling the JSX value.
          d.scale.setScalar(BUBBLE_DOT * (on ? 1.3 : 0.85));
          const m = (d as THREE.Mesh).material as THREE.MeshStandardMaterial;
          m.emissiveIntensity = on ? 2.4 : 0.5;
        });
        // No extra rotation: the root already yaws to face the viewer for
        // resting agents, so the dots sit level above the head. Forcing them
        // onto world axes instead tilts them off the local horizon.
      }
    }
  });

  const s = (x: number) => x * H;

  return (
    <group
      ref={root}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        if (agent.sessionMeta) document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'default';
      }}
      onClick={(e) => {
        e.stopPropagation();
        openSession();
      }}
    >
      <group ref={body}>
        <mesh
          ref={legL}
          geometry={UNIT_BOX}
          material={mats.suitDark}
          castShadow
          position={[-P.legGap * H, LEG_Y * H, 0]}
          scale={[s(P.legWidth), s(P.legHeight), s(P.legDepth)]}
        />
        <mesh
          ref={legR}
          geometry={UNIT_BOX}
          material={mats.suitDark}
          castShadow
          position={[P.legGap * H, LEG_Y * H, 0]}
          scale={[s(P.legWidth), s(P.legHeight), s(P.legDepth)]}
        />

        <group ref={torso} position={[0, P.legHeight * H, 0]}>
          <mesh
            geometry={UNIT_BOX}
            material={mats.suit}
            castShadow
            position={[0, (TORSO_Y - P.legHeight) * H, 0]}
            scale={[s(P.torsoWidth), s(P.torsoHeight), s(P.torsoDepth)]}
          />

          {/* Arms pivot at the shoulder, so the box hangs below its own group. */}
          <group ref={armL} position={[-(P.torsoWidth / 2 + P.armWidth / 2) * H, (ARM_TOP_Y - P.legHeight) * H, 0]}>
            <mesh
              geometry={UNIT_BOX}
              material={mats.suit}
              castShadow
              position={[0, -s(P.armHeight) / 2, 0]}
              scale={[s(P.armWidth), s(P.armHeight), s(P.armDepth)]}
            />
          </group>
          <group ref={armR} position={[(P.torsoWidth / 2 + P.armWidth / 2) * H, (ARM_TOP_Y - P.legHeight) * H, 0]}>
            <mesh
              geometry={UNIT_BOX}
              material={mats.suit}
              castShadow
              position={[0, -s(P.armHeight) / 2, 0]}
              scale={[s(P.armWidth), s(P.armHeight), s(P.armDepth)]}
            />
          </group>

          <mesh
            geometry={UNIT_BOX}
            material={mats.skin}
            castShadow
            position={[0, (HEAD_Y - P.legHeight) * H, 0]}
            scale={[s(P.headSize), s(P.headSize), s(P.headSize)]}
          />
          <mesh
            geometry={UNIT_BOX}
            material={mats.hair}
            castShadow
            position={[0, (HEAD_Y - P.legHeight + P.headSize / 2) * H, 0]}
            scale={[s(P.headSize * 1.06), s(P.hairHeight), s(P.headSize * 1.06)]}
          />
          <mesh
            geometry={UNIT_BOX}
            material={mats.eye}
            position={[-s(P.headSize * 0.2), (HEAD_Y - P.legHeight + 0.02) * H, s(P.headSize / 2)]}
            scale={[s(P.eyeSize), s(P.eyeSize), s(0.01)]}
          />
          <mesh
            geometry={UNIT_BOX}
            material={mats.eye}
            position={[s(P.headSize * 0.2), (HEAD_Y - P.legHeight + 0.02) * H, s(P.headSize / 2)]}
            scale={[s(P.eyeSize), s(P.eyeSize), s(0.01)]}
          />

          {/* Identity pip — the same accent colour as the agent's chip. */}
          <mesh
            geometry={UNIT_BOX}
            material={mats.accent}
            position={[0, (TORSO_Y - P.legHeight + 0.04) * H, s(P.torsoDepth / 2)]}
            scale={[s(0.07), s(0.07), s(0.01)]}
          />
        </group>
      </group>

      <group ref={embers} visible={false}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} geometry={UNIT_BOX} material={mats.ember} />
        ))}
      </group>

      {/* Staggered by depth: agents standing further back get a higher label,
          so a row of them fans out instead of stacking into one another. The
          nearer agent also wins the z-order, matching what occludes what. */}
      <group ref={overhead}>
      <Html
        position={[0, labelHeight, 0]}
        center
        distanceFactor={1.15}
        zIndexRange={[labelZ, labelZ - 10]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          style={{
            width: '132px',
            padding: '6px 8px',
            borderRadius: '9px',
            background: 'rgba(8,8,20,0.82)',
            border: '1px solid rgba(255,255,255,0.14)',
            backdropFilter: 'blur(8px)',
            fontFamily: "'Inter', sans-serif",
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: STATUS_DOT[agent.status],
                boxShadow: `0 0 6px ${STATUS_DOT[agent.status]}`,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>
              {identity?.name ?? 'Agent'}
            </span>
          </div>
          {toast && (
            <div
              style={{
                fontSize: '10px',
                fontWeight: 500,
                color: '#fff',
                marginTop: '3px',
                lineHeight: 1.3,
              }}
            >
              {toast}
            </div>
          )}
          {detail && showDetail && !toast && (
            <div
              style={{
                fontSize: '11px',
                fontWeight: isQuestion ? 500 : 400,
                color: '#fff',
                marginTop: '3px',
                lineHeight: 1.35,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {detail}
            </div>
          )}
        </div>
      </Html>

      <group ref={bubble} visible={false} position={[0, 0.16 * H, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            geometry={UNIT_BOX}
            material={mats.accent}
            position={[(i - 1) * 0.13 * H, 0, 0]}
            scale={[s(0.07), s(0.07), s(0.07)]}
          />
        ))}
      </group>
      </group>
    </group>
  );
}

// Frame-loop scratch — these run per agent per frame.
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _planet = new THREE.Vector3();
const _camLocal = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _basis = new THREE.Matrix4();
