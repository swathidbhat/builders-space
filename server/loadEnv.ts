import { existsSync } from 'fs';
import dotenv from 'dotenv';
import { usableAnthropicKey } from './anthropicKey';

/**
 * Load one env file. A missing file is skipped: dotenv would otherwise log
 * "injected env (0) from .env" for a path that is not there.
 */
export function loadEnvFile(path: string, override = false): boolean {
  if (!existsSync(path)) return false;
  const result = dotenv.config({ path, override, quiet: true });
  return !result.error;
}

export function loadLocalEnv(paths: { env?: string; local?: string } = {}): void {
  loadEnvFile(paths.env ?? '.env');
  loadEnvFile(paths.local ?? '.env.local', true);
  if (!usableAnthropicKey()) delete process.env.ANTHROPIC_API_KEY;
}
