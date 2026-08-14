/**
 * One work party's goal, floating above the agents pursuing it.
 *
 * This is the primary read on a landed planet — what is being built here — so
 * it is wider, brighter and always above the per-agent chips. A party of three
 * draws one of these instead of three names, which is the whole reason the
 * surface stopped being a wall of overlapping labels.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentStatus } from '../types';
import { terrainHeight } from './surfaceTerrain';
import { partyAnchor, type SurfaceCamp } from './surfacePlacement';
import { PLANET_RADIUS, PARTY_LABEL_LIFT } from './surfaceConstants';

/** Same palette as the agent chips — the four statuses are unchanged. */
const STATUS_DOT: Record<AgentStatus, string> = {
  working: '#44ffaa',
  waiting: '#ffaa44',
  error: '#ff4444',
  done: '#8ab4ff',
};

/** Most urgent first — the banner speaks for whoever most needs you. */
const DOT_PRIORITY: AgentStatus[] = ['error', 'waiting', 'working', 'done'];

function dominantStatus(statuses: AgentStatus[]): AgentStatus {
  for (const s of DOT_PRIORITY) {
    if (statuses.includes(s)) return s;
  }
  return 'working';
}

interface PartyLabelProps {
  camp: SurfaceCamp;
  goal: string;
  memberIds: string[];
  statuses: AgentStatus[];
  projectName: string;
  opacityRef: React.MutableRefObject<number>;
}

export function PartyLabel({
  camp,
  goal,
  memberIds,
  statuses,
  projectName,
  opacityRef,
}: PartyLabelProps) {
  const group = useRef<THREE.Group>(null);
  const wrap = useRef<HTMLDivElement>(null);

  // Lifted along the radius rather than by a +Y offset on a child: the camp is
  // hashed anywhere on the sphere, so the planet's local +Y is "up" only for a
  // camp near the pole. Everywhere else it points sideways, and the banner
  // drifts off its party. Out from the centre is the only reliable up here.
  const position = useMemo(() => {
    const anchor = partyAnchor(camp, memberIds);
    if (!anchor) return null;
    const r =
      PLANET_RADIUS + terrainHeight(projectName, anchor.dir) + PARTY_LABEL_LIFT;
    return new THREE.Vector3(
      anchor.dir[0] * r,
      anchor.dir[1] * r,
      anchor.dir[2] * r,
    );
  }, [camp, memberIds, projectName]);

  // Fades on the same schedule as the ground and the figures, so the camp
  // arrives as one thing rather than in pieces.
  useFrame(() => {
    const alpha = opacityRef.current;
    if (group.current) group.current.visible = alpha > 0.01;
    if (wrap.current) wrap.current.style.opacity = String(alpha);
  });

  if (!position) return null;

  const dot = STATUS_DOT[dominantStatus(statuses)];

  return (
    <group ref={group} position={position}>
      <Html
        center
        distanceFactor={1.15}
        // Above every agent chip, which stagger between 40 and 60.
        zIndexRange={[70, 60]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          ref={wrap}
          style={{
            width: '168px',
            padding: '8px 10px',
            borderRadius: '11px',
            background: 'rgba(8,8,20,0.88)',
            border: '1px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(10px)',
            fontFamily: "'Inter', sans-serif",
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: dot,
                boxShadow: `0 0 7px ${dot}`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#fff',
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {goal}
            </span>
          </div>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 500,
              color: '#fff',
              opacity: 0.62,
              marginTop: '4px',
              letterSpacing: '0.02em',
            }}
          >
            {memberIds.length} agents
          </div>
        </div>
      </Html>
    </group>
  );
}
