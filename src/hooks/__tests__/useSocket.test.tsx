// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

const listeners = new Map<string, Handler>();
const emit = vi.fn((event: string, _payload?: unknown, cb?: Handler) => {
  if (event === 'space:humanize' && cb) {
    cb({ texts: { 'Read:App.tsx': 'Reading' }, usedLLM: true });
  }
});
const socket = {
  connected: false,
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

function Probe() {
  useSocket();
  return null;
}

describe('socket client', () => {
  beforeEach(() => {
    listeners.clear();
    emit.mockClear();
    socket.connected = false;
    window.__BUILDERS_SPACE_TOKEN__ = 'tok';
    useSpaceStore.setState({ projects: [], lastUpdated: 0 });
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
});
