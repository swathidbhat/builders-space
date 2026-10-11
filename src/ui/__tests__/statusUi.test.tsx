// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HUD } from '../HUD';
import { Sidebar } from '../Sidebar';
import { useSpaceStore } from '../../store';
import { testProject } from '../../test/fixtures';

function dot(name: string): HTMLElement {
  const button = screen.getByRole('button', { name: new RegExp(name) });
  const mark = button.querySelector('span');
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

  it('colors the sidebar by the highest-priority agent and toggles selection', () => {
    useSpaceStore.setState({
      projects: [
        testProject('zeta', [
          { id: 'w', status: 'working' },
          { id: 'e', status: 'error' },
        ]),
        testProject('alpha', [{ id: 'wait', status: 'waiting' }]),
        testProject('mid', [{ id: 'work', status: 'working' }]),
        testProject('quiet', [{ id: 'done', status: 'done' }]),
      ],
    });
    render(<Sidebar />);

    const names = screen.getAllByRole('button').map((button) => button.textContent);
    expect(names.join(' ')).toMatch(/Alpha[\s\S]*Mid[\s\S]*Quiet[\s\S]*Zeta/);
    expect(dot('Zeta').style.getPropertyValue('--dot')).toMatch(/ff4444/i);
    expect(dot('Alpha').style.getPropertyValue('--dot')).toMatch(/ffaa44/i);
    expect(dot('Mid').style.getPropertyValue('--dot')).toMatch(/44ffaa/i);
    expect(dot('Quiet').style.getPropertyValue('--dot')).toMatch(/6688aa/i);

    fireEvent.click(screen.getByRole('button', { name: /Zeta/ }));
    expect(useSpaceStore.getState().selectedPlanetId).toBe('zeta');
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.mouseLeave(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: /Zeta/ }));
    expect(useSpaceStore.getState().selectedPlanetId).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(useSpaceStore.getState().sidebarOpen).toBe(false);
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
    fireEvent.click(screen.getByRole('button', { name: '☰' }));
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
