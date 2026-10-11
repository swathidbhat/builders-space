import { join } from 'path';
import { homedir } from 'os';

export function appDir(): string {
  return join(homedir(), '.builders-space');
}

export function hooksDir(): string {
  return join(appDir(), 'hooks');
}

export function eventsDir(): string {
  return join(appDir(), 'events');
}

export function backupsDir(): string {
  return join(appDir(), 'backups');
}

export function fireHookScript(): string {
  return join(hooksDir(), 'fire-hook.sh');
}

export function statusHookScript(): string {
  return join(hooksDir(), 'status-hook.sh');
}

export function manifestPath(): string {
  return join(appDir(), 'hook-manifest.json');
}

export function claudeDir(): string {
  return join(homedir(), '.claude');
}

export function cursorDir(): string {
  return join(homedir(), '.cursor');
}

export function codexDir(): string {
  return join(homedir(), '.codex');
}

export function claudeSettingsPath(): string {
  return join(claudeDir(), 'settings.json');
}

export function cursorHooksPath(): string {
  return join(cursorDir(), 'hooks.json');
}

export function codexConfigPath(): string {
  return join(codexDir(), 'config.toml');
}

export function codexHooksPath(): string {
  return join(codexDir(), 'hooks.json');
}
