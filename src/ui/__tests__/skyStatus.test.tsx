// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkyStatus } from '../SkyStatus';
import { SkyLoading } from '../SkyLoading';
import { useSpaceStore } from '../../store';

describe('first-run sky', () => {
  beforeEach(() => {
    useSpaceStore.setState({
      projects: [],
      connection: 'live',
      snapshotSeen: true,
      scanStartedAt: Date.now() - 9_000,
      dataStale: false,
      holdPreviousUntil: 0,
      pendingEmpty: false,
      assistantRejected: false,
    });
  });

  it('explains what is watched and which tools were found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ claude: 'available', cursor: 'not_installed', codex: 'configured' }),
      })),
    );
    render(<SkyStatus />);
    expect(screen.getByRole('region', { name: 'No sessions yet' })).toBeTruthy();
    expect(screen.getByText(/~\/\.claude\/projects/)).toBeTruthy();
    expect(screen.getByText(/~\/\.cursor\/projects/)).toBeTruthy();
    expect(screen.getByText(/~\/\.codex\/sessions/)).toBeTruthy();
    expect(await screen.findByText('Claude Code: found')).toBeTruthy();
    expect(screen.getByText('Cursor: not found')).toBeTruthy();
    expect(screen.getByText('Codex: found')).toBeTruthy();
    expect(screen.getByText(/macOS-only/)).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('stays quiet while planets are on screen', () => {
    useSpaceStore.setState({
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
    const { container } = render(<SkyStatus />);
    expect(container.textContent).toBe('');
  });

  it('shows a visible loading sky instead of an empty black screen', () => {
    render(<SkyLoading />);
    expect(screen.getByRole('status').textContent).toMatch(/Loading the sky/);
  });
});
