/**
 * Canonical geometry for the landed "surface" view.
 *
 * Every module that touches the surface (placement, terrain, sprites, camera)
 * imports these. Do not redefine any of them locally — the whole view only
 * lines up because the placement math, the displaced ground mesh and the
 * camera all evaluate the same numbers.
 */

/** Planet sphere radius in the orbital scene. Matches `radius` in Planet.tsx. */
export const PLANET_RADIUS = 1.8;

/**
 * Where the orbital camera sits relative to what it is framing, as multiples of
 * the fit distance: up and back.
 *
 * Shared with the landing anchor deliberately. The camp is planted on the face
 * of the sphere pointing this way, which is what makes a descent a descent
 * rather than a trip around the planet — see `anchorFrame`.
 */
export const OVERVIEW_OFFSET = { up: 0.65, back: 0.6 } as const;

/** Unit direction from a planet's centre toward the orbital camera. */
export const VIEWER_DIR: readonly [number, number, number] = (() => {
  const len = Math.hypot(0, OVERVIEW_OFFSET.up, OVERVIEW_OFFSET.back);
  return [0, OVERVIEW_OFFSET.up / len, OVERVIEW_OFFSET.back / len];
})();

/**
 * Camera eye height above the displaced ground at the landing anchor.
 *
 * Standing lower is more dramatic but unusable: on a sphere this small the
 * visible ground compresses toward the horizon fast, so at 0.2 the whole
 * walkable band collapses into a few percent of frame height and the nearest
 * agents balloon to half the screen. 0.5 keeps the curve obvious while giving
 * the camp room to spread.
 */
export const EYE_HEIGHT = 0.5;

/** Distance from planet centre to the landed camera (mean ground). */
export const CAMERA_DIST = PLANET_RADIUS + EYE_HEIGHT;

/**
 * Angular radius of the visible ground disc: acos(R / d).
 * At R=1.8, d=2.0 this is 25.84° — anything further than this is below the
 * horizon and cannot be seen, which is what bounds agent placement.
 */
export const HORIZON_ANGLE = Math.acos(PLANET_RADIUS / CAMERA_DIST);

/**
 * Downward pitch of the landed camera from local horizontal, radians.
 *
 * Chosen against the overlay bar: it puts the horizon at ~66% of frame height
 * and the agent band between 66% and 76%, clearing the bar that starts at 77%.
 */
export const CAMERA_PITCH = (29 * Math.PI) / 180;

// --- Agent placement band -------------------------------------------------
// Agents sit in a shallow arc band in front of the camera rather than a radial
// disc: a disc would put half of them behind the viewer or below the horizon.

/**
 * Half-width of the band, radians. At the landed viewing distance this puts
 * the outermost agent ~26° off the view axis, inside the ~45° horizontal
 * half-FOV with room to spare.
 */
export const BAND_HALF_ANGLE = (14 * Math.PI) / 180;

/**
 * Nearest an agent may stand, as arc angle from the camera ground point.
 *
 * Not as small as it could be: closer than this and the agent is both huge and
 * low enough in frame to sit behind the overlay bar. At 20° it lands ~0.87
 * units from the eye, about 15% of frame height.
 */
export const DEPTH_NEAR = (20 * Math.PI) / 180;

/** Furthest an agent may stand. Kept inside HORIZON_ANGLE (38.5°) with margin. */
export const DEPTH_FAR = (34 * Math.PI) / 180;

/**
 * Minimum angular separation between two agents, radians. 5° of arc is ~0.157
 * world units, comfortably wider than a character (~0.105) so they never
 * visually merge.
 */
export const MIN_SEPARATION = (5 * Math.PI) / 180;

// --- Terrain --------------------------------------------------------------

/**
 * Angular radius of the displaced ground patch.
 *
 * Sized against the worst reachable pose, not the landing pose. Two things
 * widen the requirement: the horizon grows as you scroll up (acos(R/d) is 40°
 * at the default eye height but 56° at ALT_MAX), and the patch is centred on
 * the camp anchor while what you actually see is centred on your standing
 * point, which panning moves up to PAN_LIMIT away. 56° + 16° = 72°, so 74°
 * leaves a margin.
 *
 * Undersizing this is not a cosmetic rim artefact — the sphere behind is
 * swapped to a flat material once landed, so short coverage shows a flat
 * sliver where terrain should be.
 */
export const PATCH_ANGLE = (74 * Math.PI) / 180;

/**
 * Ring/segment resolution of the ground patch mesh. Rings scale with
 * PATCH_ANGLE, so this rose alongside it to keep near-field density — the
 * ground half a unit from the camera is the most scrutinised surface in the app.
 */
export const PATCH_RINGS = 120;
export const PATCH_SEGMENTS = 160;

/**
 * Radial displacement range of the terrain, world units.
 *
 * Enough to make the horizon a ridged silhouette rather than a drafting-
 * compass arc, and it is the same height field the agents' feet follow. Much
 * less and the ground reads as a smooth dome; past ~0.12 a single rise 0.9
 * units ahead subtends enough angle to fill the foreground and hide the camp.
 */
export const TERRAIN_MIN = 0.004;
export const TERRAIN_MAX = 0.09;

// --- Agents --------------------------------------------------------------

/**
 * Standing height of an agent, world units.
 *
 * Agents are built from lit geometry rather than drawn as sprites, so this is
 * a true size rather than a texture scale — there is no resolution to run out
 * of as the camera moves closer.
 */
export const AGENT_WORLD_HEIGHT = 0.17;

/**
 * Body proportions, as fractions of AGENT_WORLD_HEIGHT.
 *
 * Deliberately chunky and short-limbed: at ~0.9 units from the camera an agent
 * is around 130px tall, and realistic proportions would put a forearm below a
 * pixel or two. The silhouette has to carry the pose on its own.
 */
export const AGENT_PARTS = {
  legHeight: 0.3,
  legWidth: 0.15,
  legDepth: 0.15,
  legGap: 0.09,
  torsoHeight: 0.34,
  torsoWidth: 0.38,
  torsoDepth: 0.22,
  armHeight: 0.3,
  armWidth: 0.11,
  armDepth: 0.11,
  headSize: 0.3,
  hairHeight: 0.09,
  eyeSize: 0.055,
} as const;

/** How far a walking agent strays from its slot, world units along the band. */
export const WALK_WORLD_RANGE = 0.06;

/**
 * How far above the ground a party's goal banner floats.
 *
 * Must clear the tallest member chip, which is higher than it looks: an agent's
 * label hangs off a group already lifted 1.06 agent-heights to sit above the
 * head, and the depth stagger adds up to another 0.72 on top of that. Anything
 * under ~1.8 lands the banner inside the fan of names instead of above it.
 */
export const PARTY_LABEL_LIFT = 2.6 * AGENT_WORLD_HEIGHT;

// --- Transition -----------------------------------------------------------

/**
 * Duration of the descent from orbit to the surface, seconds.
 *
 * Slower than it first was. The same path over 1.4s reads as a lurch: peak
 * angular rate, not distance covered, is what makes a camera move
 * uncomfortable to watch, and stretching the schedule is the cheapest way to
 * bring that rate down.
 */
export const DESCENT_SECONDS = 2;

/**
 * Descent duration when the viewer prefers reduced motion — short enough to
 * read as a cut with a settle, rather than a journey.
 */
export const DESCENT_SECONDS_REDUCED = 0.35;

/**
 * Descent progress at which surface detail (patch, agents) begins to mount.
 *
 * Late on purpose. Distance eases geometrically, so by here the camera is
 * already ~2.4 units from the planet centre and the patch fills the frame —
 * which is what hides its rim. Mounting earlier shows the seam; it also pays
 * for a 15k-vertex mesh and per-agent canvas redraws during a fall where the
 * agents are barely a pixel tall.
 */
export const SURFACE_MOUNT_AT = 0.85;
