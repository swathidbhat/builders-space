// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectPanel } from '../ProjectPanel';
import { Sidebar } from '../Sidebar';
import { useSpaceStore } from '../../store';
import { testProject } from '../../test/fixtures';
import { flushFrames, installAnimationFrame, installCanvasStub } from '../../test/canvas';

const requestHumanize = vi.fn(async (texts: string[]) => ({
  texts: Object.fromEntries(texts.map((text) => [text, `plain:${text}`])),
  usedLLM: false,
}));

vi.mock('../../hooks/useSocket', () => ({
  requestHumanize: (texts: string[]) => requestHumanize(texts),
  useSocket: () => undefined,
}));

function withCompact(run: () => void) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  try {
    run();
  } finally {
    if (original) window.matchMedia = original;
    else delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia;
  }
}

describe('project panel', () => {
  beforeEach(() => {
    installCanvasStub();
    installAnimationFrame();
    requestHumanize.mockClear();
    useSpaceStore.setState({
      projects: [],
      selectedPlanetId: null,
      humanLingo: true,
      humanizedTexts: {},
      sidebarOpen: true,
      cameraMode: 'space',
      lastUpdated: 0,
    });
  });

  it('sorts agents, requests human lingo, and can show the raw text', async () => {
    const project = testProject('lumen-lab', [
      { id: 'done', status: 'done', source: 'cursor' },
      { id: 'work', status: 'working', source: 'claude-code' },
      { id: 'wait', status: 'waiting', source: 'codex' },
      { id: 'err', status: 'error', source: 'cursor' },
    ]);
    project.agents = project.agents.map((agent) => ({
      ...agent,
      lastAction: `${agent.id} action`,
      errorReason: agent.status === 'error' ? 'boom' : undefined,
    }));
    useSpaceStore.setState({ projects: [project], selectedPlanetId: 'lumen-lab' });

    render(<ProjectPanel />);
    flushFrames(8);
    expect(document.activeElement).toBe(
      screen.getByRole('complementary', { name: 'Project details' }),
    );
    expect(
      screen.getByRole('heading', { name: /Lumen Lab\. 4 agents, 1 working, 1 error, 1 waiting/ }),
    ).toBeTruthy();
    expect(screen.queryByText('Errors', { exact: true })).toBeNull();
    expect(screen.queryByText('Waiting', { exact: true, selector: 'div' })).toBeNull();
    const labels = screen
      .getAllByText((_content, element) => {
        const text = element?.textContent ?? '';
        return (
          element?.tagName === 'SPAN' &&
          (text === 'Error' || text === 'Needs you' || text === 'Working' || text === 'Done')
        );
      })
      .map((node) => node.textContent);
    expect(labels).toEqual(['Error', 'Needs you', 'Working', 'Done']);

    await vi.waitFor(() => expect(requestHumanize).toHaveBeenCalled());
    expect(await screen.findByText('plain:boom')).toBeTruthy();

    fireEvent.click(screen.getByText('Raw'));
    expect(useSpaceStore.getState().humanLingo).toBe(false);
    expect(screen.getByText('done action')).toBeTruthy();

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Close project details' }));
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Close project details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close project details' }));
    expect(useSpaceStore.getState().selectedPlanetId).toBeNull();
  });

  it('says when the folder is no longer on disk', () => {
    const project = testProject('side-quest', [{ id: 'a', status: 'waiting', source: 'cursor' }]);
    project.path = '/tmp-bsqa2-home-Projects-side-quest-tracker';
    useSpaceStore.setState({ projects: [project], selectedPlanetId: project.id });
    render(<ProjectPanel />);
    expect(screen.getByText('Folder no longer on disk')).toBeTruthy();
  });

  it('puts the waiting question before the pixel surface', () => {
    const project = testProject('billing', [
      { id: 'wait', status: 'waiting', source: 'claude-code' },
    ]);
    project.agents[0].pendingQuestion = 'Should I keep the flag until checkout moves?';
    useSpaceStore.setState({ projects: [project], selectedPlanetId: project.id });
    render(<ProjectPanel />);
    const question = screen.getByText('Should I keep the flag until checkout moves?');
    const surface = document.querySelector('[data-pixel-surface]');
    expect(surface).toBeTruthy();
    expect(
      question.compareDocumentPosition(surface as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('on a narrow window, choosing a project closes the list and Back returns to it', () => {
    withCompact(() => {
      const project = testProject('lumen', [{ id: 'a', status: 'waiting' }]);
      useSpaceStore.setState({ projects: [project], sidebarOpen: true, selectedPlanetId: null });
      render(
        <>
          <Sidebar />
          <ProjectPanel />
        </>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Open projects' }));
      fireEvent.click(screen.getByRole('button', { name: /Lumen/ }));
      expect(useSpaceStore.getState().selectedPlanetId).toBe('lumen');
      expect(screen.queryByRole('button', { name: 'Open projects' })).toBeNull();
      expect(screen.queryByRole('navigation', { name: 'Projects' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
      const row = screen.getByRole('button', { name: /Lumen/ });
      expect(row.getAttribute('data-project-id')).toBe('lumen');
      expect(document.activeElement).toBe(row);
    });
  });

  it('on a narrow window, closing a sky selection stays on the sky', () => {
    withCompact(() => {
      const project = testProject('lumen', [{ id: 'a', status: 'waiting' }]);
      useSpaceStore.setState({ projects: [project], sidebarOpen: true, selectedPlanetId: null });
      render(
        <>
          <Sidebar />
          <ProjectPanel />
        </>,
      );
      act(() => {
        useSpaceStore.getState().selectPlanet('lumen');
      });
      expect(screen.queryByRole('navigation', { name: 'Projects' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
      const open = screen.getByRole('button', { name: 'Open projects' });
      expect(document.activeElement).toBe(open);
      expect(screen.queryByRole('button', { name: /Lumen/ })).toBeNull();
    });
  });

  it('renders nothing until a project is selected', () => {
    const { container } = render(<ProjectPanel />);
    expect(container.textContent).toBe('');
  });
});
