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
  getHookStatus,
} from '../services/hookSetup';

function runScript(scriptPath: string, input: string, home: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath], {
      env: { HOME: home, PATH: '/usr/bin:/bin' },
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
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
    expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf-8')).toContain(
      'status-hook.sh',
    );
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

describe('hook status and per-tool install', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function homeWith(...dirs: string[]): string {
    const home = mkdtempSync(join(tmpdir(), 'bs-home-'));
    vi.stubEnv('HOME', home);
    for (const dir of dirs) mkdirSync(join(home, dir));
    return home;
  }

  it('reports not_installed until a tool directory exists, then available', () => {
    const home = homeWith();
    expect(getHookStatus()).toEqual({
      claude: 'not_installed',
      cursor: 'not_installed',
      codex: 'not_installed',
    });

    mkdirSync(join(home, '.claude'));
    expect(getHookStatus().claude).toBe('available');
  });

  it('enables only installed tools and still writes the scripts', () => {
    const home = homeWith('.cursor');
    const enabled = enableHooks();
    expect(enabled.claude.status).toBe('not_installed');
    expect(enabled.cursor.status).toBe('ok');
    expect(enabled.codex.status).toBe('not_installed');
    expect(statSync(join(home, '.builders-space', 'hooks', 'status-hook.sh')).mode & 0o777).toBe(
      0o755,
    );
    expect(statSync(join(home, '.builders-space', 'hook-manifest.json')).mode & 0o777).toBe(0o600);
    expect(getHookStatus()).toEqual({
      claude: 'not_installed',
      cursor: 'configured',
      codex: 'not_installed',
    });

    const disabled = disableHooks();
    expect(disabled).toEqual({ claude: 'no_config', cursor: 'removed', codex: 'no_config' });
  });

  it('returns an error when a tool config is not valid JSON and leaves the others alone', () => {
    const home = homeWith('.claude', '.cursor', '.codex');
    writeFileSync(join(home, '.claude', 'settings.json'), '{');
    writeFileSync(join(home, '.cursor', 'hooks.json'), '{');
    writeFileSync(join(home, '.codex', 'hooks.json'), '{');

    const enabled = enableHooks();
    expect(enabled.claude.status).toBe('error');
    expect(enabled.cursor.status).toBe('error');
    expect(enabled.codex.status).toBe('error');

    writeFileSync(join(home, '.claude', 'settings.json'), '{');
    expect(disableHooks().claude).toBe('error');
  });

  it('keeps a pre-existing Cursor config and strips only our commands', () => {
    const home = homeWith('.cursor');
    const hooksPath = join(home, '.cursor', 'hooks.json');
    writeFileSync(
      hooksPath,
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [{ command: 'echo keep-me' }, { command: 'echo fire-hook.sh' }],
        },
      }) + '\n',
    );

    enableHooks();
    const merged = JSON.parse(readFileSync(hooksPath, 'utf-8')) as {
      hooks: Record<string, Array<{ command: string }>>;
    };
    expect(merged.hooks.sessionStart.map((hook) => hook.command)).toEqual([
      'echo keep-me',
      '~/.builders-space/hooks/status-hook.sh',
    ]);
    expect(readdirSync(join(home, '.builders-space', 'backups')).length).toBeGreaterThan(0);

    disableHooks();
    const restored = JSON.parse(readFileSync(hooksPath, 'utf-8')) as {
      hooks: { sessionStart: Array<{ command: string }> };
    };
    expect(restored.hooks.sessionStart).toEqual([{ command: 'echo keep-me' }]);
  });

  it('keeps a pre-existing Claude hook and a Codex flag it did not add', () => {
    const home = homeWith('.claude', '.codex');
    const settings = join(home, '.claude', 'settings.json');
    writeFileSync(
      settings,
      JSON.stringify({
        theme: 'dark',
        hooks: {
          SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo mine' }] }],
        },
      }) + '\n',
    );
    const config = join(home, '.codex', 'config.toml');
    writeFileSync(config, 'model = "gpt-5"\ncodex_hooks = true\n');
    const hooksJson = join(home, '.codex', 'hooks.json');
    writeFileSync(
      hooksJson,
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }],
        },
      }) + '\n',
    );

    enableHooks();
    enableHooks();
    const once = JSON.parse(readFileSync(settings, 'utf-8')) as {
      hooks: { SessionStart: unknown[] };
    };
    expect(once.hooks.SessionStart).toHaveLength(2);

    disableHooks();
    const restored = JSON.parse(readFileSync(settings, 'utf-8')) as {
      theme: string;
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> };
    };
    expect(restored.theme).toBe('dark');
    expect(restored.hooks.SessionStart).toEqual([
      { matcher: '', hooks: [{ type: 'command', command: 'echo mine' }] },
    ]);
    expect(readFileSync(config, 'utf-8')).toContain('codex_hooks = true');
    const codexHooks = JSON.parse(readFileSync(hooksJson, 'utf-8')) as {
      hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> };
    };
    expect(codexHooks.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 'echo mine' }] }]);
  });

  it('treats a corrupt manifest as empty and still installs', () => {
    const home = homeWith('.claude');
    mkdirSync(join(home, '.builders-space'));
    writeFileSync(join(home, '.builders-space', 'hook-manifest.json'), 'not-json');
    expect(enableHooks().claude.status).toBe('ok');
    expect(existsSync(join(home, '.claude', 'settings.json'))).toBe(true);
  });

  it('reports available when a config cannot be read', () => {
    const home = homeWith('.claude');
    mkdirSync(join(home, '.builders-space', 'hooks'), { recursive: true });
    writeFileSync(join(home, '.builders-space', 'hooks', 'status-hook.sh'), '#!/bin/bash\n');
    mkdirSync(join(home, '.claude', 'settings.json'));
    expect(getHookStatus().claude).toBe('available');
  });

  it('drops hook sections that become empty and removes a flag we appended to an empty file', () => {
    const home = homeWith('.claude', '.codex');
    writeFileSync(
      join(home, '.claude', 'settings.json'),
      JSON.stringify({
        theme: 'dark',
        hooks: {
          SessionStart: [{ hooks: [{ command: '~/.builders-space/hooks/status-hook.sh' }] }],
        },
      }) + '\n',
    );
    writeFileSync(join(home, '.codex', 'config.toml'), '');
    writeFileSync(
      join(home, '.codex', 'hooks.json'),
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ command: '~/.builders-space/hooks/status-hook.sh' }] }],
        },
      }) + '\n',
    );

    enableHooks();
    disableHooks();

    const settings = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf-8')) as {
      theme: string;
      hooks?: unknown;
    };
    expect(settings.theme).toBe('dark');
    expect(settings.hooks).toBeUndefined();
    expect(existsSync(join(home, '.codex', 'config.toml'))).toBe(false);
    expect(existsSync(join(home, '.codex', 'hooks.json'))).toBe(false);
  });

  it('does nothing to a config that has no hooks of ours', () => {
    const home = homeWith('.cursor');
    writeFileSync(
      join(home, '.cursor', 'hooks.json'),
      JSON.stringify({ version: 1, hooks: { sessionStart: [{ command: 'echo keep' }] } }) + '\n',
    );
    expect(disableHooks().cursor).toBe('skipped');
    expect(readFileSync(join(home, '.cursor', 'hooks.json'), 'utf-8')).toContain('echo keep');
  });
});
