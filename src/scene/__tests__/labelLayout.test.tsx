// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { dropLabel, layoutLiveLabels, syncLabel } from '../labelRegistry';

function anchor(
  id: string,
  x: number,
  y: number,
  scale: number,
  width: number,
  height: number,
): HTMLDivElement {
  const el = document.createElement('div');
  el.dataset.lx = String(x);
  el.dataset.ly = String(y);
  el.dataset.ls = String(scale);
  el.dataset.lw = String(width);
  el.dataset.lh = String(height);
  el.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
  document.body.appendChild(el);
  syncLabel(id, el, id === 'error' ? 0 : 3);
  return el;
}

describe('live label layout', () => {
  it('rewrites a label that lands on the HUD', () => {
    const el = anchor('error', 500, 30, 0.93, 160, 40);
    layoutLiveLabels({ width: 1200, height: 800, sidebarOpen: false, panelOpen: false });
    expect(el.style.transform).toContain('scale(0.93)');
    const y = Number(/,([-\d.]+)px,0\)/.exec(el.style.transform)?.[1]);
    expect(y).toBeGreaterThanOrEqual(112);
    dropLabel('error');
    el.remove();
  });

  it('leaves a clear label where it was projected', () => {
    const el = anchor('quiet', 500, 400, 1, 80, 24);
    layoutLiveLabels({ width: 1200, height: 800, sidebarOpen: false, panelOpen: false });
    expect(el.style.transform).toBe('translate3d(500px,400px,0) scale(1)');
    dropLabel('quiet');
    el.remove();
  });
});
