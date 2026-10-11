import { chmodSync, mkdtempSync, readFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authTokenPath, createLaunchToken, publishLaunchToken } from '../security';

describe('launch token file', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('writes a private token under the home directory', () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-token-'));
    vi.stubEnv('HOME', home);
    const token = createLaunchToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    publishLaunchToken(token);
    expect(authTokenPath()).toBe(join(home, '.builders-space', 'auth-token'));
    expect(readFileSync(authTokenPath(), 'utf8')).toBe(`${token}\n`);
    expect(statSync(authTokenPath()).mode & 0o777).toBe(0o600);
    expect(statSync(join(home, '.builders-space')).mode & 0o777).toBe(0o700);

    chmodSync(join(home, '.builders-space'), 0o755);
    publishLaunchToken(token);
    expect(statSync(join(home, '.builders-space')).mode & 0o777).toBe(0o700);
  });
});
