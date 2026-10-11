// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectPanel } from '../ProjectPanel';
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
    expect(screen.getByRole('heading', { name: 'lumen-lab' })).toBeTruthy();
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

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'ESC' }));
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'ESC' }));
    fireEvent.click(screen.getByRole('button', { name: 'ESC' }));
    expect(useSpaceStore.getState().selectedPlanetId).toBeNull();
  });

  it('renders nothing until a project is selected', () => {
    const { container } = render(<ProjectPanel />);
    expect(container.textContent).toBe('');
  });
});
