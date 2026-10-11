import { describe, expect, it } from 'vitest';
import { backoffMs, parseLaunchToken } from './launchToken';

describe('launch token refresh helpers', () => {
  it('reads the token the dev server injects', () => {
    const html = `<head><script>window.__BUILDERS_SPACE_TOKEN__=${JSON.stringify('abc-123')};</script></head>`;
    expect(parseLaunchToken(html)).toBe('abc-123');
    expect(parseLaunchToken('<html></html>')).toBeNull();
    expect(parseLaunchToken('window.__BUILDERS_SPACE_TOKEN__=""')).toBeNull();
  });

  it('backs off from one second up to eight', () => {
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(3)).toBe(8000);
    expect(backoffMs(6)).toBe(8000);
  });
});
