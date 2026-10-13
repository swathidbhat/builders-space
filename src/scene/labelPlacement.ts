import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera, type Object3D } from 'three';

const worldPos = new Vector3();
const cameraPos = new Vector3();
const cameraDir = new Vector3();
const projected = new Vector3();

const Z_INDEX_RANGE: [number, number] = [16777271, 0];

/** CSS size of the planet name. Scale is clamped so this stays readable. */
export const LABEL_FONT_PX = 14;
/** Smallest on-screen size of that name, at any camera distance. */
export const MIN_LABEL_PX = 13;
export const HUD_BAND_PX = 112;
export const SIDEBAR_BAND_PX = 248;
export const PANEL_BAND_PX = 420;
/** Corner kept clear for the hooks button so it does not sit on a label. */
export const HOOK_CORNER_PX = 64;
/** Below this width the sidebar and detail panel are overlays, not columns. */
export const COMPACT_MAX_PX = 999;

export interface LabelStyle {
  transform: string;
  zIndex: string;
  visible: boolean;
}

/**
 * Screen placement used by planet labels. Same projection, distance scale,
 * and depth order as drei's non-transform Html with `center` and `distanceFactor`.
 */
export function labelStyle(
  object: Object3D,
  camera: Camera,
  width: number,
  height: number,
  distanceFactor: number,
): LabelStyle {
  object.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();

  const objectPos = worldPos.setFromMatrixPosition(object.matrixWorld);
  projected.copy(objectPos).project(camera);
  const widthHalf = width / 2;
  const heightHalf = height / 2;
  const x = projected.x * widthHalf + widthHalf;
  const y = -(projected.y * heightHalf) + heightHalf;

  const cam = cameraPos.setFromMatrixPosition(camera.matrixWorld);
  const behind =
    objectPos.clone().sub(cam).angleTo(camera.getWorldDirection(cameraDir)) > Math.PI / 2;
  const scale = clampedLabelScale(labelScale(objectPos, cam, camera, distanceFactor));
  return {
    transform: `translate3d(${x}px,${y}px,0) scale(${scale})`,
    zIndex: depthIndex(objectPos, cam, camera),
    visible: !behind,
  };
}

export function labelScale(
  objectPos: Vector3,
  cameraPos: Vector3,
  camera: Camera,
  distanceFactor: number,
): number {
  if (camera instanceof OrthographicCamera) return camera.zoom * distanceFactor;
  if (!(camera instanceof PerspectiveCamera)) return distanceFactor;
  const distance = objectPos.distanceTo(cameraPos);
  const vFov = (camera.fov * Math.PI) / 180;
  const scaleFov = 2 * Math.tan(vFov / 2) * distance;
  if (scaleFov === 0) return distanceFactor;
  return (1 / scaleFov) * distanceFactor;
}

export function clampedLabelScale(raw: number): number {
  const minScale = MIN_LABEL_PX / LABEL_FONT_PX;
  if (!Number.isFinite(raw) || raw <= 0) return minScale;
  return Math.min(1, Math.max(minScale, raw));
}

export type LabelAttention = 'error' | 'waiting' | 'active' | 'idle';

/** Lower numbers win a contested spot. Errors and "needs you" beat a selected planet. */
export function labelPriority(state: LabelAttention, selected: boolean): number {
  if (state === 'error') return 0;
  if (state === 'waiting') return 1;
  if (selected) return 2;
  return 3;
}

export interface ScreenBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
}

export interface SettledLabel {
  id: string;
  x: number;
  y: number;
  hidden: boolean;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function chromeForbidden(
  width: number,
  height: number,
  options: { sidebarOpen: boolean; panelOpen: boolean; hudBand?: number },
): ScreenRect[] {
  const hud = options.hudBand ?? HUD_BAND_PX;
  const bands: ScreenRect[] = [
    { left: 0, top: 0, right: width, bottom: hud },
    { left: width - HOOK_CORNER_PX, top: height - HOOK_CORNER_PX, right: width, bottom: height },
  ];
  if (options.sidebarOpen) {
    bands.push({ left: 0, top: 0, right: SIDEBAR_BAND_PX, bottom: height });
  }
  if (options.panelOpen) {
    bands.push({ left: width - PANEL_BAND_PX, top: 0, right: width, bottom: height });
  }
  return bands;
}

function boxEdges(box: { x: number; y: number; width: number; height: number }) {
  return {
    left: box.x - box.width / 2,
    right: box.x + box.width / 2,
    top: box.y - box.height / 2,
    bottom: box.y + box.height / 2,
  };
}

function overlaps(a: ScreenBox, b: ScreenBox): boolean {
  const A = boxEdges(a);
  const B = boxEdges(b);
  return A.right > B.left && A.left < B.right && A.bottom > B.top && A.top < B.bottom;
}

function hitsRect(box: ScreenBox, rect: ScreenRect): boolean {
  const A = boxEdges(box);
  return A.right > rect.left && A.left < rect.right && A.bottom > rect.top && A.top < rect.bottom;
}

function escapeChrome(
  box: ScreenBox,
  forbidden: ScreenRect[],
  viewport: { width: number; height: number },
): { x: number; y: number } {
  let x = box.x;
  let y = box.y;
  for (const rect of forbidden) {
    const touchesTop = rect.top <= 8;
    const touchesBottom = rect.bottom >= viewport.height - 24;
    const touchesLeft = rect.left <= 8;
    const touchesRight = rect.right >= viewport.width - 8;
    const tall = rect.bottom - rect.top >= viewport.height * 0.55;
    const wide = rect.right - rect.left >= viewport.width * 0.45;
    if (!hitsRect({ ...box, x, y }, rect)) continue;
    if (tall && touchesLeft && !wide) {
      x = rect.right + box.width / 2 + 8;
    } else if (tall && touchesRight && !wide) {
      x = rect.left - box.width / 2 - 8;
    } else if (touchesTop && !touchesBottom) {
      y = rect.bottom + box.height / 2 + 4;
    } else {
      y = rect.top - box.height / 2 - 4;
    }
  }
  return { x, y };
}

function clampToViewport(
  x: number,
  y: number,
  box: ScreenBox,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const halfW = box.width / 2;
  const minX = halfW + 8;
  const maxX = viewport.width - halfW - 8;
  return {
    x: maxX >= minX ? Math.min(maxX, Math.max(minX, x)) : viewport.width / 2,
    y: clampY(y, box, viewport),
  };
}

/**
 * Off-screen projections are pulled into the viewport before chrome is applied.
 * Clamping afterwards can drop a label back onto the HUD, so the two steps repeat
 * until the spot is on screen and clear.
 */
function placeClear(
  box: ScreenBox,
  forbidden: ScreenRect[],
  viewport: { width: number; height: number },
): { x: number; y: number } {
  let x = box.x;
  let y = box.y;
  for (let pass = 0; pass < 6; pass++) {
    const clamped = clampToViewport(x, y, box, viewport);
    const escaped = escapeChrome({ ...box, x: clamped.x, y: clamped.y }, forbidden, viewport);
    if (Math.abs(escaped.x - clamped.x) < 0.5 && Math.abs(escaped.y - clamped.y) < 0.5) {
      return clamped;
    }
    x = escaped.x;
    y = escaped.y;
  }
  return clampToViewport(x, y, box, viewport);
}

function blockedAt(
  box: ScreenBox,
  x: number,
  y: number,
  forbidden: ScreenRect[],
  placed: ScreenBox[],
): boolean {
  const candidate = { ...box, x, y };
  return (
    forbidden.some((rect) => hitsRect(candidate, rect)) ||
    placed.some((other) => overlaps(candidate, other))
  );
}

function clampY(y: number, box: ScreenBox, viewport: { height: number }): number {
  const maxY = viewport.height - box.height / 2 - 8;
  const minY = box.height / 2 + 8;
  return Math.min(maxY, Math.max(minY, y));
}

/** Attention labels search the open sky so they can sit side by side above a sheet. */
function nearestClear(
  box: ScreenBox,
  forbidden: ScreenRect[],
  placed: ScreenBox[],
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const preferred = placeClear(box, forbidden, viewport);
  if (!blockedAt(box, preferred.x, preferred.y, forbidden, placed)) return preferred;

  const minX = box.width / 2 + 8;
  const maxX = Math.max(minX, viewport.width - box.width / 2 - 8);
  const minY = box.height / 2 + 8;
  const maxY = Math.max(minY, viewport.height - box.height / 2 - 8);
  let best: { x: number; y: number; score: number } | null = null;
  for (let y = minY; y <= maxY + 0.5; y += 16) {
    for (let x = minX; x <= maxX + 0.5; x += 24) {
      if (blockedAt(box, x, y, forbidden, placed)) continue;
      const score = Math.abs(x - preferred.x) + Math.abs(y - preferred.y);
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  if (best) return best;
  for (const other of placed) {
    const beside = other.x + (other.width + box.width) / 2 + 8;
    const below = other.y + (other.height + box.height) / 2 + 8;
    if (!blockedAt(box, beside, other.y, forbidden, placed)) return { x: beside, y: other.y };
    if (!blockedAt(box, other.x, below, forbidden, placed)) return { x: other.x, y: below };
  }
  return preferred;
}

/**
 * Attention labels (error, needs you, selected) always stay.
 * Other labels keep a nearby clear spot, and hide when the sky is too crowded
 * for that — they do not stack into a column over the HUD.
 */
function farOffscreen(box: ScreenBox, viewport: { width: number; height: number }): boolean {
  return box.x < -8 || box.y < -8 || box.x > viewport.width + 8 || box.y > viewport.height + 8;
}

export function resolveLabelCollisions(
  boxes: ScreenBox[],
  forbidden: ScreenRect[],
  viewport: { width: number; height: number },
  options?: { hideOffscreen?: boolean },
): SettledLabel[] {
  const ordered = [...boxes].sort((a, b) => a.priority - b.priority || a.y - b.y || a.x - b.x);
  const placed: ScreenBox[] = [];
  const settled: SettledLabel[] = [];
  const nudges = [0, 18, -18, 36, -36];

  for (const box of ordered) {
    if (options?.hideOffscreen && farOffscreen(box, viewport)) {
      settled.push({ id: box.id, x: box.x, y: box.y, hidden: true });
      continue;
    }
    const attention = box.priority <= 2;
    if (attention) {
      const spot = nearestClear(box, forbidden, placed, viewport);
      placed.push({ ...box, x: spot.x, y: spot.y });
      settled.push({ id: box.id, x: spot.x, y: spot.y, hidden: false });
      continue;
    }
    const { x, y } = placeClear(box, forbidden, viewport);

    let found = false;
    let fx = x;
    let fy = y;
    for (const dy of nudges) {
      if (found) break;
      for (const dx of nudges) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < box.width / 2 + 8 || nx > viewport.width - box.width / 2 - 8) continue;
        if (ny < box.height / 2 + 8 || ny > viewport.height - box.height / 2 - 8) continue;
        if (blockedAt(box, nx, ny, forbidden, placed)) continue;
        fx = nx;
        fy = ny;
        found = true;
        break;
      }
    }
    if (!found) {
      settled.push({ id: box.id, x, y, hidden: true });
      continue;
    }
    placed.push({ ...box, x: fx, y: fy });
    settled.push({ id: box.id, x: fx, y: fy, hidden: false });
  }

  return settled;
}

function depthIndex(objectPos: Vector3, cameraPos: Vector3, camera: Camera): string {
  if (!(camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera)) return '0';
  const distance = objectPos.distanceTo(cameraPos);
  const slope = (Z_INDEX_RANGE[1] - Z_INDEX_RANGE[0]) / (camera.far - camera.near);
  const intercept = Z_INDEX_RANGE[1] - slope * camera.far;
  return String(Math.round(slope * distance + intercept));
}
