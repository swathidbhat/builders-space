// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomDock } from '../BottomDock';

function box(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

describe('bottom dock', () => {
  afterEach(() => {
    document.getElementById('projects-nav')?.remove();
    document.querySelector('aside[aria-label="Project details"]')?.remove();
    vi.restoreAllMocks();
  });

  it('clears an open project list and a bottom sheet', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    const nav = document.createElement('nav');
    nav.id = 'projects-nav';
    document.body.appendChild(nav);
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(box(0, 104, 248, 900));
    const panel = document.createElement('aside');
    panel.setAttribute('aria-label', 'Project details');
    document.body.appendChild(panel);
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(box(0, 240, 800, 900));

    render(<BottomDock />);
    const dock = document.querySelector('[data-bottom-dock]');
    expect(dock).toBeTruthy();
    expect((dock as HTMLElement).style.left).toBe('260px');
    expect((dock as HTMLElement).style.bottom).toBe('672px');
  });
});
