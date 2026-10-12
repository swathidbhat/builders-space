import { readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { RECENT_ACTIVITY_MS } from '../../shared/config';
import { logCaught } from '../log';
import { foldAppendOnly, readIncremental, type FoldCache } from '../io/incrementalRead';
import { retainCache } from './retainCache';
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

/** Safety bound for a single assistant message. Real questions fit well under this. */
export const QUESTION_MAX_CHARS = 8_000;

export function capQuestion(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= QUESTION_MAX_CHARS) return trimmed;
  return trimmed.slice(0, QUESTION_MAX_CHARS);
}

export interface TranscriptData {
  userQuery: string;
  lastAction?: string;
  /** Full text of the assistant message the user has not answered yet. */
  pendingQuestion?: string;
  isRecentlyActive: boolean;
  lastActivityMs: number;
  cwd?: string;
  /** The last message is a completed assistant turn, including a question. */
  turnFinished: boolean;
}

interface CursorFold {
  userQuery: string;
  lastAction?: string;
  pendingQuestion?: string;
  cwd?: string;
  lastRole?: string;
}

interface ClaudeFold {
  sessionId: string;
  cwd: string;
  latestTask: string;
  latestTimestamp: number;
  lastAction?: string;
  pendingQuestion?: string;
  slug?: string;
  turnFinished: boolean;
}

interface TxtFold {
  userQuery: string;
  /** Suffix only, so a tag split across an append can still match. Not the whole file. */
  tail: string;
  turnFinished: boolean;
  pendingQuestion?: string;
}

const TXT_TAIL_MAX = 8_192;

const cursorFolds = new Map<string, FoldCache<CursorFold>>();
const claudeFolds = new Map<string, FoldCache<ClaudeFold>>();
const txtFolds = new Map<string, FoldCache<TxtFold>>();

let cursorScan: Set<string> | null = null;
let claudeScan: Set<string> | null = null;

export function beginCursorParseScan(): void {
  cursorScan = new Set();
}

export function endCursorParseScan(): void {
  if (!cursorScan) return;
  retainCache(cursorFolds, cursorScan);
  retainCache(txtFolds, cursorScan);
  cursorScan = null;
}

export function beginClaudeParseScan(): void {
  claudeScan = new Set();
}

export function endClaudeParseScan(): void {
  if (!claudeScan) return;
  retainCache(claudeFolds, claudeScan);
  claudeScan = null;
}

export function transcriptCacheSize(): number {
  return cursorFolds.size + claudeFolds.size + txtFolds.size;
}

export function transcriptTxtTailLength(filePath: string): number | null {
  const cached = txtFolds.get(filePath);
  return cached ? cached.value.tail.length : null;
}

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

  if (entry.role === 'user') {
    fold.pendingQuestion = undefined;
    if (!fold.userQuery) {
      const text = cursorMessageText(entry.message);
      if (text) {
        fold.userQuery = text.slice(0, 200);
        if (!fold.cwd) fold.cwd = cwdFromText(text);
      }
    }
  }

  if (entry.role === 'user' || entry.role === 'assistant') fold.lastRole = entry.role;

  if (entry.role === 'assistant') {
    const text = cursorMessageText(entry.message);
    if (text) {
      fold.lastAction = extractFirstSentence(text);
      fold.pendingQuestion = capQuestion(text);
    }
  }
}

function parseTranscriptJsonl(filePath: string): TranscriptData | null {
  cursorScan?.add(filePath);
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
    pendingQuestion: fold.lastRole === 'assistant' ? fold.pendingQuestion : undefined,
    cwd: fold.cwd,
    turnFinished: fold.lastRole === 'assistant',
    ...activity(lastModifiedMs),
  };
}

function cwdFromText(text: string): string | undefined {
  const match = text.match(/Workspace Path:\s*(\/[^\s]+)/);
  return match?.[1];
}

export function parseTranscriptFile(filePath: string): TranscriptData | null {
  cursorScan?.add(filePath);
  const cached = txtFolds.get(filePath);
  const read = readIncremental(filePath, cached?.cursor);
  if (!read) {
    txtFolds.delete(filePath);
    return null;
  }

  if (read.mode === 'unchanged') {
    if (cached && cached.cursor !== read.cursor) {
      txtFolds.set(filePath, { cursor: read.cursor, value: cached.value });
    }
    if (!cached?.value.userQuery) return null;
    return {
      userQuery: cached.value.userQuery,
      pendingQuestion: cached.value.pendingQuestion,
      turnFinished: cached.value.turnFinished,
      ...activity(safeMtime(filePath)),
    };
  }

  const priorTail = read.mode === 'append' && cached ? cached.value.tail : '';
  const text = priorTail + read.chunk;
  const queryMatch = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
  const userQuery = queryMatch
    ? queryMatch[1].trim().slice(0, 200)
    : read.mode === 'append'
      ? cached?.value.userQuery
      : undefined;
  if (!userQuery) {
    txtFolds.delete(filePath);
    return null;
  }
  const tail = text.length > TXT_TAIL_MAX ? text.slice(-TXT_TAIL_MAX) : text;
  const turnFinished = txtTurnFinished(text);
  const pendingQuestion = turnFinished ? txtAssistantReply(text) : undefined;
  txtFolds.set(filePath, {
    cursor: read.cursor,
    value: { userQuery, tail, turnFinished, pendingQuestion },
  });
  return { userQuery, pendingQuestion, turnFinished, ...activity(safeMtime(filePath)) };
}

/** Text after the last user query is the assistant's completed turn. */
export function txtTurnFinished(text: string): boolean {
  return txtAssistantReply(text) !== undefined;
}

/** The assistant reply in a Cursor `.txt` export, after the last user query. */
export function txtAssistantReply(text: string): string | undefined {
  const close = text.lastIndexOf('</user_query>');
  if (close !== -1) {
    const reply = text.slice(close + '</user_query>'.length).trim();
    return reply.length > 0 ? capQuestion(reply) : undefined;
  }
  const userAt = Math.max(text.lastIndexOf('\nuser:'), text.lastIndexOf('\nUser:'));
  const assistantAt = Math.max(text.lastIndexOf('\nassistant:'), text.lastIndexOf('\nAssistant:'));
  if (assistantAt === -1 || assistantAt < userAt) return undefined;
  const reply = text
    .slice(assistantAt)
    .replace(/^\n?[Aa]ssistant:\s*/, '')
    .trim();
  return reply.length > 0 ? capQuestion(reply) : undefined;
}

export interface ClaudeSessionData {
  sessionId: string;
  cwd: string;
  latestTask: string;
  lastAction?: string;
  pendingQuestion?: string;
  slug?: string;
  isActive: boolean;
  lastActivityMs: number;
  turnFinished: boolean;
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
    if (msgContent.length > 0) {
      fold.turnFinished = false;
      fold.pendingQuestion = undefined;
    }
    if (ts >= fold.latestTimestamp && msgContent.length > 0) {
      fold.latestTimestamp = ts;
      fold.latestTask = msgContent.slice(0, 200);
    }
  }

  if (entry.type === 'assistant' && content !== undefined) {
    const action = claudeAssistantAction(content);
    if (action) fold.lastAction = action;
    const reply = claudeUserText(content).trim();
    if (reply.length > 0) {
      fold.turnFinished = true;
      fold.pendingQuestion = capQuestion(reply);
    } else {
      fold.turnFinished = false;
      fold.pendingQuestion = undefined;
    }
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
  claudeScan?.add(filePath);
  const fold = foldAppendOnly(
    filePath,
    claudeFolds,
    (): ClaudeFold => ({
      sessionId: '',
      cwd: '',
      latestTask: '',
      latestTimestamp: 0,
      turnFinished: false,
    }),
    applyClaudeLine,
  );
  if (!fold?.sessionId) return null;
  return {
    sessionId: fold.sessionId,
    cwd: fold.cwd,
    latestTask: fold.latestTask,
    lastAction: fold.lastAction,
    pendingQuestion: fold.turnFinished ? fold.pendingQuestion : undefined,
    slug: fold.slug,
    isActive: Date.now() - fold.latestTimestamp < RECENT_ACTIVITY_MS,
    lastActivityMs: fold.latestTimestamp,
    turnFinished: fold.turnFinished,
  };
}

export function shortenPaths(text: string): string {
  return text.replace(/(?<![.\w])\/(?:[^\s/]+\/){2,}[^\s/]+/g, (match) => {
    const segments = match.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (!last || last === '.' || last === '..' || last === '...') return match;
    return last;
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
