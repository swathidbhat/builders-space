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

  it('enables, shows a manual snippet, and disables', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/enable')) {
        return jsonResponse({
          claude: {
            status: 'ok',
            changedFiles: ['/tmp/home/.claude/settings.json'],
            restartRequired: true,
          },
          cursor: { status: 'not_installed' },
          codex: { status: 'manual', snippet: 'add this hook' },
          changedFiles: [
            '/tmp/home/.claude/settings.json',
            '/tmp/home/.builders-space/hooks/status-hook.sh',
          ],
          restartRequired: true,
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
    expect(screen.getByText('Files changed')).toBeTruthy();
    expect(screen.getByText('/tmp/home/.claude/settings.json')).toBeTruthy();
    expect(screen.getByText(/Restart Claude Code, Cursor, and Codex/)).toBeTruthy();
    fireEvent.click(screen.getByText('Show manual steps'));
    expect(screen.getByText('add this hook')).toBeTruthy();
    fireEvent.click(screen.getByText('Hide manual steps'));
    expect(screen.queryByText('add this hook')).toBeNull();

    fireEvent.click(screen.getByText('Disable'));
    expect(screen.getByText(/Remove Builders Space hooks/)).toBeTruthy();
    fireEvent.click(screen.getByText('Remove hooks'));
    expect(await screen.findByText(/Hooks removed/)).toBeTruthy();
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/disable'))).toBe(true);
    });
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
});
