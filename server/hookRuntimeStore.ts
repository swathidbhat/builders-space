import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import { HOOK_ACTIVE_TTL_MS, HOOK_TERMINAL_TTL_MS } from '../shared/config';
import { logCaught } from './log';
import type { HookRuntimeEntry } from './stateManager';

const entrySchema = z.object({
  source: z.enum(['cursor', 'claude-code', 'codex']),
  sessionId: z.string(),
  cwd: z.string().optional(),
  status: z.enum(['working', 'waiting', 'done', 'error']),
  lastAction: z.string().optional(),
  errorReason: z.string().optional(),
  lastEventAt: z.number(),
  terminal: z.boolean(),
  mode: z.literal('realtime'),
});

const fileSchema = z.object({
  version: z.literal(1),
  entries: z.array(entrySchema),
});

export function defaultHookRuntimeFile(home = homedir()): string {
  return join(home, '.builders-space', 'hook-runtime.json');
}

export function hookEntryExpired(entry: HookRuntimeEntry, now = Date.now()): boolean {
  const ttl = entry.terminal ? HOOK_TERMINAL_TTL_MS : HOOK_ACTIVE_TTL_MS;
  return now - entry.lastEventAt > ttl;
}

export function loadHookRuntime(
  filePath: string,
  now = Date.now(),
): { entries: HookRuntimeEntry[]; dropped: boolean } {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') logCaught('hookRuntime', err, filePath);
    return { entries: [], dropped: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logCaught('hookRuntime', err, filePath);
    return { entries: [], dropped: true };
  }

  const file = fileSchema.safeParse(parsed);
  if (!file.success) {
    logCaught(
      'hookRuntime',
      new Error('hook runtime JSON did not match the expected shape'),
      filePath,
    );
    return { entries: [], dropped: true };
  }

  const entries: HookRuntimeEntry[] = [];
  let dropped = false;
  for (const entry of file.data.entries) {
    if (hookEntryExpired(entry, now)) {
      dropped = true;
      continue;
    }
    entries.push(entry);
  }
  return { entries, dropped };
}

/** Write overlays atomically. Directory is 0700 and the file is 0600. */
export function saveHookRuntime(filePath: string, entries: HookRuntimeEntry[]): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ version: 1, entries }), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, filePath);
}
