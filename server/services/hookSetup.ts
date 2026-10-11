import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logCaught } from '../log';

function appDir(): string {
  return join(homedir(), '.builders-space');
}
function hooksDir(): string {
  return join(appDir(), 'hooks');
}
function eventsDir(): string {
  return join(appDir(), 'events');
}
function backupsDir(): string {
  return join(appDir(), 'backups');
}
function fireHookScript(): string {
  return join(hooksDir(), 'fire-hook.sh');
}
function statusHookScript(): string {
  return join(hooksDir(), 'status-hook.sh');
}
function manifestPath(): string {
  return join(appDir(), 'hook-manifest.json');
}

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

interface HookManifest {
  createdFiles: string[];
  codexFeatureFlagAdded: boolean;
}

const EMPTY_MANIFEST: HookManifest = { createdFiles: [], codexFeatureFlagAdded: false };

/**
 * Status hook. Filenames use pid + $RANDOM because BSD date on macOS has no %N.
 * No python3: the script stores the raw payload.
 */
export const STATUS_HOOK_SCRIPT_CONTENT = `#!/bin/bash
INPUT=$(cat)
EVENTS_DIR="\${HOME}/.builders-space/events"
mkdir -p "$EVENTS_DIR"
chmod 700 "$EVENTS_DIR" 2>/dev/null || true
umask 077
NAME="status-$(date +%s)-$$-\${RANDOM}-\${RANDOM}.json"
printf '%s\\n' "$INPUT" > "\${EVENTS_DIR}/\${NAME}" || exit 0
exit 0
`;

/**
 * Fire hook. Detects an error status with grep so the hook does not need python3.
 */
export const FIRE_HOOK_SCRIPT_CONTENT = `#!/bin/bash
INPUT=$(cat)
if printf '%s' "$INPUT" | grep -qE '"status"[[:space:]]*:[[:space:]]*"error"|"reason"[[:space:]]*:[[:space:]]*"error"'; then
  EVENTS_DIR="\${HOME}/.builders-space/events"
  mkdir -p "$EVENTS_DIR"
  chmod 700 "$EVENTS_DIR" 2>/dev/null || true
  umask 077
  NAME="fire-$(date +%s)-$$-\${RANDOM}-\${RANDOM}.json"
  printf '%s\\n' "$INPUT" > "\${EVENTS_DIR}/\${NAME}" || exit 0
fi
exit 0
`;

export function ensureAppDirs(): void {
  for (const dir of [appDir(), hooksDir(), eventsDir(), backupsDir()]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(dir, 0o700);
    } catch (err) {
      logCaught('hookSetup', err, `chmod ${dir}`);
    }
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
  if (!existsSync(statusHookScript()) && !existsSync(fireHookScript())) return 'available';

  const filesToCheck = tool === 'codex' ? [getCodexHooksJsonPath()] : [getConfigPath(tool)];

  for (const filePath of filesToCheck) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      if (content.includes('status-hook.sh') || content.includes('fire-hook.sh'))
        return 'configured';
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') logCaught('hookSetup', err, filePath);
    }
  }

  return 'available';
}

function getToolDir(tool: ToolName): string {
  switch (tool) {
    case 'claude':
      return join(homedir(), '.claude');
    case 'cursor':
      return join(homedir(), '.cursor');
    case 'codex':
      return join(homedir(), '.codex');
  }
}

function getConfigPath(tool: ToolName): string {
  switch (tool) {
    case 'claude':
      return join(homedir(), '.claude', 'settings.json');
    case 'cursor':
      return join(homedir(), '.cursor', 'hooks.json');
    case 'codex':
      return join(homedir(), '.codex', 'config.toml');
  }
}

function getCodexHooksJsonPath(): string {
  return join(homedir(), '.codex', 'hooks.json');
}

function readManifest(): HookManifest {
  try {
    if (!existsSync(manifestPath())) return { ...EMPTY_MANIFEST, createdFiles: [] };
    const raw = JSON.parse(readFileSync(manifestPath(), 'utf-8')) as Partial<HookManifest>;
    return {
      createdFiles: Array.isArray(raw.createdFiles)
        ? raw.createdFiles.filter((entry): entry is string => typeof entry === 'string')
        : [],
      codexFeatureFlagAdded: Boolean(raw.codexFeatureFlagAdded),
    };
  } catch (err) {
    logCaught('hookSetup', err, 'reading hook manifest');
    return { ...EMPTY_MANIFEST, createdFiles: [] };
  }
}

function writeManifest(manifest: HookManifest): void {
  writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
}

function noteCreated(manifest: HookManifest, filePath: string): void {
  if (!manifest.createdFiles.includes(filePath)) manifest.createdFiles.push(filePath);
}

export function enableHooks(): EnableResultMap {
  ensureAppDirs();
  const manifest = readManifest();

  writeFileSync(fireHookScript(), FIRE_HOOK_SCRIPT_CONTENT, { mode: 0o755 });
  chmodSync(fireHookScript(), 0o755);
  writeFileSync(statusHookScript(), STATUS_HOOK_SCRIPT_CONTENT, { mode: 0o755 });
  chmodSync(statusHookScript(), 0o755);

  const result = {
    claude: enableClaude(manifest),
    cursor: enableCursor(manifest),
    codex: enableCodex(manifest),
  };
  writeManifest(manifest);
  return result;
}

function makeClaudeHookGroup(scriptPath: string) {
  return { matcher: '', hooks: [{ type: 'command', command: scriptPath }] };
}

function enableClaude(manifest: HookManifest): EnableResultMap['claude'] {
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
      noteCreated(manifest, configPath);
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
    logCaught('hookSetup', err, 'enable claude');
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
    let arr = hooks[key].filter((h) => !h.command?.includes('fire-hook.sh'));
    const hasStatus = arr.some((h) => h.command?.includes('status-hook.sh'));
    if (!hasStatus) {
      arr = [...arr, { command: CURSOR_STATUS_HOOK }];
    }
    hooks[key] = arr;
  }
  if (config.version === undefined) config.version = 1;
}

function enableCursor(manifest: HookManifest): EnableResultMap['cursor'] {
  const toolDir = getToolDir('cursor');
  if (!existsSync(toolDir)) return { status: 'not_installed' };

  const configPath = getConfigPath('cursor');
  const freshConfig = {
    version: 1,
    hooks: Object.fromEntries(CURSOR_HOOK_KEYS.map((k) => [k, [{ command: CURSOR_STATUS_HOOK }]])),
  };

  try {
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify(freshConfig, null, 2) + '\n');
      noteCreated(manifest, configPath);
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
    logCaught('hookSetup', err, 'enable cursor');
    return { status: 'error', error: String(err) };
  }
}

function enableCodex(manifest: HookManifest): EnableResultMap['codex'] {
  const toolDir = getToolDir('codex');
  if (!existsSync(toolDir)) return { status: 'not_installed' };

  try {
    ensureCodexFeatureFlag(manifest);
    writeCodexHooksJson(getCodexHooksJsonPath(), manifest);
    return { status: 'ok' };
  } catch (err) {
    logCaught('hookSetup', err, 'enable codex');
    return { status: 'error', error: String(err) };
  }
}

function ensureCodexFeatureFlag(manifest: HookManifest): void {
  const configPath = getConfigPath('codex');

  if (!existsSync(configPath)) {
    writeFileSync(configPath, '[features]\ncodex_hooks = true\n');
    noteCreated(manifest, configPath);
    return;
  }

  const content = readFileSync(configPath, 'utf-8');
  if (content.includes('codex_hooks')) return;

  backupFile(configPath, 'codex-config.toml');
  const updated = content.trimEnd() + '\n\n[features]\ncodex_hooks = true\n';
  writeFileSync(configPath, updated);
  manifest.codexFeatureFlagAdded = true;
}

const CODEX_HOOKS_DEFINITION = {
  hooks: {
    SessionStart: [
      {
        hooks: [{ type: 'command', command: '~/.builders-space/hooks/status-hook.sh' }],
      },
    ],
    Stop: [
      { hooks: [{ type: 'command', command: '~/.builders-space/hooks/status-hook.sh' }] },
      { hooks: [{ type: 'command', command: '~/.builders-space/hooks/fire-hook.sh' }] },
    ],
  },
};

export function writeCodexHooksJson(hooksJsonPath: string, manifest?: HookManifest): void {
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
    if (manifest) noteCreated(manifest, hooksJsonPath);
  }
}

function backupFile(filePath: string, backupName: string): void {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(backupsDir(), `${ts}_${backupName}`);
  copyFileSync(filePath, dest);
}

function removeCodexFeatureFlag(configPath: string): void {
  if (!existsSync(configPath)) return;
  const content = readFileSync(configPath, 'utf-8');
  let updated = content.replace(/\r?\ncodex_hooks\s*=\s*true\s*/g, '\n');
  updated = updated.replace(/\n*\[features\]\s*(?=\n\[|$)/g, '\n');
  if (updated.trim() === '') {
    unlinkSync(configPath);
    return;
  }
  writeFileSync(configPath, updated.trimEnd() + '\n');
}

export function disableHooks(): { claude: string; cursor: string; codex: string } {
  const result = { claude: 'skipped', cursor: 'skipped', codex: 'skipped' };
  const manifest = readManifest();
  const created = new Set(manifest.createdFiles);

  const isOurHook = (cmd?: string) =>
    cmd?.includes('fire-hook.sh') || cmd?.includes('status-hook.sh');

  for (const tool of ['claude', 'cursor', 'codex'] as ToolName[]) {
    const configPath = getConfigPath(tool);
    try {
      if (tool === 'codex') {
        const hooksJsonPath = getCodexHooksJsonPath();
        if (created.has(hooksJsonPath) && existsSync(hooksJsonPath)) {
          unlinkSync(hooksJsonPath);
          result[tool] = 'removed';
        } else if (existsSync(hooksJsonPath)) {
          const hooksContent = readFileSync(hooksJsonPath, 'utf-8');
          const hooksConfig = JSON.parse(hooksContent);
          let modified = false;

          for (const event of Object.keys(hooksConfig.hooks || {})) {
            if (!Array.isArray(hooksConfig.hooks[event])) continue;
            const before = hooksConfig.hooks[event].length;
            hooksConfig.hooks[event] = hooksConfig.hooks[event].filter(
              (g: { hooks?: Array<{ command?: string }> }) =>
                !g.hooks?.some((h) => isOurHook(h.command)),
            );
            if (hooksConfig.hooks[event].length !== before) modified = true;
            if (hooksConfig.hooks[event].length === 0) delete hooksConfig.hooks[event];
          }

          if (modified) {
            if (hooksConfig.hooks && Object.keys(hooksConfig.hooks).length === 0)
              delete hooksConfig.hooks;
            if (Object.keys(hooksConfig).length === 0) {
              unlinkSync(hooksJsonPath);
            } else {
              writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2) + '\n');
            }
            result[tool] = 'removed';
          }
        }

        if (created.has(configPath) && existsSync(configPath)) {
          unlinkSync(configPath);
          result[tool] = 'removed';
        } else if (manifest.codexFeatureFlagAdded) {
          removeCodexFeatureFlag(configPath);
          result[tool] = 'removed';
        } else if (!existsSync(configPath) && !existsSync(hooksJsonPath)) {
          result[tool] = 'no_config';
        }
        continue;
      }

      if (created.has(configPath) && existsSync(configPath)) {
        unlinkSync(configPath);
        result[tool] = 'removed';
        continue;
      }

      if (!existsSync(configPath)) {
        result[tool] = 'no_config';
        continue;
      }

      if (tool === 'claude') {
        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        let modified = false;

        const claudeEvents = ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'];
        for (const event of claudeEvents) {
          if (!config.hooks?.[event]) continue;
          const before = config.hooks[event].length;
          config.hooks[event] = config.hooks[event].filter(
            (h: { hooks?: Array<{ command?: string }> }) =>
              !h.hooks?.some((hh) => isOurHook(hh.command)),
          );
          if (config.hooks[event].length !== before) modified = true;
          if (config.hooks[event].length === 0) delete config.hooks[event];
        }

        if (modified) {
          if (config.hooks && Object.keys(config.hooks).length === 0) delete config.hooks;
          writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
          result[tool] = 'removed';
        }
      } else if (tool === 'cursor') {
        const content = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content) as {
          hooks?: Record<string, Array<{ command?: string }>>;
        };
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
    } catch (err) {
      logCaught('hookSetup', err, `disable ${tool}`);
      result[tool] = 'error';
    }
  }

  for (const script of [fireHookScript(), statusHookScript()]) {
    try {
      if (existsSync(script)) unlinkSync(script);
    } catch (err) {
      logCaught('hookSetup', err, `removing ${script}`);
    }
  }

  try {
    if (existsSync(manifestPath())) unlinkSync(manifestPath());
  } catch (err) {
    logCaught('hookSetup', err, 'removing hook manifest');
  }

  return result;
}
