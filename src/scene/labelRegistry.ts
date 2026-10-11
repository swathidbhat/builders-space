import { chromeForbidden, resolveLabelCollisions, type ScreenBox } from './labelPlacement';

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

/** Move labels that the latest projection dropped on the HUD or on each other. */
export function layoutLiveLabels(options: {
  width: number;
  height: number;
  sidebarOpen: boolean;
  panelOpen: boolean;
}): void {
  const boxes: ScreenBox[] = [];
  for (const label of labels.values()) {
    const box = readBox(label);
    if (box) boxes.push(box);
  }
  if (boxes.length === 0) return;
  const placed = resolveLabelCollisions(
    boxes,
    chromeForbidden(options.width, options.height, options),
    { width: options.width, height: options.height },
  );
  for (const spot of placed) {
    const label = labels.get(spot.id);
    if (!label) continue;
    const scale = label.el.dataset.ls;
    if (!scale) continue;
    label.el.style.transform = `translate3d(${spot.x}px,${spot.y}px,0) scale(${scale})`;
  }
}
