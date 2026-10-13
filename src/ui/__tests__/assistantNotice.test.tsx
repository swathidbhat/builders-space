// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantNotice } from '../AssistantNotice';
import { useProjectHumanize } from '../useProjectHumanize';
import { useSpaceStore } from '../../store';
import { testProject } from '../../test/fixtures';

const requestHumanize = vi.fn(async () => ({
  texts: { 'Read:a.ts': 'Reading a file' },
  usedLLM: false,
  error: 'Anthropic rejected the API key.',
}));

vi.mock('../../hooks/useSocket', () => ({
  requestHumanize: () => requestHumanize(),
  useSocket: () => undefined,
}));

function HumanizeProbe() {
  const project = useSpaceStore((s) => s.projects[0]);
  useProjectHumanize(project, true);
  return null;
}

describe('assistant key notice', () => {
  beforeEach(() => {
    localStorage.clear();
    requestHumanize.mockClear();
    useSpaceStore.setState({
      projects: [],
      connection: 'live',
      assistantRejected: false,
      humanLingo: true,
      humanizedTexts: {},
      snapshotSeen: true,
    });
  });

  it('shows a missing-key notice once, then a rejection if the key is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: 'ok', assistant: 'missing' }),
      })),
    );
    const view = render(<AssistantNotice />);
    expect(await screen.findByText(/Add an Anthropic key/)).toBeTruthy();
    expect(screen.getByText(/original text/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Add an Anthropic key/)).toBeNull();
    expect(localStorage.getItem('builders-space:assistant-notice')).toBe('missing');

    view.rerender(<AssistantNotice />);
    expect(screen.queryByText(/Add an Anthropic key/)).toBeNull();

    useSpaceStore.setState({ assistantRejected: true });
    view.rerender(<AssistantNotice />);
    expect(await screen.findByText(/key was rejected/)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('marks the key rejected when Human Lingo hears a 401', async () => {
    const project = testProject('lumen', [{ id: 'a', status: 'working' }]);
    project.agents[0].lastAction = 'Read:a.ts';
    useSpaceStore.setState({ projects: [project], selectedPlanetId: 'lumen' });
    render(<HumanizeProbe />);
    await vi.waitFor(() => expect(useSpaceStore.getState().assistantRejected).toBe(true));
  });
});
