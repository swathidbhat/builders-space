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

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function chromeForbidden(
  width: number,
  height: number,
  options: { sidebarOpen: boolean; panelOpen: boolean },
): ScreenRect[] {
  const bands: ScreenRect[] = [{ left: 0, top: 0, right: width, bottom: HUD_BAND_PX }];
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
    const bandWidth = rect.right - rect.left;
    const fullWidth = bandWidth >= viewport.width * 0.9;
    if (!hitsRect({ ...box, x, y }, rect)) continue;
    if (fullWidth && rect.bottom - rect.top < viewport.height * 0.5) {
      y =
        rect.top < viewport.height / 2
          ? rect.bottom + box.height / 2 + 4
          : rect.top - box.height / 2 - 4;
    } else if (rect.left <= 1) {
      x = rect.right + box.width / 2 + 8;
    } else {
      x = rect.left - box.width / 2 - 8;
    }
  }
  return { x, y };
}

/**
 * Greedy placement. Attention planets keep the spot closest to their planet.
 * Everyone else moves down, then sideways, until they clear the HUD, the open
 * sidebar, the open detail panel, and labels already placed.
 */
export function resolveLabelCollisions(
  boxes: ScreenBox[],
  forbidden: ScreenRect[],
  viewport: { width: number; height: number },
): Array<{ id: string; x: number; y: number }> {
  const ordered = [...boxes].sort((a, b) => a.priority - b.priority || a.y - b.y || a.x - b.x);
  const placed: ScreenBox[] = [];
  const settled: Array<{ id: string; x: number; y: number }> = [];

  for (const box of ordered) {
    let { x, y } = escapeChrome(box, forbidden, viewport);
    for (let step = 0; step < 24; step++) {
      const candidate = { ...box, x, y };
      const blocked =
        forbidden.some((rect) => hitsRect(candidate, rect)) ||
        placed.some((other) => overlaps(candidate, other));
      if (!blocked) break;
      y += 14;
      const again = escapeChrome({ ...box, x, y }, forbidden, viewport);
      x = again.x;
      if (again.y > y) y = again.y;
    }
    const maxY = viewport.height - box.height / 2 - 8;
    const minY = box.height / 2 + 8;
    if (y > maxY) y = maxY;
    if (y < minY) y = minY;
    placed.push({ ...box, x, y });
    settled.push({ id: box.id, x, y });
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
