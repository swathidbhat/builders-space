/**
 * Decides where each agent stands on the landed planet's surface.
 *
 * Pure math: the public API is plain number tuples so the placement can be
 * reasoned about and tested without a renderer. The single property that
 * matters is determinism — the socket pushes a fresh projects array every
 * tick, so a slot must depend only on (projectName, agent.id) and never on
 * array order, agent status or which other agents happen to be present.
 */

import type { AgentInfo } from '../types';
import { hashProjectName } from '../ui/planetIdentity';
import {
  BAND_HALF_ANGLE,
  DEPTH_FAR,
  DEPTH_NEAR,
  MIN_SEPARATION,
  VIEWER_DIR,
} from './surfaceConstants';

/**
 * How many agents stand on the ground at once.
 *
 * Not an arbitrary limit — it is what the view can physically carry. The
 * horizon is ~0.8 world units away, the band that holds agents spans 14
 * degrees either side, and each one needs a readable label above it. Past
 * this the camp becomes a huddle of overlapping figures and colliding labels,
 * and a project with forty agents would render as noise.
 *
 * Nothing is hidden by this: the overlay bar lists every agent, always.
 */
export const SURFACE_MAX_AGENTS = 5;

/** Agents that never stand on the ground — they need no awareness. */
const GROUND_EXCLUDED = new Set(['done']);

/** Most urgent first, so a cap keeps what actually needs you. */
const GROUND_PRIORITY: Record<string, number> = {
  error: 0,
  waiting: 1,
  working: 2,
};

/**
 * Which agents stand on the ground, in priority order.
 *
 * Ties break on id rather than recency: `lastActivityMs` changes on nearly
 * every socket tick, and sorting by it would reshuffle who is standing where
 * once a second.
 */
export function selectSurfaceAgents(agents: AgentInfo[]): AgentInfo[] {
  return agents
    .filter((a) => !GROUND_EXCLUDED.has(a.status))
    .sort((a, b) => {
      const pa = GROUND_PRIORITY[a.status] ?? 9;
      const pb = GROUND_PRIORITY[b.status] ?? 9;
      if (pa !== pb) return pa - pb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, SURFACE_MAX_AGENTS);
}

export interface SurfaceSlot {
  agentId: string;
  /** Unit direction from planet centre to this agent's footing. */
  dir: [number, number, number];
  /** Signed arc offset across the band from the anchor meridian, radians. */
  bandAngle: number;
  /** Arc offset in depth away from the camera ground point, radians. */
  depthAngle: number;
}

export interface SurfaceCamp {
  /** Unit direction of the landing anchor — stable per project name. */
  anchor: [number, number, number];
  /** Unit tangent at the anchor: the band ("east/west") axis. */
  bandAxis: [number, number, number];
  /** Unit tangent at the anchor: the depth axis, pointing away from camera. */
  depthAxis: [number, number, number];
  slots: SurfaceSlot[];
}

type Vec3 = [number, number, number];

/** Fraction of the band/depth extent the initial scatter occupies. */
const SPREAD_INSET = 0.94;

const RELAX_PASSES = 48;

/** Usable angular area of the band, radians². */
const BAND_AREA =
  2 * BAND_HALF_ANGLE * SPREAD_INSET * (DEPTH_FAR - DEPTH_NEAR) * SPREAD_INSET;

/**
 * Separation to relax toward for `n` agents.
 *
 * MIN_SEPARATION is the goal, but the band is only so big — hex packing runs
 * out at about 16 agents, past which no algorithm can hit it and the honest
 * answer is to crowd evenly rather than fail. Degrading the target keeps the
 * relaxation converging instead of thrashing against a target it cannot meet.
 */
function separationTarget(n: number): number {
  if (n < 2) return MIN_SEPARATION;
  const hexFit = Math.sqrt((2 * BAND_AREA) / (n * Math.sqrt(3)));
  return Math.min(MIN_SEPARATION, hexFit);
}

/** Anchor is treated as degenerate against the reference up beyond this. */
const PARALLEL_EPS = 0.999;

const REF_UP: Vec3 = [0, 1, 0];
const REF_SIDE: Vec3 = [1, 0, 0];

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Deterministic value in [0, 1) from an arbitrary seed string. */
function unitHash(seed: string): number {
  return (hashProjectName(seed) % 10007) / 10007;
}

/**
 * Great-circle separation between two slots. Band and depth behave exactly
 * like longitude and latitude in the anchor frame, so this is the spherical
 * law of cosines — no need to build the direction vectors.
 */
function slotSeparation(b1: number, d1: number, b2: number, d2: number): number {
  const c =
    Math.cos(d1) * Math.cos(d2) * Math.cos(b1 - b2) +
    Math.sin(d1) * Math.sin(d2);
  return Math.acos(clamp(c, -1, 1));
}

/**
 * The orthonormal landing frame.
 *
 * The anchor is the face of the sphere already turned toward the viewer, not a
 * hash of the project name. That single choice is what makes landing feel like
 * an approach instead of a ride: the camera is already above this point when
 * you click, so the descent is a fall straight down its own view ray — no
 * swing around the planet, and the levelling onto the local horizon is a pure
 * pitch rather than a roll of the whole visual field.
 *
 * Hashing it, as this did, put the camp anywhere on the sphere — routinely on
 * the far side — so arriving meant travelling up to 180 degrees around the
 * planet and rolling up to 180 degrees to stand up. That is the spin.
 *
 * The camp's *roll around* the anchor is still hashed, so two projects still
 * face different ways and their terrain still differs; only the side of the
 * sphere you arrive on is now fixed. Nothing else can tell, because you only
 * ever stand on one planet at a time.
 *
 * Safe as a constant because `SurfaceView` mounts on the planet's outer group,
 * which carries position only — the spin lives on the sphere mesh inside it —
 * so planet-local axes are world axes.
 */
function anchorFrame(projectName: string): {
  anchor: Vec3;
  bandAxis: Vec3;
  depthAxis: Vec3;
} {
  const anchor: Vec3 = [VIEWER_DIR[0], VIEWER_DIR[1], VIEWER_DIR[2]];

  // Project a reference vector onto the tangent plane. Swap references when
  // the anchor is (near) parallel to up, where the projection collapses.
  const ref = Math.abs(dot(anchor, REF_UP)) > PARALLEL_EPS ? REF_SIDE : REF_UP;
  const along = dot(ref, anchor);
  const t1 = normalize([
    ref[0] - anchor[0] * along,
    ref[1] - anchor[1] * along,
    ref[2] - anchor[2] * along,
  ]);
  const t2 = cross(anchor, t1);

  const roll = 2 * Math.PI * unitHash(`${projectName}#band`);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const bandAxis = normalize([
    t1[0] * cr + t2[0] * sr,
    t1[1] * cr + t2[1] * sr,
    t1[2] * cr + t2[2] * sr,
  ]);
  const depthAxis = normalize(cross(bandAxis, anchor));

  return { anchor, bandAxis, depthAxis };
}

/**
 * The anchor tipped `depthAngle` toward `depthAxis` (a rotation about
 * `bandAxis`), then swung `bandAngle` toward `bandAxis` (a rotation about
 * `depthAxis`). Expanding both rotations in the orthonormal frame collapses
 * to the closed form below, which is unit length by construction.
 */
function slotDir(
  anchor: Vec3,
  bandAxis: Vec3,
  depthAxis: Vec3,
  bandAngle: number,
  depthAngle: number,
): Vec3 {
  const cb = Math.cos(bandAngle);
  const sb = Math.sin(bandAngle);
  const cd = Math.cos(depthAngle);
  const sd = Math.sin(depthAngle);
  return normalize([
    anchor[0] * cb * cd + bandAxis[0] * sb * cd + depthAxis[0] * sd,
    anchor[1] * cb * cd + bandAxis[1] * sb * cd + depthAxis[1] * sd,
    anchor[2] * cb * cd + bandAxis[2] * sb * cd + depthAxis[2] * sd,
  ]);
}

/**
 * Plan the standing positions for a project's agents.
 *
 * Each agent's spot comes from a hash of its id, so neither the order agents
 * arrive in nor the presence of the others decides where it stands. Adding or
 * removing an agent leaves the rest put, bar a nudge where the newcomer landed
 * close enough to crowd someone.
 *
 * Agents are sorted by id first so the relaxation walks pairs in a fixed
 * order. Returned slots are in that id-sorted order, not input order.
 */
export function planSurfaceCamp(
  agents: AgentInfo[],
  projectName: string,
): SurfaceCamp {
  const { anchor, bandAxis, depthAxis } = anchorFrame(projectName);
  if (agents.length === 0) {
    return { anchor, bandAxis, depthAxis, slots: [] };
  }

  const ordered = [...agents].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const n = ordered.length;

  const bandSpan = BAND_HALF_ANGLE * SPREAD_INSET;
  const depthMargin = ((DEPTH_FAR - DEPTH_NEAR) * (1 - SPREAD_INSET)) / 2;
  const depthLo = DEPTH_NEAR + depthMargin;
  const depthHi = DEPTH_FAR - depthMargin;

  const bands = new Array<number>(n);
  const depths = new Array<number>(n);

  // Scatter from the agent id alone — never from its index. The socket drops
  // an agent as soon as its session ages out, so an index-derived spot would
  // teleport every surviving agent across the band on each dropout.
  for (let i = 0; i < n; i++) {
    const { id } = ordered[i];
    const bx = unitHash(`${id}#band`);
    const dy = unitHash(`${id}#depth`);
    bands[i] = clamp(
      (bx * 2 - 1) * bandSpan,
      -BAND_HALF_ANGLE,
      BAND_HALF_ANGLE,
    );
    depths[i] = clamp(
      depthLo + dy * (depthHi - depthLo),
      DEPTH_NEAR,
      DEPTH_FAR,
    );
  }

  // Deterministic relaxation: walk the pairs in id-sorted order and push any
  // that crowd each other apart, clamping back inside the band each time.
  // Aim a little past the target: the nudge works in the (band, depth)
  // parameter plane while the constraint is true arc on the sphere, and the
  // margin absorbs the difference.
  const relaxTarget = separationTarget(n) * 1.08;
  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sep = slotSeparation(bands[i], depths[i], bands[j], depths[j]);
        if (sep >= relaxTarget) continue;
        moved = true;

        let db = bands[j] - bands[i];
        let dd = depths[j] - depths[i];
        let len = Math.hypot(db, dd);
        if (len < 1e-9) {
          // Exactly coincident: split along the band, lower index to the left.
          db = 1;
          dd = 0;
          len = 1;
        }
        const push = (relaxTarget - sep) / 2;
        const ub = (db / len) * push;
        const ud = (dd / len) * push;

        bands[i] = clamp(bands[i] - ub, -BAND_HALF_ANGLE, BAND_HALF_ANGLE);
        depths[i] = clamp(depths[i] - ud, DEPTH_NEAR, DEPTH_FAR);
        bands[j] = clamp(bands[j] + ub, -BAND_HALF_ANGLE, BAND_HALF_ANGLE);
        depths[j] = clamp(depths[j] + ud, DEPTH_NEAR, DEPTH_FAR);
      }
    }
    if (!moved) break;
  }

  const slots: SurfaceSlot[] = ordered.map((agent, i) => ({
    agentId: agent.id,
    dir: slotDir(anchor, bandAxis, depthAxis, bands[i], depths[i]),
    bandAngle: bands[i],
    depthAngle: depths[i],
  }));

  return { anchor, bandAxis, depthAxis, slots };
}

/** A direction on the sphere at the given offsets in the camp's own frame. */
export function campPoint(
  camp: SurfaceCamp,
  bandAngle: number,
  depthAngle: number,
): Vec3 {
  return slotDir(camp.anchor, camp.bandAxis, camp.depthAxis, bandAngle, depthAngle);
}

/**
 * Where a work party's shared label hangs.
 *
 * A read-only derivation of slots that `planSurfaceCamp` already decided —
 * grouping is never an input to placement, so no arrangement of parties can
 * move an agent. Returns null when none of the members are standing here.
 *
 * Band centroid, but the depth of the *furthest-back* member. Individual
 * labels already stagger upward with depth so a row of agents fans out; sitting
 * the banner at the back of that fan puts it above and behind every member
 * chip, where the gap has already opened. A centroid in depth, or the frontmost
 * member, would drop it into the middle of the fan and collide with the nearest
 * agent's own name.
 */
export function partyAnchor(
  camp: SurfaceCamp,
  memberIds: string[],
): { bandAngle: number; depthAngle: number; dir: Vec3 } | null {
  const wanted = new Set(memberIds);
  // Sorted before summing: floating-point addition is not associative, so an
  // unsorted walk would return subtly different anchors for the same party
  // depending on the order the members arrived in.
  const slots = camp.slots
    .filter((s) => wanted.has(s.agentId))
    .sort((a, b) => (a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0));

  if (slots.length === 0) return null;

  let bandSum = 0;
  let depthMax = -Infinity;
  for (const slot of slots) {
    bandSum += slot.bandAngle;
    if (slot.depthAngle > depthMax) depthMax = slot.depthAngle;
  }

  const bandAngle = bandSum / slots.length;
  return {
    bandAngle,
    depthAngle: depthMax,
    dir: campPoint(camp, bandAngle, depthMax),
  };
}
