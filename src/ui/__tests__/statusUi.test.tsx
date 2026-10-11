// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HUD } from '../HUD';
import { Sidebar } from '../Sidebar';
import { StatusLegend } from '../StatusLegend';
import { useSpaceStore } from '../../store';
import { testProject } from '../../test/fixtures';

function projectButton(name: string): HTMLElement {
  return within(screen.getByRole('region', { name: 'All projects' })).getByRole('button', {
    name: new RegExp(name),
  });
}

function dot(name: string): HTMLElement {
  const mark = projectButton(name).querySelector('span');
  if (!mark) throw new Error(`missing status dot for ${name}`);
  return mark;
}

describe('status display', () => {
  beforeEach(() => {
    useSpaceStore.setState({
      projects: [],
      selectedPlanetId: null,
      cameraMode: 'space',
      sidebarOpen: true,
      humanLingo: true,
      humanizedTexts: {},
      lastUpdated: 0,
      connection: 'connecting',
      dataStale: false,
      snapshotSeen: false,
      scanStartedAt: null,
      holdPreviousUntil: 0,
      pendingEmpty: false,
      assistantRejected: false,
    });
  });

  it('leads with needs-you, then projects by urgency', () => {
    const zeta = testProject('zeta', [
      { id: 'w', status: 'working' },
      { id: 'e', status: 'error' },
    ]);
    zeta.agents[1].errorReason =
      'TypeError: Cannot read properties of undefined (reading "signature")';
    zeta.agents[1].currentTask = 'verify the stripe webhook signature';
    zeta.agents[1].quietForMs = 8 * 60_000;
    const alpha = testProject('alpha', [{ id: 'wait', status: 'waiting' }]);
    alpha.agents[0].currentTask = 'Should I also backfill existing orders?';
    alpha.agents[0].lastAction = 'Should I also backfill existing orders?';
    alpha.agents[0].quietForMs = 3 * 60_000;
    const newerError = testProject('mid', [{ id: 'fresh', status: 'error' }]);
    newerError.agents[0].errorReason = 'disk full';
    newerError.agents[0].quietForMs = 60_000;
    useSpaceStore.setState({
      projects: [zeta, alpha, newerError, testProject('quiet', [{ id: 'done', status: 'done' }])],
    });
    render(<Sidebar />);

    const needs = within(screen.getByRole('region', { name: 'Needs you' })).getAllByRole('button');
    expect(needs.map((button) => button.textContent).join('\n')).toMatch(
      /Zeta[\s\S]*quiet for 8 min[\s\S]*signature[\s\S]*Mid[\s\S]*disk full[\s\S]*Alpha[\s\S]*backfill/,
    );

    const projects = within(screen.getByRole('region', { name: 'All projects' })).getAllByRole(
      'button',
    );
    expect(projects.map((button) => button.textContent).join(' ')).toMatch(
      /Mid[\s\S]*Zeta[\s\S]*Alpha[\s\S]*Quiet/,
    );
    expect(dot('Zeta').style.getPropertyValue('--dot')).toMatch(/ff4444/i);
    expect(dot('Alpha').style.getPropertyValue('--dot')).toMatch(/ffaa44/i);
    expect(dot('Mid').style.getPropertyValue('--dot')).toMatch(/ff4444/i);
    expect(dot('Quiet').style.getPropertyValue('--dot')).toMatch(/6688aa/i);

    fireEvent.click(projectButton('Zeta'));
    expect(useSpaceStore.getState().selectedPlanetId).toBe('zeta');
    fireEvent.mouseEnter(projectButton('Alpha'));
    fireEvent.mouseLeave(projectButton('Alpha'));
    fireEvent.click(projectButton('Zeta'));
    expect(useSpaceStore.getState().selectedPlanetId).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close projects' }));
    expect(useSpaceStore.getState().sidebarOpen).toBe(false);
  });

  it('keeps a narrow sidebar collapsed until its toggle is used', () => {
    const listeners = new Set<() => void>();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (_type: string, listener: EventListener) => {
        listeners.add(listener as () => void);
      },
      removeEventListener: (_type: string, listener: EventListener) => {
        listeners.delete(listener as () => void);
      },
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      useSpaceStore.setState({
        sidebarOpen: true,
        projects: [testProject('lumen', [{ id: 'a', status: 'working' }])],
      });
      render(<Sidebar />);
      expect(screen.queryByRole('region', { name: 'All projects' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Open projects' }));
      expect(screen.getByRole('region', { name: 'All projects' })).toBeTruthy();
      expect(useSpaceStore.getState().sidebarOpen).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Close projects' }));
      expect(screen.queryByRole('region', { name: 'All projects' })).toBeNull();
    } finally {
      if (original) window.matchMedia = original;
      else delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
    }
  });

  it('shows a collapsed sidebar and an empty-project dot', () => {
    useSpaceStore.setState({
      sidebarOpen: false,
      projects: [
        {
          id: 'bare',
          name: 'bare',
          path: '/tmp/bare',
          fileCount: 0,
          agents: [],
        },
      ],
    });
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Open projects' }));
    expect(useSpaceStore.getState().sidebarOpen).toBe(true);
    expect(dot('Bare').style.getPropertyValue('--dot')).toBe('#444');
  });

  it('counts agents in the HUD and pulses only the urgent counters', () => {
    useSpaceStore.setState({
      projects: [
        testProject('one', [
          { id: 'a', status: 'working' },
          { id: 'b', status: 'working' },
          { id: 'c', status: 'working' },
        ]),
        testProject('two', [
          { id: 'd', status: 'error' },
          { id: 'e', status: 'waiting' },
        ]),
      ],
      sidebarOpen: true,
      selectedPlanetId: 'one',
    });
    const { rerender } = render(<HUD />);
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Awaiting you')).toBeTruthy();
    expect(screen.getByText('Errors')).toBeTruthy();
    expect(screen.getByText('2 planets discovered')).toBeTruthy();
    const pulses = screen.getAllByText('1').map((node) => node.className);
    expect(pulses.every((className) => className.includes('pulse'))).toBe(true);

    useSpaceStore.setState({
      projects: [testProject('solo', [{ id: 'a', status: 'working' }])],
      selectedPlanetId: null,
      sidebarOpen: false,
    });
    rerender(<HUD />);
    expect(screen.getByText('1 planet discovered')).toBeTruthy();
    expect(screen.queryByText('Errors')).toBeNull();
    expect(screen.queryByText('Awaiting you')).toBeNull();
  });

  it('explains ring and dot colors', () => {
    render(<StatusLegend />);
    expect(screen.getByRole('complementary', { name: 'Status legend' }).textContent).toMatch(
      /Error[\s\S]*Needs you[\s\S]*Working[\s\S]*Done[\s\S]*Rings pulse/,
    );
  });

  it('shows a loading line until the first snapshot arrives', () => {
    render(<HUD />);
    expect(screen.getByText('Loading the sky…')).toBeTruthy();
    expect(screen.queryByText('Scanning for planets...')).toBeNull();
  });

  it('keeps the last count and shows a retry banner when the connection is stale', () => {
    useSpaceStore.setState({
      connection: 'stale',
      dataStale: true,
      snapshotSeen: true,
      projects: [testProject('lumen', [{ id: 'a', status: 'working' }])],
    });
    render(<HUD />);
    expect(screen.getByText('Disconnected — retrying')).toBeTruthy();
    expect(screen.getByText('1 planet discovered · last update is stale')).toBeTruthy();
  });

  it('replaces the search line after the empty timeout', async () => {
    vi.useFakeTimers();
    try {
      const started = Date.now();
      useSpaceStore.setState({
        connection: 'live',
        snapshotSeen: true,
        scanStartedAt: started,
        projects: [],
      });
      render(<HUD />);
      expect(screen.getByText('Looking for sessions…')).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8_000);
      });
      expect(screen.getByText('No sessions yet')).toBeTruthy();
      expect(screen.queryByText('Scanning for planets...')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
