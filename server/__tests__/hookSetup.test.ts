import { spawn } from 'child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIRE_HOOK_SCRIPT_CONTENT,
  STATUS_HOOK_SCRIPT_CONTENT,
  disableHooks,
  enableHooks,
} from '../services/hookSetup';

function runScript(scriptPath: string, input: string, home: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath], {
      env: { HOME: home, PATH: '/usr/bin:/bin' },
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `hook exited ${code}`));
    });
    child.stdin.end(input);
  });
}

describe('hook scripts', () => {
  it('does not use nanoseconds or python3', () => {
    for (const script of [STATUS_HOOK_SCRIPT_CONTENT, FIRE_HOOK_SCRIPT_CONTENT]) {
      expect(script).not.toContain('%N');
      expect(script).not.toMatch(/python/);
      expect(script).toContain('date +%s');
      expect(script).toContain('${RANDOM}');
      expect(script).toContain('umask 077');
    }
  });

  it('writes a unique event file per invocation in the same second', async () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-hook-'));
    const scriptPath = join(home, 'status-hook.sh');
    writeFileSync(scriptPath, STATUS_HOOK_SCRIPT_CONTENT);
    chmodSync(scriptPath, 0o755);

    await Promise.all(
      Array.from({ length: 25 }, (_, i) => runScript(scriptPath, `{"n":${i}}`, home)),
    );

    const eventsDir = join(home, '.builders-space', 'events');
    const files = readdirSync(eventsDir);
    expect(files).toHaveLength(25);
    expect(new Set(files).size).toBe(25);
    for (const file of files) {
      expect(file).toMatch(/^status-\d+-\d+-\d+-\d+\.json$/);
      expect(statSync(join(eventsDir, file)).mode & 0o777).toBe(0o600);
    }
  });

  it('records an error payload without python and ignores a success payload', async () => {
    const home = mkdtempSync(join(tmpdir(), 'bs-hook-'));
    const scriptPath = join(home, 'fire-hook.sh');
    writeFileSync(scriptPath, FIRE_HOOK_SCRIPT_CONTENT);
    chmodSync(scriptPath, 0o755);

    await runScript(scriptPath, '{"status":"completed","reason":"done"}', home);
    await runScript(scriptPath, '{"status":"error","reason":"boom"}', home);

    const eventsDir = join(home, '.builders-space', 'events');
    const files = readdirSync(eventsDir);
    expect(files).toHaveLength(1);
    expect(files[0].startsWith('fire-')).toBe(true);
    expect(readFileSync(join(eventsDir, files[0]), 'utf-8')).toContain('"status":"error"');
  });
});

describe('hook install is opt-in and reversible', () => {
  let home: string;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not write global configs until enable, and disable removes files it created', () => {
    home = mkdtempSync(join(tmpdir(), 'bs-home-'));
    vi.stubEnv('HOME', home);
    for (const dir of ['.claude', '.cursor', '.codex']) {
      mkdirSync(join(home, dir));
    }
    const project = join(home, 'my-app');
    mkdirSync(project);

    expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(false);
    expect(existsSync(join(project, '.codex', 'hooks.json'))).toBe(false);

    const enabled = enableHooks();
    expect(enabled.claude.status).toBe('ok');
    expect(enabled.cursor.status).toBe('ok');
    expect(enabled.codex.status).toBe('ok');
    expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf-8')).toContain('status-hook.sh');
    expect(readFileSync(join(home, '.codex', 'hooks.json'), 'utf-8')).toContain('status-hook.sh');
    expect(existsSync(join(project, '.codex', 'hooks.json'))).toBe(false);

    const disabled = disableHooks();
    expect(disabled.claude).toBe('removed');
    expect(disabled.cursor).toBe('removed');
    expect(disabled.codex).toBe('removed');
    expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(false);
    expect(existsSync(join(home, '.cursor', 'hooks.json'))).toBe(false);
    expect(existsSync(join(home, '.codex', 'hooks.json'))).toBe(false);
    expect(existsSync(join(home, '.codex', 'config.toml'))).toBe(false);
    expect(existsSync(join(home, '.builders-space', 'hooks', 'status-hook.sh'))).toBe(false);
  });

  it('keeps pre-existing settings and removes only the hooks it added', () => {
    home = mkdtempSync(join(tmpdir(), 'bs-home-'));
    vi.stubEnv('HOME', home);
    mkdirSync(join(home, '.claude'));
    const settings = join(home, '.claude', 'settings.json');
    writeFileSync(settings, JSON.stringify({ theme: 'dark' }) + '\n');
    mkdirSync(join(home, '.codex'));
    const config = join(home, '.codex', 'config.toml');
    writeFileSync(config, 'model = "gpt-5"\n');

    enableHooks();
    expect(readFileSync(settings, 'utf-8')).toContain('status-hook.sh');
    expect(readFileSync(config, 'utf-8')).toContain('codex_hooks = true');

    disableHooks();
    const restored = JSON.parse(readFileSync(settings, 'utf-8'));
    expect(restored.theme).toBe('dark');
    expect(restored.hooks).toBeUndefined();
    const toml = readFileSync(config, 'utf-8');
    expect(toml).toContain('model = "gpt-5"');
    expect(toml).not.toContain('codex_hooks');
  });
});
