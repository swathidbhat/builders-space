import {
  chromeForbidden,
  HUD_BAND_PX,
  resolveLabelCollisions,
  type ScreenBox,
  type ScreenRect,
} from './labelPlacement';

interface LiveLabel {
  id: string;
  el: HTMLElement;
  priority: number;
}

const labels = new Map<string, LiveLabel>();

export function syncLabel(id: string, el: HTMLElement, priority: number): void {
  labels.set(id, { id, el, priority });
}

export function dropLabel(id: string): void {
  labels.delete(id);
}

function readBox(label: LiveLabel): ScreenBox | null {
  const x = Number(label.el.dataset.lx);
  const y = Number(label.el.dataset.ly);
  const scale = Number(label.el.dataset.ls);
  const width = Number(label.el.dataset.lw);
  const height = Number(label.el.dataset.lh);
  if (![x, y, scale, width, height].every((value) => Number.isFinite(value))) return null;
  if (scale === 0 || width <= 0 || height <= 0) return null;
  return {
    id: label.id,
    x,
    y,
    width: width * scale,
    height: height * scale,
    priority: label.priority,
  };
}

function readHudBand(): number {
  if (typeof document === 'undefined') return HUD_BAND_PX;
  const header = document.querySelector('header');
  if (!(header instanceof HTMLElement)) return HUD_BAND_PX;
  const height = header.getBoundingClientRect().height;
  if (!Number.isFinite(height) || height <= 0) return HUD_BAND_PX;
  return Math.max(HUD_BAND_PX, Math.ceil(height) + 4);
}

/** Overlays that actually cover the sky: the project list, the detail sheet, the hooks card. */
function measuredChrome(): ScreenRect[] {
  if (typeof document === 'undefined') return [];
  const rects: ScreenRect[] = [];
  for (const selector of [
    'nav[aria-label="Projects"]',
    'aside[aria-label="Project details"]',
    'aside[aria-label="Hooks"]',
    '[data-bottom-dock]',
  ]) {
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 32) continue;
    rects.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
  }
  return rects;
}

/** Move labels that the latest projection dropped on the HUD or on each other. */
export function layoutLiveLabels(options: {
  width: number;
  height: number;
  sidebarOpen: boolean;
  panelOpen: boolean;
  hideOffscreen?: boolean;
}): void {
  const boxes: ScreenBox[] = [];
  for (const label of labels.values()) {
    const box = readBox(label);
    if (box) boxes.push(box);
  }
  if (boxes.length === 0) return;
  const hud = readHudBand();
  const placed = resolveLabelCollisions(
    boxes,
    [
      ...chromeForbidden(options.width, options.height, {
        ...options,
        hudBand: hud,
      }),
      ...measuredChrome(),
    ],
    { width: options.width, height: options.height },
    { hideOffscreen: options.hideOffscreen },
  );
  for (const spot of placed) {
    const label = labels.get(spot.id);
    if (!label) continue;
    const scale = label.el.dataset.ls;
    if (!scale) continue;
    label.el.style.transform = `translate3d(${spot.x}px,${spot.y}px,0) scale(${scale})`;
    label.el.style.visibility = spot.hidden ? 'hidden' : 'visible';
    label.el.style.opacity = spot.hidden ? '0' : '1';
    label.el.dataset.labelHidden = spot.hidden ? '1' : '0';
  }
}
