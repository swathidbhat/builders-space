// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentCard } from '../AgentCard';
import { useSpaceStore } from '../../store';
import { testAgent, testIdentity } from '../../test/fixtures';

describe('agent cards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSpaceStore.setState({ humanizedTexts: { 'Read:App.tsx': 'Reading the app' } });
    window.__BUILDERS_SPACE_TOKEN__ = 'tok';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete window.__BUILDERS_SPACE_TOKEN__;
  });

  it('shows status, source, and human lingo text', () => {
    const { rerender } = render(
      <AgentCard
        agent={testAgent({
          id: 'a',
          status: 'working',
          source: 'cursor',
          title: 'HUD pass',
          sessionMeta: { projectPath: '/tmp/lumen' },
        })}
        identity={testIdentity('Nova')}
        humanLingo
      />,
    );
    expect(screen.getByText('Nova')).toBeTruthy();
    expect(screen.getByText('Cursor')).toBeTruthy();
    expect(screen.getByText('Working')).toBeTruthy();
    expect(screen.getByText('HUD pass')).toBeTruthy();
    expect(screen.getByText('Reading the app')).toBeTruthy();

    rerender(
      <AgentCard
        agent={testAgent({
          id: 'b',
          status: 'error',
          source: 'codex',
          errorReason: 'Shell:npm test',
          lastAction: 'Shell:npm test',
        })}
        identity={testIdentity('Atlas')}
        humanLingo={false}
      />,
    );
    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('Shell:npm test')).toBeTruthy();

    useSpaceStore.setState({
      humanizedTexts: {
        'Read:App.tsx': 'Reading the app',
        'Shell:npm test': 'Running tests',
      },
    });
    rerender(
      <AgentCard
        agent={testAgent({
          id: 'b',
          status: 'error',
          source: 'codex',
          errorReason: 'Shell:npm test',
          lastAction: 'Shell:npm test',
        })}
        identity={testIdentity('Atlas')}
        humanLingo
      />,
    );
    expect(screen.getByText('Running tests')).toBeTruthy();

    rerender(
      <AgentCard
        agent={testAgent({ id: 'c', status: 'waiting', lastAction: undefined })}
        identity={testIdentity()}
        humanLingo
      />,
    );
    expect(screen.getByText('Needs you')).toBeTruthy();

    rerender(
      <AgentCard
        agent={testAgent({ id: 'd', status: 'done', lastAction: 'Edit:App.tsx' })}
        identity={testIdentity()}
        humanLingo={false}
      />,
    );
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Edit:App.tsx')).toBeTruthy();
  });

  it('opens a session and reports what the server did', async () => {
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AgentCard
        agent={testAgent({
          id: 'cursor-1',
          status: 'working',
          source: 'cursor',
          sessionMeta: { projectPath: '/tmp/lumen' },
        })}
        identity={testIdentity()}
        humanLingo={false}
      />,
    );
    fireEvent.click(screen.getByText('Nova'));
    await vi.waitFor(() => {
      expect(screen.getByText(/Opened in Cursor/)).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3002/api/open-session',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.queryByText(/Opened in Cursor/)).toBeNull();
  });

  it('distinguishes resume, directory open, failure, and a down server', async () => {
    const responses = [
      { ok: true, resumed: true },
      { ok: true },
      { ok: false, error: 'Opening sessions is only supported on macOS' },
    ];
    const fetchMock = vi.fn(async () => ({
      json: async () => responses.shift(),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const agent = testAgent({
      id: 'claude-1',
      status: 'waiting',
      sessionMeta: { projectPath: '/tmp/lumen', sessionId: 's' },
    });
    const { rerender } = render(
      <AgentCard agent={agent} identity={testIdentity('Lyra')} humanLingo={false} />,
    );
    fireEvent.click(screen.getByText('Lyra'));
    await vi.waitFor(() => expect(screen.getByText('Resuming session in Terminal')).toBeTruthy());

    rerender(<AgentCard agent={agent} identity={testIdentity('Lyra')} humanLingo={false} />);
    fireEvent.click(screen.getByText('Lyra'));
    await vi.waitFor(() =>
      expect(screen.getByText('Opened project directory in Terminal')).toBeTruthy(),
    );

    rerender(<AgentCard agent={agent} identity={testIdentity('Lyra')} humanLingo={false} />);
    fireEvent.click(screen.getByText('Lyra'));
    await vi.waitFor(() =>
      expect(screen.getByText('Opening sessions is only supported on macOS')).toBeTruthy(),
    );
    expect(screen.queryByText(/spawn/)).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    rerender(<AgentCard agent={agent} identity={testIdentity('Lyra')} humanLingo={false} />);
    fireEvent.click(screen.getByText('Lyra'));
    await vi.waitFor(() => expect(screen.getByText('Could not connect to server')).toBeTruthy());
  });

  it('does not call the server when the agent has no session', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(
      <AgentCard
        agent={testAgent({ id: 'x', status: 'done' })}
        identity={testIdentity()}
        humanLingo={false}
      />,
    );
    fireEvent.mouseEnter(container.firstChild as Element);
    fireEvent.mouseLeave(container.firstChild as Element);
    fireEvent.click(screen.getByText('Nova'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
