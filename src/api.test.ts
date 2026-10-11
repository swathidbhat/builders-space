import { afterEach, describe, expect, it } from 'vitest';
import { authHeaders, authToken } from './api';

describe('auth helpers', () => {
  afterEach(() => {
    if (typeof window !== 'undefined') delete window.__BUILDERS_SPACE_TOKEN__;
  });

  it('returns an empty bearer token when the page did not inject one', () => {
    expect(typeof window).toBe('undefined');
    expect(authToken()).toBe('');
    expect(authHeaders({ 'Content-Type': 'application/json' })).toEqual({
      Authorization: 'Bearer ',
      'Content-Type': 'application/json',
    });
  });
});
