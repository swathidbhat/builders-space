import { existsSync, unlinkSync } from 'fs';
import { logCaught } from '../../log';
import { claudeHooks } from './claude';
import { codexHooks } from './codex';
import { cursorHooks } from './cursor';
import { ensureAppDirs } from './dirs';
import { installHookScripts } from './installScripts';
import { readManifest, writeManifest } from './manifest';
import { fireHookScript, manifestPath, statusHookScript } from './paths';
import type { EnableResultMap, HookStatus, ToolHookAdapter } from './types';

export const hookAdapters: ToolHookAdapter[] = [claudeHooks, cursorHooks, codexHooks];

export function getHookStatus(): HookStatus {
  const status = {} as HookStatus;
  for (const adapter of hookAdapters) status[adapter.name] = adapter.status();
  return status;
}

export function enableHooks(): EnableResultMap {
  ensureAppDirs();
  const manifest = readManifest();
  installHookScripts();

  const result = {} as EnableResultMap;
  for (const adapter of hookAdapters) result[adapter.name] = adapter.enable(manifest);
  writeManifest(manifest);
  return result;
}

export function disableHooks(): { claude: string; cursor: string; codex: string } {
  const result = { claude: 'skipped', cursor: 'skipped', codex: 'skipped' };
  const manifest = readManifest();

  for (const adapter of hookAdapters) {
    try {
      result[adapter.name] = adapter.disable(manifest);
    } catch (err) {
      logCaught('hookSetup', err, `disable ${adapter.name}`);
      result[adapter.name] = 'error';
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

export { ensureAppDirs } from './dirs';
export { writeCodexHooksJson } from './codex';
export { FIRE_HOOK_SCRIPT_CONTENT, STATUS_HOOK_SCRIPT_CONTENT } from './scripts';
export type { EnableResultMap, HookStatus } from './types';
