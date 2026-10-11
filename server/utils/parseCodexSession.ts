import { statSync } from 'fs';
import { basename } from 'path';
import { RECENT_ACTIVITY_MS } from '../../shared/config';
import { logCaught } from '../log';
import { foldAppendOnly, readFirstLine, type FoldCache } from '../io/incrementalRead';
import { retainCache } from './retainCache';
import {
  codexArgsSchema,
  parseCodexCallPayload,
  parseCodexLine,
  parseCodexMetaPayload,
  parseCodexUserPayload,
  stringField,
  timestampMs,
} from '../schema/sessionLog';
import { shortenPaths } from './parseTranscript';

export interface CodexSessionData {
  sessionId: string;
  cwd: string;
  threadName?: string;
  latestTask?: string;
  lastAction?: string;
  isActive: boolean;
  lastActivityMs: number;
}

interface CodexFold {
  sessionId: string;
  cwd: string;
  latestTask?: string;
  lastAction?: string;
  latestTimestamp: number;
}

interface CodexMeta {
  sessionId: string;
  cwd: string;
  lastActivityMs: number;
}

const codexFolds = new Map<string, FoldCache<CodexFold>>();
const codexMetaCache = new Map<string, { mtimeMs: number; value: CodexMeta | null }>();
let codexScan: Set<string> | null = null;

export function beginCodexParseScan(): void {
  codexScan = new Set();
}

export function endCodexParseScan(): void {
  if (!codexScan) return;
  retainCache(codexFolds, codexScan);
  retainCache(codexMetaCache, codexScan);
  codexScan = null;
}

export function codexCacheSize(): number {
  return codexFolds.size + codexMetaCache.size;
}

function safeStatMtime(filePath: string): number {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function applyCodexLine(fold: CodexFold, line: string): void {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return;
  }
  const entry = parseCodexLine(raw);
  if (!entry) return;

  const ts = timestampMs(entry.timestamp);
  if (ts > fold.latestTimestamp) fold.latestTimestamp = ts;

  if (entry.type === 'session_meta') {
    const meta = parseCodexMetaPayload(entry.payload);
    if (!meta) return;
    if (meta.id) fold.sessionId = meta.id;
    if (meta.cwd) fold.cwd = meta.cwd;
    return;
  }

  if (entry.type === 'event_msg') {
    const user = parseCodexUserPayload(entry.payload);
    if (user && user.message.length > 0) fold.latestTask = user.message.slice(0, 200);
    return;
  }

  if (entry.type === 'response_item') {
    const call = parseCodexCallPayload(entry.payload);
    if (call) fold.lastAction = formatCodexToolUse(call.name, call.arguments);
  }
}

export function parseCodexSessionFile(filePath: string): CodexSessionData | null {
  codexScan?.add(filePath);
  try {
    const fold = foldAppendOnly(
      filePath,
      codexFolds,
      (): CodexFold => ({ sessionId: '', cwd: '', latestTimestamp: 0 }),
      applyCodexLine,
    );
    if (!fold?.sessionId) return null;

    const effectiveTimestamp = Math.max(fold.latestTimestamp, safeStatMtime(filePath));
    return {
      sessionId: fold.sessionId,
      cwd: fold.cwd,
      threadName: extractThreadName(filePath),
      latestTask: fold.latestTask,
      lastAction: fold.lastAction,
      isActive: Date.now() - effectiveTimestamp < RECENT_ACTIVITY_MS,
      lastActivityMs: effectiveTimestamp,
    };
  } catch (err) {
    logCaught('parseCodexSessionFile', err, filePath);
    return null;
  }
}

export function parseCodexSessionMeta(filePath: string): CodexMeta | null {
  codexScan?.add(filePath);
  const mtimeMs = safeStatMtime(filePath);
  if (mtimeMs === 0) {
    codexMetaCache.delete(filePath);
    return null;
  }
  const cached = codexMetaCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.value;

  let value: CodexMeta | null = null;
  try {
    const firstLine = readFirstLine(filePath);
    if (firstLine) {
      const entry = parseCodexLine(JSON.parse(firstLine));
      const meta = entry?.type === 'session_meta' ? parseCodexMetaPayload(entry.payload) : null;
      if (meta?.id) {
        value = {
          sessionId: meta.id,
          cwd: meta.cwd || '',
          lastActivityMs: mtimeMs,
        };
      }
    }
  } catch (err) {
    logCaught('parseCodexSessionMeta', err, filePath);
    value = null;
  }
  codexMetaCache.set(filePath, { mtimeMs, value });
  return value;
}

function extractThreadName(filePath: string): string | undefined {
  const name = basename(filePath, '.jsonl');
  const match = name.match(/^rollout-[\dT-]+-(.+)$/);
  return match ? match[1] : undefined;
}

function formatCodexToolUse(name: string, argsJson?: string): string {
  if (!argsJson) return name;

  try {
    const parsed = codexArgsSchema.safeParse(JSON.parse(argsJson));
    if (!parsed.success) return name;
    const args = parsed.data;

    if (name === 'exec_command' || name === 'shell') {
      const cmd = shortenPaths(stringField(args, 'cmd', 'command')).slice(0, 60);
      return cmd ? `Shell:${cmd}` : 'Shell';
    }

    if (name === 'apply_patch') {
      const path = stringField(args, 'path', 'file_path');
      return path ? `Edit:${basename(path)}` : 'Edit';
    }

    const path = stringField(args, 'file_path', 'path', 'file');
    const shortPath = path ? basename(path) : '';

    if (name === 'read_file') return shortPath ? `Read:${shortPath}` : 'Read';
    if (name === 'write_file') return shortPath ? `Write:${shortPath}` : 'Write';
    if (name === 'list_directory') return shortPath ? `List:${shortPath}` : 'List';

    return shortPath ? `${name}:${shortPath}` : name;
  } catch {
    return name;
  }
}
