// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatAsOf } from '../attention';
import { BottomDock } from '../BottomDock';
import { HUD } from '../HUD';
import { Sidebar } from '../Sidebar';
import { StatusLegend } from '../StatusLegend';
import { useSpaceStore } from '../../store';
import { testProject } from '../../test/fixtures';

function projectButton(name: string): HTMLElement {
  return within(screen.getByRole('navigation', { name: 'Projects' })).getByRole('button', {
    name: new RegExp(name),
  });
}

function dot(name: string): HTMLElement {
  const mark = projectButton(name).querySelector('span[style*="--dot"]');
  if (!(mark instanceof HTMLElement)) throw new Error(`missing status dot for ${name}`);
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
    alpha.agents[0].currentTask = 'migrate the payments dashboard';
    alpha.agents[0].lastAction = 'Shell:psql -c "select id from charges"';
    alpha.agents[0].pendingQuestion = 'Should I also backfill existing orders?';
    alpha.agents[0].quietForMs = 3 * 60_000;
    const newerError = testProject('mid', [{ id: 'fresh', status: 'error' }]);
    newerError.agents[0].errorReason = 'disk full';
    newerError.agents[0].quietForMs = 60_000;
    useSpaceStore.setState({
      projects: [zeta, alpha, newerError, testProject('quiet', [{ id: 'done', status: 'done' }])],
    });
    render(<Sidebar />);

    const projects = within(screen.getByRole('navigation', { name: 'Projects' }))
      .getAllByRole('button')
      .filter((button) => button.querySelector('[data-project-name]'));
    expect(projects).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: /Zeta/ })).toHaveLength(1);
    expect(projects.map((button) => button.textContent).join('\n')).toMatch(
      /Zeta[\s\S]*signature[\s\S]*quiet for 8 min[\s\S]*Mid[\s\S]*disk full[\s\S]*Alpha[\s\S]*backfill[\s\S]*Quiet/,
    );
    const zetaName = projects[0].querySelector('[data-project-name]');
    const zetaTime = projects[0].querySelector('[data-project-time]');
    expect(zetaName?.parentElement?.contains(zetaTime ?? null)).toBe(false);
    expect(projects[0].querySelector('[data-project-reason]')?.textContent).toMatch(/signature/);
    const alphaReason = projects[2].querySelector('[data-project-reason]');
    expect(alphaReason?.textContent).toMatch(/backfill/);
    expect(alphaReason?.textContent).not.toMatch(/psql|migrate/);
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

  it('keeps Lumen Lab untruncated and in the accessible name', () => {
    const lumen = testProject('lumen-lab', [{ id: 'a', status: 'error' }]);
    lumen.agents[0].errorReason = 'TypeError: Cannot read properties of undefined';
    lumen.agents[0].currentTask = 'verify the stripe webhook signature';
    lumen.agents[0].quietForMs = 5 * 60_000;
    useSpaceStore.setState({ projects: [lumen], sidebarOpen: true });
    render(<Sidebar />);

    const button = projectButton('Lumen Lab');
    expect(button.getAttribute('aria-label')).toMatch(/Error: Lumen Lab/);
    expect(button.getAttribute('title')).toMatch(/Lumen Lab/);
    const name = button.querySelector('[data-project-name]');
    expect(name?.textContent).toBe('Lumen Lab');
    expect(name?.parentElement?.textContent).not.toMatch(/quiet/);
    expect(name?.parentElement?.contains(button.querySelector('[data-project-time]'))).toBe(false);
    expect(button.querySelector('[data-project-reason]')?.textContent).toMatch(/TypeError/);
    expect(button.textContent).toMatch(/quiet for 5 min/);
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
      expect(screen.queryByRole('button', { name: /Lumen/ })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Open projects' }));
      expect(screen.getByRole('button', { name: /Lumen/ })).toBeTruthy();
      expect(useSpaceStore.getState().sidebarOpen).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Close projects' }));
      expect(screen.queryByRole('button', { name: /Lumen/ })).toBeNull();
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
    expect(screen.queryByText('Agents')).toBeNull();
    expect(screen.queryByText('Working')).toBeNull();
    expect(screen.getByText('Needs you')).toBeTruthy();
    expect(screen.getByText('Errors')).toBeTruthy();
    expect(screen.getByText('2 planets discovered')).toBeTruthy();
    expect(document.querySelector('[data-counters]')?.getAttribute('title')).toBe(
      '5 agents · 3 working',
    );
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
    expect(screen.queryByText('Needs you')).toBeNull();
    expect(document.querySelector('[data-counters]')?.getAttribute('title')).toBe(
      '1 agent · 1 working',
    );
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

  it('expands a clamped waiting question without leaving the project row', () => {
    const question =
      'The old charge path still has callers in checkout, including the receipt mailer and the nightly reconciliation job. Should I delete it anyway, or keep it behind a flag until those callers move?';
    const billing = testProject('billing', [{ id: 'ask', status: 'waiting' }]);
    billing.agents[0].currentTask = 'migrate the payments dashboard';
    billing.agents[0].lastAction = 'Shell:psql';
    billing.agents[0].pendingQuestion = question;
    billing.agents[0].quietForMs = 12 * 60_000;
    useSpaceStore.setState({ projects: [billing], sidebarOpen: true });
    render(<Sidebar />);

    const reason = projectButton('Billing').querySelector('[data-project-reason]');
    expect(reason?.textContent).toBe(question);
    expect(reason?.getAttribute('data-expanded')).toBe('false');
    expect(projectButton('Billing').getAttribute('aria-label')).toMatch(/until those callers move/);
    expect(projectButton('Billing').textContent).not.toMatch(/psql|migrate/);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(reason?.getAttribute('data-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(reason?.getAttribute('data-expanded')).toBe('false');
  });

  it('keeps the last count and shows a retry banner when the connection is stale', () => {
    const asOfMs = new Date(2026, 9, 12, 4, 52, 0).getTime();
    const lumen = testProject('lumen', [
      { id: 'a', status: 'waiting' },
      { id: 'b', status: 'error' },
    ]);
    lumen.agents[0].pendingQuestion = 'Should I keep going?';
    lumen.agents[0].lastActivityMs = Date.now();
    lumen.agents[1].errorReason = 'TypeError: stripe';
    lumen.agents[1].lastActivityMs = Date.now() - 5 * 60_000;
    useSpaceStore.setState({
      connection: 'stale',
      dataStale: true,
      snapshotSeen: true,
      lastUpdated: asOfMs,
      projects: [lumen],
    });
    render(
      <>
        <HUD />
        <BottomDock />
        <Sidebar />
      </>,
    );
    expect(
      screen.getByText(`Disconnected — retrying. Statuses ${formatAsOf(asOfMs)}.`),
    ).toBeTruthy();
    expect(
      screen.getByText(`1 planet discovered · last update is stale, ${formatAsOf(asOfMs)}`),
    ).toBeTruthy();
    expect(screen.queryByText(/last activity just now/)).toBeNull();
    expect(projectButton('Lumen').textContent).toMatch(
      new RegExp(`quiet for 5 min · ${formatAsOf(asOfMs)}`),
    );
    const pulses = screen.getAllByText('1').map((node) => node.className);
    expect(pulses.some((className) => className.includes('pulse'))).toBe(false);
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
