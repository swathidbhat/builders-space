import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { logCaught } from '../../log';
import { backupFile } from './backup';
import { isOurHook } from './match';
import { noteCreated } from './manifest';
import { claudeDir, claudeSettingsPath } from './paths';
import { claudeSettingsSchema, readJsonConfig } from './jsonConfig';
import { FIRE_HOOK_COMMAND, STATUS_HOOK_COMMAND } from './scripts';
import { statusFromToolDir } from './status';
import {
  enabledResult,
  type EnableToolResult,
  type HookManifest,
  type ToolHookAdapter,
} from './types';

const CLAUDE_EVENTS = ['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd'] as const;

function makeClaudeHookGroup(scriptPath: string) {
  return { matcher: '', hooks: [{ type: 'command', command: scriptPath }] };
}

function ourClaudeHooks(): Record<string, ReturnType<typeof makeClaudeHookGroup>[]> {
  return {
    SessionStart: [makeClaudeHookGroup(STATUS_HOOK_COMMAND)],
    PostToolUse: [makeClaudeHookGroup(STATUS_HOOK_COMMAND)],
    Stop: [makeClaudeHookGroup(STATUS_HOOK_COMMAND), makeClaudeHookGroup(FIRE_HOOK_COMMAND)],
    SessionEnd: [makeClaudeHookGroup(STATUS_HOOK_COMMAND)],
  };
}

function enable(manifest: HookManifest): EnableToolResult {
  if (!existsSync(claudeDir())) return { status: 'not_installed' };

  const configPath = claudeSettingsPath();
  const hooks = ourClaudeHooks();

  try {
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify({ hooks }, null, 2) + '\n');
      noteCreated(manifest, configPath);
      return enabledResult([configPath]);
    }

    const content = readFileSync(configPath, 'utf-8');
    if (content.includes('status-hook.sh')) return enabledResult([]);

    backupFile(configPath, 'claude-settings.json');
    const config = readJsonConfig(content, claudeSettingsSchema);
    if (!config.hooks) config.hooks = {};

    for (const [event, groups] of Object.entries(hooks)) {
      if (!config.hooks[event]) config.hooks[event] = [];
      config.hooks[event].push(...groups);
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    return enabledResult([configPath]);
  } catch (err) {
    logCaught('hookSetup', err, 'enable claude');
    return { status: 'error', error: String(err) };
  }
}

function disable(manifest: HookManifest): string {
  const configPath = claudeSettingsPath();
  if (manifest.createdFiles.includes(configPath) && existsSync(configPath)) {
    unlinkSync(configPath);
    return 'removed';
  }
  if (!existsSync(configPath)) return 'no_config';

  const content = readFileSync(configPath, 'utf-8');
  const config = readJsonConfig(content, claudeSettingsSchema);
  let modified = false;

  for (const event of CLAUDE_EVENTS) {
    if (!config.hooks?.[event]) continue;
    const before = config.hooks[event].length;
    config.hooks[event] = config.hooks[event].filter(
      (group) => !group.hooks?.some((hook) => isOurHook(hook.command)),
    );
    if (config.hooks[event].length !== before) modified = true;
    if (config.hooks[event].length === 0) delete config.hooks[event];
  }

  if (!modified) return 'skipped';
  if (config.hooks && Object.keys(config.hooks).length === 0) delete config.hooks;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  return 'removed';
}

export const claudeHooks: ToolHookAdapter = {
  name: 'claude',
  status: () => statusFromToolDir(claudeDir(), [claudeSettingsPath()]),
  enable,
  disable,
};
