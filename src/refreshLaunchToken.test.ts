// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  refreshLaunchToken,
  resetTokenRefreshForTests,
  scheduleTokenRefresh,
} from './refreshLaunchToken';

describe('scheduleTokenRefresh', () => {
  afterEach(() => {
    resetTokenRefreshForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete window.__BUILDERS_SPACE_TOKEN__;
  });

  it('retries with backoff when the dashboard cannot be read, then reconnects', async () => {
    vi.useFakeTimers();
    window.__BUILDERS_SPACE_TOKEN__ = 'stale';
    const html = `<script>window.__BUILDERS_SPACE_TOKEN__=${JSON.stringify('fresh')};</script>`;
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, text: async () => html });
    vi.stubGlobal('fetch', fetchMock);
    const socket = { connected: false, connect: vi.fn() };

    scheduleTokenRefresh(socket);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(socket.connect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(window.__BUILDERS_SPACE_TOKEN__).toBe('fresh');
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('leaves a connected socket alone when the token did not change', async () => {
    window.__BUILDERS_SPACE_TOKEN__ = 'same';
    const html = `<script>window.__BUILDERS_SPACE_TOKEN__=${JSON.stringify('same')};</script>`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => html })),
    );
    const socket = { connected: true, connect: vi.fn() };
    await expect(refreshLaunchToken(socket)).resolves.toBe(false);
    expect(socket.connect).not.toHaveBeenCalled();
  });
});
