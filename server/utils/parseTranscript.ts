import { readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { RECENT_ACTIVITY_MS } from '../../shared/config';
import { logCaught } from '../log';
import { foldAppendOnly, readIncremental, type FoldCache } from '../io/incrementalRead';
import {
  claudeBlocks,
  cursorCwd,
  cursorMessageText,
  parseClaudeLine,
  parseCursorLine,
  stringField,
  timestampMs,
  type ClaudeLine,
} from '../schema/sessionLog';

export interface TranscriptData {
  userQuery: string;
  lastAction?: string;
  isRecentlyActive: boolean;
  lastActivityMs: number;
  cwd?: string;
}

interface CursorFold {
  userQuery: string;
  lastAction?: string;
  cwd?: string;
}

interface ClaudeFold {
  sessionId: string;
  cwd: string;
  latestTask: string;
  latestTimestamp: number;
  lastAction?: string;
  slug?: string;
}

const cursorFolds = new Map<string, FoldCache<CursorFold>>();
const claudeFolds = new Map<string, FoldCache<ClaudeFold>>();
const txtFolds = new Map<string, FoldCache<{ userQuery: string; text: string }>>();

function safeMtime(filePath: string): number {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function activity(lastActivityMs: number): { isRecentlyActive: boolean; lastActivityMs: number } {
  return {
    lastActivityMs,
    isRecentlyActive: Date.now() - lastActivityMs < RECENT_ACTIVITY_MS,
  };
}

export function parseTranscriptDir(dirPath: string): TranscriptData | null {
  try {
    const files = readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'));
    if (files.length === 0) return null;
    files.sort((a, b) => {
      try {
        return statSync(join(dirPath, b)).mtimeMs - statSync(join(dirPath, a)).mtimeMs;
      } catch (err) {
        logCaught('parseTranscriptDir', err, `stat ${dirPath}`);
        return 0;
      }
    });
    return parseTranscriptJsonl(join(dirPath, files[0]));
  } catch (err) {
    logCaught('parseTranscriptDir', err, dirPath);
    return null;
  }
}

function applyCursorLine(fold: CursorFold, line: string): void {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return;
  }
  const entry = parseCursorLine(raw);
  if (!entry) return;

  if (!fold.cwd) fold.cwd = cursorCwd(entry);

  if (entry.role === 'user' && !fold.userQuery) {
    const text = cursorMessageText(entry.message);
    if (text) {
      fold.userQuery = text.slice(0, 200);
      if (!fold.cwd) fold.cwd = cwdFromText(text);
    }
  }

  if (entry.role === 'assistant') {
    const text = cursorMessageText(entry.message);
    if (text) fold.lastAction = extractFirstSentence(text);
  }
}

function parseTranscriptJsonl(filePath: string): TranscriptData | null {
  const fold = foldAppendOnly(
    filePath,
    cursorFolds,
    (): CursorFold => ({ userQuery: '' }),
    applyCursorLine,
  );
  if (!fold || (!fold.userQuery && !fold.lastAction)) return null;
  const lastModifiedMs = safeMtime(filePath);
  return {
    userQuery: fold.userQuery,
    lastAction: fold.lastAction,
    cwd: fold.cwd,
    ...activity(lastModifiedMs),
  };
}

function cwdFromText(text: string): string | undefined {
  const match = text.match(/Workspace Path:\s*(\/[^\s]+)/);
  return match?.[1];
}

export function parseTranscriptFile(filePath: string): TranscriptData | null {
  const cached = txtFolds.get(filePath);
  const read = readIncremental(filePath, cached?.cursor);
  if (!read) {
    txtFolds.delete(filePath);
    return null;
  }

  let userQuery = cached?.value.userQuery;
  if (read.mode !== 'unchanged') {
    const text = read.mode === 'append' && cached ? cached.value.text + read.chunk : read.chunk;
    const queryMatch = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
    if (!queryMatch) {
      txtFolds.delete(filePath);
      return null;
    }
    userQuery = queryMatch[1].trim().slice(0, 200);
    txtFolds.set(filePath, { cursor: read.cursor, value: { userQuery, text } });
  }

  if (!userQuery) return null;
  return { userQuery, ...activity(safeMtime(filePath)) };
}

export interface ClaudeSessionData {
  sessionId: string;
  cwd: string;
  latestTask: string;
  lastAction?: string;
  slug?: string;
  isActive: boolean;
  lastActivityMs: number;
}

function applyClaudeLine(fold: ClaudeFold, line: string): void {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return;
  }
  const entry = parseClaudeLine(raw);
  if (!entry) return;
  takeClaudeIdentity(fold, entry);

  const ts = timestampMs(entry.timestamp);
  const content = entry.message?.content;

  if (entry.type === 'user' && content !== undefined) {
    const msgContent = claudeUserText(content);
    if (ts >= fold.latestTimestamp && msgContent.length > 0) {
      fold.latestTimestamp = ts;
      fold.latestTask = msgContent.slice(0, 200);
    }
  }

  if (entry.type === 'assistant' && content !== undefined) {
    const action = claudeAssistantAction(content);
    if (action) fold.lastAction = action;
    if (ts > fold.latestTimestamp) fold.latestTimestamp = ts;
  }
}

function takeClaudeIdentity(fold: ClaudeFold, entry: ClaudeLine): void {
  if (entry.sessionId && !fold.sessionId) fold.sessionId = entry.sessionId;
  if (entry.cwd && !fold.cwd) fold.cwd = entry.cwd;
  if (entry.slug && !fold.slug) fold.slug = entry.slug;
}

function claudeUserText(content: string | unknown[]): string {
  if (typeof content === 'string') return content;
  return claudeBlocks(content)
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join(' ');
}

function claudeAssistantAction(content: string | unknown[]): string | undefined {
  const blocks = claudeBlocks(content);
  const toolUse = [...blocks].reverse().find((block) => block.type === 'tool_use' && block.name);
  if (toolUse?.name) return formatToolUse(toolUse.name, toolUse.input);
  const textBlock = [...blocks].reverse().find((block) => block.type === 'text' && block.text);
  if (textBlock?.text) return extractFirstSentence(textBlock.text);
  return undefined;
}

export function parseClaudeSessionFile(filePath: string): ClaudeSessionData | null {
  const fold = foldAppendOnly(
    filePath,
    claudeFolds,
    (): ClaudeFold => ({ sessionId: '', cwd: '', latestTask: '', latestTimestamp: 0 }),
    applyClaudeLine,
  );
  if (!fold?.sessionId) return null;
  return {
    sessionId: fold.sessionId,
    cwd: fold.cwd,
    latestTask: fold.latestTask,
    lastAction: fold.lastAction,
    slug: fold.slug,
    isActive: Date.now() - fold.latestTimestamp < RECENT_ACTIVITY_MS,
    lastActivityMs: fold.latestTimestamp,
  };
}

export function shortenPaths(text: string): string {
  return text.replace(/\/(?:[^\s/]+\/){2,}[^\s/]+/g, (match) => {
    const segments = match.split('/').filter(Boolean);
    return segments[segments.length - 1];
  });
}

function extractFirstSentence(text: string): string {
  const cleaned = text.replace(/^#+\s*/gm, '').trim();
  const first = cleaned.split(/(?<=[.!?])\s|\n/)[0]?.trim();
  if (!first) return cleaned.slice(0, 80);
  if (first.length > 80) return first.slice(0, 77).replace(/\s+\S*$/, '') + '...';
  return first;
}

export function formatToolUse(toolName: string, input?: Record<string, unknown>): string {
  if (!input) return toolName;

  const path = stringField(input, 'file_path', 'path', 'file');
  const shortPath = path ? basename(path) : '';

  switch (toolName) {
    case 'Write':
      return shortPath ? `Write:${shortPath}` : 'Write';
    case 'Read':
      return shortPath ? `Read:${shortPath}` : 'Read';
    case 'Edit':
    case 'StrReplace':
      return shortPath ? `Edit:${shortPath}` : 'Edit';
    case 'Shell':
    case 'Bash': {
      const cmd = shortenPaths(stringField(input, 'command')).slice(0, 60);
      return cmd ? `Shell:${cmd}` : 'Shell';
    }
    case 'Grep':
    case 'Search': {
      const pattern = stringField(input, 'pattern', 'query').slice(0, 40);
      return pattern ? `Search:${pattern}` : 'Search';
    }
    case 'Glob':
    case 'ListFiles': {
      const glob = stringField(input, 'pattern', 'glob_pattern').slice(0, 40);
      return glob ? `Glob:${glob}` : 'Glob';
    }
    case 'WebSearch': {
      const query = stringField(input, 'search_term', 'query').slice(0, 40);
      return query ? `WebSearch:${query}` : 'WebSearch';
    }
    case 'Task':
      return 'Task:subtask';
    case 'TodoWrite':
      return 'TodoWrite';
    default:
      return shortPath ? `${toolName}:${shortPath}` : toolName;
  }
}
