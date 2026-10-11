// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
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

  it('hides a quiet label that still covers an attention label', () => {
    const error = anchor('error', 400, 240, 1, 160, 48);
    const quiet = anchor('crowd', 400, 240, 1, 160, 48);
    layoutLiveLabels({ width: 1200, height: 800, sidebarOpen: false, panelOpen: false });
    expect(error.dataset.labelHidden).toBe('0');
    expect(quiet.dataset.labelHidden).toBe('1');
    expect(quiet.style.visibility).toBe('hidden');
    dropLabel('error');
    dropLabel('crowd');
    error.remove();
    quiet.remove();
  });

  it('shifts a label out of a measured project list', () => {
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Projects');
    document.body.appendChild(nav);
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 64,
      left: 0,
      top: 64,
      right: 248,
      bottom: 900,
      width: 248,
      height: 836,
      toJSON() {
        return {};
      },
    });
    const el = anchor('error', -731, 65, 1, 204, 45);
    layoutLiveLabels({ width: 800, height: 900, sidebarOpen: false, panelOpen: false });
    const x = Number(/translate3d\(([-\d.]+)px/.exec(el.style.transform)?.[1]);
    const y = Number(/,([-\d.]+)px,0\)/.exec(el.style.transform)?.[1]);
    expect(x - 102).toBeGreaterThanOrEqual(248);
    expect(y - 22.5).toBeGreaterThanOrEqual(112);
    dropLabel('error');
    el.remove();
    nav.remove();
  });

  it('leaves a clear label where it was projected', () => {
    const el = anchor('quiet', 500, 400, 1, 80, 24);
    layoutLiveLabels({ width: 1200, height: 800, sidebarOpen: false, panelOpen: false });
    expect(el.style.transform).toBe('translate3d(500px,400px,0) scale(1)');
    dropLabel('quiet');
    el.remove();
  });
});
