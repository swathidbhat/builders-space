import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnvFile, loadLocalEnv } from '../loadEnv';

describe('loadLocalEnv', () => {
  const previous = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previous;
    vi.restoreAllMocks();
  });

  it('does not log when the env file is missing', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const missing = join(mkdtempSync(join(tmpdir(), 'bs-env-')), '.env');
    expect(loadEnvFile(missing)).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it('loads a real key quietly and drops the example placeholder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bs-env-'));
    const envPath = join(dir, '.env');
    const localPath = join(dir, '.env.local');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.ANTHROPIC_API_KEY;

    writeFileSync(envPath, 'ANTHROPIC_API_KEY=sk-ant-test-key-0123456789abcdef\n');
    loadLocalEnv({ env: envPath, local: localPath });
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-test-key-0123456789abcdef');
    expect(log).not.toHaveBeenCalled();

    writeFileSync(envPath, 'ANTHROPIC_API_KEY=your-api-key-here\n');
    delete process.env.ANTHROPIC_API_KEY;
    loadLocalEnv({ env: envPath, local: localPath });
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });
});
