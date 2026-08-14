/**
 * The landed view: displaced ground under the camera and agents standing on it.
 *
 * Mounts inside the selected planet's group once the descent is far enough
 * along to be worth paying for, and unmounts on the way back to orbit.
 */
import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentInfo, ProjectInfo } from '../types';
import type { AgentIdentity } from '../ui/agentIdentity';
import { getPlanetTypeFromProjectName } from '../ui/planetIdentity';
import { useSpaceStore } from '../store';
import { buildGroundPatch } from './surfaceTerrain';
import type { SurfaceCamp, SurfaceSlot } from './surfacePlacement';
import { computeAnims, hashAgentId } from './agentMotion';
import { AgentFigure } from './AgentFigure';
import { PartyLabel } from './PartyLabel';
import { descentState } from './descentState';
import { PLANET_RADIUS, SURFACE_MOUNT_AT } from './surfaceConstants';

function surfaceOpacity(): number {
  const t = (descentState.progress - SURFACE_MOUNT_AT) / (1 - SURFACE_MOUNT_AT);
  return THREE.MathUtils.clamp(t, 0, 1);
}

function GroundPatch({ projectName, camp }: { projectName: string; camp: SurfaceCamp }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  // Keyed on the project name alone, deliberately. The anchor is a pure
  // function of that name, but it arrives as a freshly-allocated tuple on every
  // socket tick — keying on it would miss the memo once a second and rebuild a
  // 19k-vertex mesh for the entire time you are standing on the planet.
  const anchorRef = useRef(camp.anchor);
  anchorRef.current = camp.anchor;

  const geometry = useMemo(
    () => buildGroundPatch(projectName, anchorRef.current),
    [projectName],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  const volcanic = getPlanetTypeFromProjectName(projectName) === 'volcanic';

  useFrame(() => {
    if (matRef.current) matRef.current.opacity = surfaceOpacity();
  });

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        ref={matRef}
        vertexColors
        transparent
        opacity={0}
        roughness={volcanic ? 0.82 : 0.94}
        metalness={volcanic ? 0.14 : 0.04}
        emissive={volcanic ? '#3a1510' : '#000000'}
        emissiveIntensity={volcanic ? 0.3 : 0}
      />
    </mesh>
  );
}

/**
 * Lighting for the landed view, aimed relative to the camp rather than fixed
 * in planet-local space.
 *
 * A fixed light vector is wrong here: the landing anchor is hashed anywhere on
 * the sphere, so for roughly half of all projects a world-space sun sits below
 * the local horizon and the ground renders flat and unlit. Placing the sun in
 * the camp's own frame gives every project the same late-afternoon angle —
 * high, over the viewer's shoulder, so agents are lit from the front.
 */
function SurfaceLights({ camp }: { camp: SurfaceCamp }) {
  const targetRef = useRef<THREE.Object3D>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);

  const { sun, fill, focus } = useMemo(() => {
    const up = new THREE.Vector3().fromArray(camp.anchor);
    const side = new THREE.Vector3().fromArray(camp.bandAxis);
    const fwd = new THREE.Vector3().fromArray(camp.depthAxis);
    return {
      sun: up
        .clone()
        .multiplyScalar(0.82)
        .addScaledVector(side, 0.42)
        .addScaledVector(fwd, 0.28)
        .normalize()
        .multiplyScalar(9)
        .toArray() as [number, number, number],
      fill: up
        .clone()
        .multiplyScalar(0.6)
        .addScaledVector(side, -0.8)
        .normalize()
        .multiplyScalar(10)
        .toArray() as [number, number, number],
      // Shadow frustum is aimed at the camp, not the planet centre, so its
      // texels are spent on the few metres that actually contain agents.
      focus: up
        .clone()
        .addScaledVector(fwd, 0.42)
        .normalize()
        .multiplyScalar(PLANET_RADIUS)
        .toArray() as [number, number, number],
    };
  }, [camp.anchor, camp.bandAxis, camp.depthAxis]);

  useEffect(() => {
    if (sunRef.current && targetRef.current) {
      sunRef.current.target = targetRef.current;
      sunRef.current.target.updateMatrixWorld();
    }
  }, [focus]);

  return (
    <>
      <ambientLight intensity={0.42} color="#b8c4e8" />
      <hemisphereLight args={['#7d9ad8', '#1a1520', 0.5]} />
      <object3D ref={targetRef} position={focus} />
      <directionalLight
        ref={sunRef}
        position={sun}
        intensity={1.5}
        color="#fff4e6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-1.1}
        shadow-camera-right={1.1}
        shadow-camera-top={1.1}
        shadow-camera-bottom={-1.1}
        shadow-camera-near={5}
        shadow-camera-far={14}
        shadow-bias={-0.0006}
        shadow-normalBias={0.012}
      />
      <directionalLight position={fill} intensity={0.32} color="#4060a0" />
    </>
  );
}

interface SurfaceViewProps {
  project: ProjectInfo;
  camp: SurfaceCamp;
  identities: Map<string, AgentIdentity>;
  planetPosition: [number, number, number];
  reduced: boolean;
}

export function SurfaceView({
  project,
  camp,
  identities,
  planetPosition,
  reduced,
}: SurfaceViewProps) {
  // An animation clock in sixtieths of a second, so motion runs at the same
  // speed regardless of display refresh rate.
  const clockRef = useRef(0);
  const opacityRef = useRef(0);

  useFrame((state) => {
    clockRef.current = state.clock.elapsedTime * 60;
    opacityRef.current = surfaceOpacity();
  });

  const anims = useMemo(() => computeAnims(project.agents), [project.agents]);

  // The camp was planned from `selectSurfaceAgents`, so its slots already are
  // the roster — who stands here and how many. Re-filtering by status would
  // just risk disagreeing with the placement and the camera.
  const standing = useMemo(() => {
    const byId = new Map(project.agents.map((a) => [a.id, a]));
    return camp.slots
      .map((slot) => ({ slot, agent: byId.get(slot.agentId) }))
      .filter((e): e is { slot: SurfaceSlot; agent: AgentInfo } => !!e.agent);
  }, [camp.slots, project.agents]);

  const briefing = useSpaceStore((s) => s.briefing);

  // Parties, narrowed to who is actually standing here. This is a second,
  // independent lookup layered on top of slots the camp already decided —
  // grouping is deliberately not an input to placement, so no arrangement of
  // parties can move an agent.
  const { banners, intentOf, decisionOf, labelledMembers } = useMemo(() => {
    const standingIds = new Set(standing.map((e) => e.agent.id));
    const source = briefing?.projectId === project.id ? briefing.parties : [];

    const parties = source
      .map((p) => ({ ...p, members: p.members.filter((m) => standingIds.has(m.id)) }))
      .filter((p) => p.members.length > 0);

    const intentOf = new Map<string, string>();
    const decisionOf = new Map<string, string>();
    for (const party of parties) {
      for (const member of party.members) {
        intentOf.set(member.id, member.intent);
        if (member.decision) decisionOf.set(member.id, member.decision);
      }
    }

    // A banner needs something to say and someone to share it with. A lone
    // agent carries its own goal on its own chip instead.
    const banners = parties.filter((p) => p.members.length > 1 && p.goal);
    const labelledMembers = new Set(
      banners.flatMap((p) => p.members.map((m) => m.id)),
    );

    return { banners, intentOf, decisionOf, labelledMembers };
  }, [briefing, project.id, standing]);

  // Crowding is measured in labels, not bodies: three agents under one banner
  // draw one label between them and are not crowded at all.
  //
  // A member still speaks for itself when it has something a banner cannot say
  // — a question or an error — and those are exempt from `dense`, so they have
  // to be counted here or a camp of stuck agents reports itself as sparse.
  const speaksForItself = ({ agent }: { agent: AgentInfo }) =>
    !labelledMembers.has(agent.id) ||
    (agent.status === 'waiting' && !!agent.question) ||
    (agent.status === 'error' && !!agent.errorReason);

  const labelCount = banners.length + standing.filter(speaksForItself).length;
  const dense = labelCount > 3;

  return (
    <>
      <SurfaceLights camp={camp} />
      <GroundPatch projectName={project.name} camp={camp} />
      {banners.map((party) => (
        <PartyLabel
          key={party.id}
          camp={camp}
          goal={party.goal}
          memberIds={party.members.map((m) => m.id)}
          statuses={party.members.map(
            (m) => standing.find((e) => e.agent.id === m.id)!.agent.status,
          )}
          projectName={project.name}
          opacityRef={opacityRef}
        />
      ))}
      {standing.map(({ slot, agent }) => (
        <AgentFigure
          key={agent.id}
          agent={agent}
          slot={slot}
          camp={camp}
          identity={identities.get(agent.id)}
          anim={anims.get(agent.id) ?? { kind: 'rest' }}
          seed={hashAgentId(agent.id)}
          projectName={project.name}
          planetPosition={planetPosition}
          clockRef={clockRef}
          opacityRef={opacityRef}
          intent={intentOf.get(agent.id)}
          decision={decisionOf.get(agent.id)}
          inLabelledParty={labelledMembers.has(agent.id)}
          dense={dense}
          reduced={reduced}
        />
      ))}
    </>
  );
}
