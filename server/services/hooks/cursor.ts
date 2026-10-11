import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { logCaught } from '../../log';
import { backupFile } from './backup';
import { isOurHook } from './match';
import { noteCreated } from './manifest';
import { cursorDir, cursorHooksPath } from './paths';
import { cursorConfigSchema, readJsonConfig } from './jsonConfig';
import { STATUS_HOOK_COMMAND } from './scripts';
import { statusFromToolDir } from './status';
import type { EnableToolResult, HookManifest, ToolHookAdapter } from './types';

const CURSOR_HOOK_KEYS = ['sessionStart', 'postToolUse', 'stop', 'sessionEnd'] as const;

type CursorConfig = {
  version?: number;
  hooks?: Record<string, Array<{ command?: string }>>;
};

function mergeCursorHooksIntoConfig(config: CursorConfig): void {
  if (!config.hooks) config.hooks = {};
  const hooks = config.hooks;
  for (const key of CURSOR_HOOK_KEYS) {
    if (!Array.isArray(hooks[key])) hooks[key] = [];
    let arr = hooks[key].filter((hook) => !hook.command?.includes('fire-hook.sh'));
    const hasStatus = arr.some((hook) => hook.command?.includes('status-hook.sh'));
    if (!hasStatus) arr = [...arr, { command: STATUS_HOOK_COMMAND }];
    hooks[key] = arr;
  }
  if (config.version === undefined) config.version = 1;
}

function freshCursorConfig(): CursorConfig {
  return {
    version: 1,
    hooks: Object.fromEntries(
      CURSOR_HOOK_KEYS.map((key) => [key, [{ command: STATUS_HOOK_COMMAND }]]),
    ),
  };
}

function enable(manifest: HookManifest): EnableToolResult {
  if (!existsSync(cursorDir())) return { status: 'not_installed' };

  const configPath = cursorHooksPath();
  try {
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify(freshCursorConfig(), null, 2) + '\n');
      noteCreated(manifest, configPath);
      return { status: 'ok' };
    }

    const content = readFileSync(configPath, 'utf-8');
    if (content.includes('status-hook.sh')) return { status: 'ok' };

    backupFile(configPath, 'cursor-hooks.json');
    const config = readJsonConfig(content, cursorConfigSchema);
    mergeCursorHooksIntoConfig(config);
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    return { status: 'ok' };
  } catch (err) {
    logCaught('hookSetup', err, 'enable cursor');
    return { status: 'error', error: String(err) };
  }
}

function disable(manifest: HookManifest): string {
  const configPath = cursorHooksPath();
  if (manifest.createdFiles.includes(configPath) && existsSync(configPath)) {
    unlinkSync(configPath);
    return 'removed';
  }
  if (!existsSync(configPath)) return 'no_config';

  const config = readJsonConfig(readFileSync(configPath, 'utf-8'), cursorConfigSchema);
  let modified = false;

  if (config.hooks && typeof config.hooks === 'object') {
    for (const key of Object.keys(config.hooks)) {
      const arr = config.hooks[key];
      if (!Array.isArray(arr)) continue;
      const filtered = arr.filter((hook) => !isOurHook(hook.command));
      if (filtered.length !== arr.length) modified = true;
      if (filtered.length === 0) delete config.hooks[key];
      else config.hooks[key] = filtered;
    }
    if (Object.keys(config.hooks).length === 0) delete config.hooks;
  }

  if (!modified) return 'skipped';
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  return 'removed';
}

export const cursorHooks: ToolHookAdapter = {
  name: 'cursor',
  status: () => statusFromToolDir(cursorDir(), [cursorHooksPath()]),
  enable,
  disable,
};
