// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

const listeners = new Map<string, Handler>();
const emit = vi.fn((event: string, _payload?: unknown, cb?: Handler) => {
  if (event === 'space:humanize' && cb) {
    cb({ texts: { 'Read:App.tsx': 'Reading' }, usedLLM: true });
  }
});
const connect = vi.fn();
const socket = {
  connected: false,
  connect,
  on(event: string, fn: Handler) {
    listeners.set(event, fn);
  },
  off(event: string, fn: Handler) {
    if (listeners.get(event) === fn) listeners.delete(event);
  },
  emit,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socket),
}));

import { requestHumanize, useSocket } from '../useSocket';
import { useSpaceStore } from '../../store';
import { resetTokenRefreshForTests } from '../../refreshLaunchToken';

function Probe() {
  useSocket();
  return null;
}

describe('socket client', () => {
  beforeEach(() => {
    listeners.clear();
    emit.mockClear();
    connect.mockClear();
    socket.connected = false;
    resetTokenRefreshForTests();
    window.__BUILDERS_SPACE_TOKEN__ = 'tok';
    useSpaceStore.setState({
      projects: [],
      lastUpdated: 0,
      connection: 'connecting',
      dataStale: false,
      snapshotSeen: false,
      scanStartedAt: null,
      holdPreviousUntil: 0,
      pendingEmpty: false,
      assistantRejected: false,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('logs and skips translation when the page has no launch token', async () => {
    delete window.__BUILDERS_SPACE_TOKEN__;
    await expect(requestHumanize(['Read:App.tsx'])).resolves.toEqual({
      texts: {},
      usedLLM: false,
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('applies pushed state and asks for a translation when connected', async () => {
    socket.connected = true;
    const view = render(<Probe />);
    expect(emit).toHaveBeenCalledWith('space:request-state');

    listeners.get('connect')?.();
    expect(emit).toHaveBeenCalledWith('space:request-state');
    listeners.get('disconnect')?.();

    listeners.get('space:state')?.({
      lastUpdated: 7,
      projects: [
        {
          id: 'lumen',
          name: 'lumen',
          path: '/tmp/lumen',
          fileCount: 0,
          agents: [{ id: 'a', source: 'cursor', sessionId: 'a', status: 'working' }],
        },
      ],
    });
    expect(useSpaceStore.getState().projects).toHaveLength(1);

    await expect(requestHumanize(['Read:App.tsx'])).resolves.toEqual({
      texts: { 'Read:App.tsx': 'Reading' },
      usedLLM: true,
    });

    view.unmount();
    expect(listeners.has('space:state')).toBe(false);
  });

  it('keeps planets on disconnect and refreshes the launch token after unauthorized', async () => {
    window.__BUILDERS_SPACE_TOKEN__ = 'old-token';
    const html = `<script>window.__BUILDERS_SPACE_TOKEN__=${JSON.stringify('new-token')};</script>`;
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => html }));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const view = render(<Probe />);
      await act(async () => {
        listeners.get('space:state')?.({
          lastUpdated: 1,
          projects: [
            {
              id: 'lumen',
              name: 'lumen',
              path: '/tmp/lumen',
              fileCount: 0,
              agents: [{ id: 'a', source: 'cursor', sessionId: 'a', status: 'working' }],
            },
          ],
        });
      });
      await act(async () => {
        listeners.get('disconnect')?.();
      });
      expect(useSpaceStore.getState().connection).toBe('stale');
      expect(useSpaceStore.getState().projects).toHaveLength(1);

      await act(async () => {
        listeners.get('space:state')?.({ lastUpdated: 2, projects: [] });
      });
      expect(useSpaceStore.getState().projects).toHaveLength(1);

      await act(async () => {
        listeners.get('connect_error')?.({ message: 'Unauthorized' });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fetchMock).toHaveBeenCalled();
      expect(window.__BUILDERS_SPACE_TOKEN__).toBe('new-token');
      expect(connect).toHaveBeenCalled();

      await act(async () => {
        listeners.get('connect')?.();
        listeners.get('space:state')?.({ lastUpdated: 3, projects: [] });
      });
      expect(useSpaceStore.getState().projects).toHaveLength(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12_000);
      });
      expect(useSpaceStore.getState().projects).toHaveLength(0);
      expect(useSpaceStore.getState().connection).toBe('live');
      view.unmount();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
