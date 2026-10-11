import { randomBytes, timingSafeEqual } from 'crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/** Browser origins that may call the API: the local dashboard only. */
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function createLaunchToken(): string {
  return randomBytes(32).toString('hex');
}

export function isLoopbackOrigin(origin: string): boolean {
  return LOOPBACK_ORIGIN.test(origin);
}

export function tokensMatch(presented: string, expected: string): boolean {
  const actual = Buffer.from(presented);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) {
    timingSafeEqual(wanted, wanted);
    return false;
  }
  return timingSafeEqual(actual, wanted);
}

export function authTokenPath(): string {
  return join(homedir(), '.builders-space', 'auth-token');
}

/** Mode 0600 so only the local user can read the per-launch token. */
export function publishLaunchToken(token: string): void {
  const dir = join(homedir(), '.builders-space');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const file = authTokenPath();
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function bearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith('Bearer ')) return '';
  return authorization.slice('Bearer '.length);
}
