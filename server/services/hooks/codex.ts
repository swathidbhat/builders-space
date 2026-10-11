import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { logCaught } from '../../log';
import { backupFile } from './backup';
import { isOurHook } from './match';
import { noteCreated } from './manifest';
import { codexConfigPath, codexDir, codexHooksPath } from './paths';
import { FIRE_HOOK_COMMAND, STATUS_HOOK_COMMAND } from './scripts';
import { statusFromToolDir } from './status';
import type { EnableToolResult, HookManifest, ToolHookAdapter } from './types';

const CODEX_HOOKS_DEFINITION = {
  hooks: {
    SessionStart: [{ hooks: [{ type: 'command', command: STATUS_HOOK_COMMAND }] }],
    Stop: [
      { hooks: [{ type: 'command', command: STATUS_HOOK_COMMAND }] },
      { hooks: [{ type: 'command', command: FIRE_HOOK_COMMAND }] },
    ],
  },
};

export function writeCodexHooksJson(hooksJsonPath: string, manifest?: HookManifest): void {
  if (existsSync(hooksJsonPath)) {
    const content = readFileSync(hooksJsonPath, 'utf-8');
    if (content.includes('status-hook.sh')) return;

    backupFile(hooksJsonPath, 'codex-hooks.json');
    const existing = JSON.parse(content) as { hooks?: Record<string, unknown[]> };
    if (!existing.hooks) existing.hooks = {};

    for (const [event, groups] of Object.entries(CODEX_HOOKS_DEFINITION.hooks)) {
      if (!existing.hooks[event]) existing.hooks[event] = [];
      existing.hooks[event].push(...groups);
    }

    writeFileSync(hooksJsonPath, JSON.stringify(existing, null, 2) + '\n');
    return;
  }

  writeFileSync(hooksJsonPath, JSON.stringify(CODEX_HOOKS_DEFINITION, null, 2) + '\n');
  if (manifest) noteCreated(manifest, hooksJsonPath);
}

function ensureCodexFeatureFlag(manifest: HookManifest): void {
  const configPath = codexConfigPath();

  if (!existsSync(configPath)) {
    writeFileSync(configPath, '[features]\ncodex_hooks = true\n');
    noteCreated(manifest, configPath);
    return;
  }

  const content = readFileSync(configPath, 'utf-8');
  if (content.includes('codex_hooks')) return;

  backupFile(configPath, 'codex-config.toml');
  writeFileSync(configPath, content.trimEnd() + '\n\n[features]\ncodex_hooks = true\n');
  manifest.codexFeatureFlagAdded = true;
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

function enable(manifest: HookManifest): EnableToolResult {
  if (!existsSync(codexDir())) return { status: 'not_installed' };

  try {
    ensureCodexFeatureFlag(manifest);
    writeCodexHooksJson(codexHooksPath(), manifest);
    return { status: 'ok' };
  } catch (err) {
    logCaught('hookSetup', err, 'enable codex');
    return { status: 'error', error: String(err) };
  }
}

function disable(manifest: HookManifest): string {
  let outcome = 'skipped';
  const created = new Set(manifest.createdFiles);
  const configPath = codexConfigPath();
  const hooksJsonPath = codexHooksPath();

  if (created.has(hooksJsonPath) && existsSync(hooksJsonPath)) {
    unlinkSync(hooksJsonPath);
    outcome = 'removed';
  } else if (existsSync(hooksJsonPath)) {
    const hooksConfig = JSON.parse(readFileSync(hooksJsonPath, 'utf-8')) as {
      hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
    };
    let modified = false;

    for (const event of Object.keys(hooksConfig.hooks || {})) {
      if (!Array.isArray(hooksConfig.hooks?.[event])) continue;
      const before = hooksConfig.hooks[event].length;
      hooksConfig.hooks[event] = hooksConfig.hooks[event].filter(
        (group) => !group.hooks?.some((hook) => isOurHook(hook.command)),
      );
      if (hooksConfig.hooks[event].length !== before) modified = true;
      if (hooksConfig.hooks[event].length === 0) delete hooksConfig.hooks[event];
    }

    if (modified) {
      if (hooksConfig.hooks && Object.keys(hooksConfig.hooks).length === 0)
        delete hooksConfig.hooks;
      if (Object.keys(hooksConfig).length === 0) unlinkSync(hooksJsonPath);
      else writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2) + '\n');
      outcome = 'removed';
    }
  }

  if (created.has(configPath) && existsSync(configPath)) {
    unlinkSync(configPath);
    outcome = 'removed';
  } else if (manifest.codexFeatureFlagAdded) {
    removeCodexFeatureFlag(configPath);
    outcome = 'removed';
  } else if (!existsSync(configPath) && !existsSync(hooksJsonPath)) {
    outcome = 'no_config';
  }

  return outcome;
}

export const codexHooks: ToolHookAdapter = {
  name: 'codex',
  status: () => statusFromToolDir(codexDir(), [codexHooksPath()]),
  enable,
  disable,
};
