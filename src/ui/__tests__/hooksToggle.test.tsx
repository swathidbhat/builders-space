// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HookSetupCard } from '../HookSetupCard';

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe('hooks toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    window.__BUILDERS_SPACE_TOKEN__ = 'tok';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.__BUILDERS_SPACE_TOKEN__;
  });

  it('enables, shows a manual snippet, disables, and minimizes', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/enable')) {
        return jsonResponse({
          claude: { status: 'ok' },
          cursor: { status: 'not_installed' },
          codex: { status: 'manual', snippet: 'add this hook' },
        });
      }
      if (String(url).endsWith('/disable')) return jsonResponse({ ok: true });
      return jsonResponse({ claude: 'configured', cursor: 'available', codex: 'not_installed' });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<HookSetupCard />);
    expect(screen.queryByText('Hooks')).toBeNull();
    expect(await screen.findByText('Enable Hooks')).toBeTruthy();
    expect(screen.getByText('Claude Code')).toBeTruthy();
    expect(screen.getByText('Not installed')).toBeTruthy();
    expect(screen.getByText('Configured')).toBeTruthy();

    fireEvent.click(screen.getByText('Enable Hooks'));
    expect(await screen.findByText('Manual step needed')).toBeTruthy();
    fireEvent.click(screen.getByText('Show manual steps'));
    expect(screen.getByText('add this hook')).toBeTruthy();
    fireEvent.click(screen.getByText('Hide manual steps'));
    expect(screen.queryByText('add this hook')).toBeNull();

    fireEvent.click(screen.getByText('Disable'));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/disable'))).toBe(true);
    });

    fireEvent.click(screen.getByTitle('Minimize'));
    expect(localStorage.getItem('space:hooks-minimized')).toBe('1');
    fireEvent.click(screen.getByTitle('Hook settings'));
    expect(localStorage.getItem('space:hooks-minimized')).toBeNull();
    expect(screen.getByText('Hooks')).toBeTruthy();
  });

  it('stays hidden when the status request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    render(<HookSetupCard />);
    await vi.waitFor(() => expect(screen.queryByText('Enable Hooks')).toBeNull());
  });

  it('restores a minimized card', async () => {
    localStorage.setItem('space:hooks-minimized', '1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          claude: 'configured',
          cursor: 'configured',
          codex: 'configured',
        }),
      ),
    );
    render(<HookSetupCard />);
    expect(await screen.findByTitle('Hook settings')).toBeTruthy();
  });
});
