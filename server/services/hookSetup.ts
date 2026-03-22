import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const APP_DIR = join(homedir(), '.builders-space');
const HOOKS_DIR = join(APP_DIR, 'hooks');
const EVENTS_DIR = join(APP_DIR, 'events');
const BACKUPS_DIR = join(APP_DIR, 'backups');
const FIRE_HOOK_SCRIPT = join(HOOKS_DIR, 'fire-hook.sh');
const STATUS_HOOK_SCRIPT = join(HOOKS_DIR, 'status-hook.sh');

type ToolName = 'claude' | 'cursor' | 'codex';
type ToolStatus = 'configured' | 'available' | 'not_installed';
type EnableResult = 'ok' | 'manual' | 'not_installed' | 'error';

export interface HookStatus {
  claude: ToolStatus;
  cursor: ToolStatus;
  codex: ToolStatus;
}

export interface EnableResultMap {
  claude: { status: EnableResult; snippet?: string; error?: string };
  cursor: { status: EnableResult; snippet?: string; error?: string };
  codex: { status: EnableResult; snippet?: string; error?: string };
}

const FIRE_HOOK_SCRIPT_CONTENT = `#!/bin/bash
INPUT=$(cat)
STATUS=$(echo "$INPUT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('status', d.get('reason', '')))
" 2>/dev/null)
if [ "$STATUS" = "error" ]; then
  echo "$INPUT" > ~/.builders-space/events/fire-$(date +%s%N).json
fi
exit 0
`;

const STATUS_HOOK_SCRIPT_CONTENT = `#!/bin/bash
INPUT=$(cat)
echo "$INPUT" > ~/.builders-space/events/status-$(date +%s%N).json
exit 0
`;

export function ensureAppDirs(): void {
  for (const dir of [APP_DIR, HOOKS_DIR, EVENTS_DIR, BACKUPS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

export function getHookStatus(): HookStatus {
  return {
    claude: getToolStatus('claude'),
    cursor: getToolStatus('cursor'),
    codex: getToolStatus('codex'),
  };
}

function getToolStatus(tool: ToolName): ToolStatus {
  const toolDir = getToolDir(tool);

  if (!existsSync(toolDir)) return 'not_installed';
  if (!existsSync(STATUS_HOOK_SCRIPT) && !existsSync(FIRE_HOOK_SCRIPT)) return 'available';

  const filesToCheck = tool === 'codex'
    ? [getCodexHooksJsonPath()]
    : [getConfigPath(tool)];

  for (const filePath of filesToCheck) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      if (content.includes('status-hook.sh') || content.includes('fire-hook.sh')) return 'configured';
    } catch { /* file doesn't exist */ }
  }

  return 'available';
}

function getToolDir(tool: ToolName): string {
  switch (tool) {
    case 'claude': return join(homedir(), '.claude');
    case 'cursor': return join(homedir(), '.cursor');
    case 'codex': return join(homedir(), '.codex');
  }
}

function getConfigPath(tool: ToolName): string {
  switch (tool) {
    case 'claude': return join(homedir(), '.claude', 'settings.json');
    case 'cursor': return join(homedir(), '.cursor', 'hooks.json');
    case 'codex': return join(homedir(), '.codex', 'config.toml');
  }
}

function getCodexHooksJsonPath(): string {
  return join(homedir(), '.codex', 'hooks.json');
}

export function enableHooks(): EnableResultMap {
  ensureAppDirs();

  writeFileSync(FIRE_HOOK_SCRIPT, FIRE_HOOK_SCRIPT_CONTENT, { mode: 0o755 });
  chmodSync(FIRE_HOOK_SCRIPT, 0o755);
  writeFileSync(STATUS_HOOK_SCRIPT, STATUS_HOOK_SCRIPT_CONTENT, { mode: 0o755 });
  chmodSync(STATUS_HOOK_SCRIPT, 0o755);

  return {
    claude: enableClaude(),
    cursor: enableCursor(),
    codex: enableCodex(),
  };
}

function makeClaudeHookGroup(scriptPath: string) {
  return { matcher: '', hooks: [{ type: 'command', command: scriptPath }] };
}

function enableClaude(): EnableResultMap['claude'] {
  const toolDir = getToolDir('claude');
  if (!existsSync(toolDir)) return { status: 'not_installed' };

  const configPath = getConfigPath('claude');
  const statusHook = '~/.builders-space/hooks/status-hook.sh';
  const fireHook = '~/.builders-space/hooks/fire-hook.sh';

  const ourHooks: Record<string, ReturnType<typeof makeClaudeHookGroup>[]> = {
    SessionStart: [makeClaudeHookGroup(statusHook)],
    PostToolUse: [makeClaudeHookGroup(statusHook)],
    Stop: [makeClaudeHookGroup(statusHook), makeClaudeHookGroup(fireHook)],
    SessionEnd: [makeClaudeHookGroup(statusHook)],
  };

  try {
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify({ hooks: ourHooks }, null, 2) + '\n');
      return { status: 'ok' };
    }

    const content = readFileSync(configPath, 'utf-8');
    if (content.includes('status-hook.sh')) return { status: 'ok' };

    backupFile(configPath, 'claude-settings.json');
    const config = JSON.parse(content);

    if (!config.hooks) config.hooks = {};

    for (const [event, groups] of Object.entries(ourHooks)) {
      if (!config.hooks[event]) {
        config.hooks[event] = [];
      }
      config.hooks[event].push(...groups);
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}

const CURSOR_STATUS_HOOK = '~/.builders-space/hooks/status-hook.sh';

const CURSOR_HOOK_KEYS = ['sessionStart', 'postToolUse', 'stop', 'sessionEnd'] as const;

function mergeCursorHooksIntoConfig(config: {
  version?: number;
  hooks?: Record<string, Array<{ command?: string }>>;
}): void {
  if (!config.hooks) config.hooks = {};
  const hooks = config.hooks;
  for (const key of CURSOR_HOOK_KEYS) {
    if (!Array.isArray(hooks[key])) hooks[key] = [];
    let arr = hooks[key].filter(h => !h.command?.includes('fire-hook.sh'));
    const hasStatus = arr.some(h => h.command?.includes('status-hook.sh'));
    if (!hasStatus) {
      arr = [...arr, { command: CURSOR_STATUS_HOOK }];
    }
    hooks[key] = arr;
  }
  if (config.version === undefined) config.version = 1;
}

function enableCursor(): EnableResultMap['cursor'] {
  const toolDir = getToolDir('cursor');
  if (!existsSync(toolDir)) return { status: 'not_installed' };

  const configPath = getConfigPath('cursor');
  const freshConfig = {
    version: 1,
    hooks: Object.fromEntries(
      CURSOR_HOOK_KEYS.map(k => [k, [{ command: CURSOR_STATUS_HOOK }]]),
    ),
  };

  try {
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify(freshConfig, null, 2) + '\n');
      return { status: 'ok' };
    }

    const content = readFileSync(configPath, 'utf-8');
    if (content.includes('status-hook.sh')) return { status: 'ok' };

    backupFile(configPath, 'cursor-hooks.json');
    const config = JSON.parse(content) as {
      version?: number;
      hooks?: Record<string, Array<{ command?: string }>>;
    };
    mergeCursorHooksIntoConfig(config);
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}

function enableCodex(): EnableResultMap['codex'] {
  const toolDir = getToolDir('codex');
  if (!existsSync(toolDir)) return { status: 'not_installed' };

  try {
    ensureCodexFeatureFlag();
    writeCodexHooksJson(getCodexHooksJsonPath());
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}

function ensureCodexFeatureFlag(): void {
  const configPath = getConfigPath('codex');

  if (!existsSync(configPath)) {
    writeFileSync(configPath, '[features]\ncodex_hooks = true\n');
    return;
  }

  const content = readFileSync(configPath, 'utf-8');
  if (content.includes('codex_hooks')) return;

  backupFile(configPath, 'codex-config.toml');
  const updated = content.trimEnd() + '\n\n[features]\ncodex_hooks = true\n';
  writeFileSync(configPath, updated);
}

const CODEX_HOOKS_DEFINITION = {
  hooks: {
    SessionStart: [{
      hooks: [{ type: 'command', command: '~/.builders-space/hooks/status-hook.sh' }],
    }],
    Stop: [
      { hooks: [{ type: 'command', command: '~/.builders-space/hooks/status-hook.sh' }] },
      { hooks: [{ type: 'command', command: '~/.builders-space/hooks/fire-hook.sh' }] },
    ],
  },
};

export function writeCodexHooksJson(hooksJsonPath: string): void {
  if (existsSync(hooksJsonPath)) {
    const content = readFileSync(hooksJsonPath, 'utf-8');
    if (content.includes('status-hook.sh')) return;

    backupFile(hooksJsonPath, 'codex-hooks.json');
    const existing = JSON.parse(content);
    if (!existing.hooks) existing.hooks = {};

    for (const [event, groups] of Object.entries(CODEX_HOOKS_DEFINITION.hooks)) {
      if (!existing.hooks[event]) existing.hooks[event] = [];
      existing.hooks[event].push(...(groups as unknown[]));
    }

    writeFileSync(hooksJsonPath, JSON.stringify(existing, null, 2) + '\n');
  } else {
    writeFileSync(hooksJsonPath, JSON.stringify(CODEX_HOOKS_DEFINITION, null, 2) + '\n');
  }
}

function backupFile(filePath: string, backupName: string): void {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(BACKUPS_DIR, `${ts}_${backupName}`);
  copyFileSync(filePath, dest);
}

export function disableHooks(): { claude: string; cursor: string; codex: string } {
  const result = { claude: 'skipped', cursor: 'skipped', codex: 'skipped' };

  const isOurHook = (cmd?: string) =>
    cmd?.includes('fire-hook.sh') || cmd?.includes('status-hook.sh');

  for (const tool of ['claude', 'cursor', 'codex'] as ToolName[]) {
    const configPath = getConfigPath(tool);
    try {
      if (!existsSync(configPath)) {
        result[tool] = 'no_config';
        continue;
      }

      if (tool === 'codex') {
        const hooksJsonPath = getCodexHooksJsonPath();
        if (existsSync(hooksJsonPath)) {
          const hooksContent = readFileSync(hooksJsonPath, 'utf-8');
          const hooksConfig = JSON.parse(hooksContent);
          let modified = false;

          for (const event of Object.keys(hooksConfig.hooks || {})) {
            if (!Array.isArray(hooksConfig.hooks[event])) continue;
            hooksConfig.hooks[event] = hooksConfig.hooks[event].filter(
              (g: { hooks?: Array<{ command?: string }> }) =>
                !g.hooks?.some(h => isOurHook(h.command))
            );
            if (hooksConfig.hooks[event].length === 0) delete hooksConfig.hooks[event];
            modified = true;
          }

          if (modified) {
            if (hooksConfig.hooks && Object.keys(hooksConfig.hooks).length === 0) delete hooksConfig.hooks;
            if (Object.keys(hooksConfig).length === 0) {
              unlinkSync(hooksJsonPath);
            } else {
              writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2) + '\n');
            }
          }
        }
        result[tool] = 'removed';
      } else if (tool === 'claude') {
        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        let modified = false;

        const claudeEvents = ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'];
        for (const event of claudeEvents) {
          if (!config.hooks?.[event]) continue;
          config.hooks[event] = config.hooks[event].filter(
            (h: { hooks?: Array<{ command?: string }> }) =>
              !h.hooks?.some(hh => isOurHook(hh.command))
          );
          if (config.hooks[event].length === 0) delete config.hooks[event];
          modified = true;
        }

        if (modified) {
          if (config.hooks && Object.keys(config.hooks).length === 0) delete config.hooks;
          writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
          result[tool] = 'removed';
        }
      } else if (tool === 'cursor') {
        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as { hooks?: Record<string, Array<{ command?: string }>> };
        let modified = false;

        if (config.hooks && typeof config.hooks === 'object') {
          for (const key of Object.keys(config.hooks)) {
            const arr = config.hooks[key];
            if (!Array.isArray(arr)) continue;
            const filtered = arr.filter((h: { command?: string }) => !isOurHook(h.command));
            if (filtered.length !== arr.length) modified = true;
            if (filtered.length === 0) {
              delete config.hooks[key];
            } else {
              config.hooks[key] = filtered;
            }
          }
          if (config.hooks && Object.keys(config.hooks).length === 0) delete config.hooks;
        }

        if (modified) {
          writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
          result[tool] = 'removed';
        }
      }
    } catch {
      result[tool] = 'error';
    }
  }

  for (const script of [FIRE_HOOK_SCRIPT, STATUS_HOOK_SCRIPT]) {
    try { if (existsSync(script)) unlinkSync(script); } catch { /* ignore */ }
  }

  return result;
}
