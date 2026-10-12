// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSpaceStore } from '../../store';
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
    vi.unstubAllGlobals();
    useSpaceStore.setState({ connection: 'connecting', assistantRejected: false });
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

  it('tucks the key note and the legend into menus', async () => {
    localStorage.clear();
    useSpaceStore.setState({ connection: 'live', assistantRejected: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ assistant: 'missing' }),
      })),
    );
    render(<BottomDock />);
    expect(screen.queryByText(/No Anthropic API key/)).toBeNull();
    const settings = await screen.findByRole('button', { name: 'Settings, needs attention' });
    expect(settings.getAttribute('data-attention')).toBe('true');
    fireEvent.click(settings);
    expect(await screen.findByText(/No Anthropic API key is set/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Status help' }));
    expect(screen.getByRole('complementary', { name: 'Status legend' }).textContent).toMatch(
      /Rings pulse/,
    );
    expect(screen.queryByText(/No Anthropic API key/)).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Status legend' })).toBeNull();
  });
});
