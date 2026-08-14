import { readFileSync, statSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import {
  firstSentence,
  meaningfulAgentText,
  meaningfulUserText,
} from './userMessages';

export interface TranscriptData {
  /** The most recent thing a human actually asked for. */
  latestTask: string;
  lastAction?: string;
  /** What the agent is asking, when its last turn was prose rather than a tool call. */
  question?: string;
  isRecentlyActive: boolean;
  lastActivityMs: number;
}

export function parseTranscriptDir(dirPath: string): TranscriptData | null {
  try {
    const files = readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
    if (files.length === 0) return null;
    return parseTranscriptJsonl(join(dirPath, files[0]));
  } catch {
    return null;
  }
}

function parseTranscriptJsonl(filePath: string): TranscriptData | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    let latestTask = '';
    let lastAction: string | undefined;
    let lastAssistantText: string | undefined;
    let lastModifiedMs = 0;

    try {
      lastModifiedMs = statSync(filePath).mtimeMs;
    } catch { /* ignore */ }

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Last write wins. This path carries no timestamps, so file order is
        // chronological order; `meaningfulUserText` is what makes taking the
        // latest safe, by skipping past command echoes and bare "continue"s.
        if (entry.role === 'user') {
          const text = meaningfulUserText(extractTextFromMessage(entry.message));
          if (text) latestTask = text;
        }

        if (entry.role === 'assistant') {
          const text = extractTextFromMessage(entry.message);
          if (text) {
            lastAction = firstSentence(text, ACTION_MAX_LEN);
            lastAssistantText = text;
          }
        }
      } catch {
        continue;
      }
    }

    if (!latestTask && !lastAction) return null;

    const ageMs = Date.now() - lastModifiedMs;
    const isRecentlyActive = ageMs < 2 * 60 * 1000;

    return {
      latestTask,
      lastAction,
      // No tool-use records on this path, so there is no "still working" signal
      // to exclude on. The UI only reads this when the agent is waiting.
      question: meaningfulAgentText(lastAssistantText),
      isRecentlyActive,
      lastActivityMs: lastModifiedMs,
    };
  } catch {
    return null;
  }
}

export function parseTranscriptFile(filePath: string): TranscriptData | null {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // All blocks, not the first: a `.match()` with a non-greedy group stops at
    // the opening query, which left a retasked session advertising whatever it
    // was originally asked to do.
    const blocks = [...content.matchAll(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/g)];
    if (blocks.length === 0) return null;

    let latestTask = '';
    for (const block of blocks) {
      const text = meaningfulUserText(block[1]);
      if (text) latestTask = text;
    }
    if (!latestTask) return null;

    let lastModifiedMs = 0;
    try {
      lastModifiedMs = statSync(filePath).mtimeMs;
    } catch { /* ignore */ }

    const ageMs = Date.now() - lastModifiedMs;
    const isRecentlyActive = ageMs < 2 * 60 * 1000;

    // `question` is deliberately absent: this path has no assistant records at
    // all — it does not even set `lastAction` — and guessing at the format
    // would put invented text above an agent's head.
    return { latestTask, isRecentlyActive, lastActivityMs: lastModifiedMs };
  } catch {
    return null;
  }
}

export interface ClaudeSessionData {
  sessionId: string;
  cwd: string;
  latestTask: string;
  lastAction?: string;
  /** What the agent is asking, when its last turn was prose rather than a tool call. */
  question?: string;
  slug?: string;
  isActive: boolean;
  lastActivityMs: number;
}

export function parseClaudeSessionFile(filePath: string): ClaudeSessionData | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    let sessionId = '';
    let cwd = '';
    let latestTask = '';
    let latestTimestamp = 0;
    let lastAction: string | undefined;
    let lastAssistantText: string | undefined;
    let lastTurnEndedInToolUse = false;
    let slug: string | undefined;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.sessionId && !sessionId) sessionId = entry.sessionId;
        if (entry.cwd && !cwd) cwd = entry.cwd;
        if (entry.slug && !slug) slug = entry.slug;

        const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;

        if (entry.type === 'user' && entry.message?.content) {
          const msgContent = typeof entry.message.content === 'string'
            ? entry.message.content
            : entry.message.content
                .filter((c: { type: string }) => c.type === 'text')
                .map((c: { text: string }) => c.text)
                .join(' ');

          // Claude writes command echoes, skill preambles and interrupt
          // notices into the user role, and they arrive with timestamps like
          // any other turn — so the newest user entry is regularly not a human
          // request at all.
          const meaningful = meaningfulUserText(msgContent);
          if (ts >= latestTimestamp && meaningful) {
            latestTimestamp = ts;
            latestTask = meaningful;
          }
        }

        if (entry.type === 'assistant' && entry.message?.content) {
          const contentBlocks: Array<{ type: string; name?: string; text?: string; input?: Record<string, unknown> }> =
            Array.isArray(entry.message.content) ? entry.message.content : [];

          const toolUse = [...contentBlocks].reverse().find(c => c.type === 'tool_use');
          const textBlock = [...contentBlocks].reverse().find(c => c.type === 'text' && c.text);

          if (toolUse && toolUse.name) {
            lastAction = formatToolUse(toolUse.name, toolUse.input);
          } else if (textBlock?.text) {
            lastAction = firstSentence(textBlock.text, ACTION_MAX_LEN);
          }

          // Tracked per turn, not accumulated: only the final assistant turn
          // can be a question. A turn ending in a tool call is mid-work and is
          // not asking you anything, however conversational its prose was.
          lastTurnEndedInToolUse = !!(toolUse && toolUse.name);
          lastAssistantText = textBlock?.text;

          if (ts > latestTimestamp) latestTimestamp = ts;
        }
      } catch {
        continue;
      }
    }

    if (!sessionId) return null;

    const isActive = (Date.now() - latestTimestamp) < 2 * 60 * 1000;

    const question = lastTurnEndedInToolUse
      ? undefined
      : meaningfulAgentText(lastAssistantText);

    return { sessionId, cwd, latestTask, lastAction, question, slug, isActive, lastActivityMs: latestTimestamp };
  } catch {
    return null;
  }
}

function extractTextFromMessage(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const msg = message as { content?: unknown };

  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        return block.text;
      }
    }
  }
  return undefined;
}

/** How much of an assistant turn we keep as the one-line action. */
const ACTION_MAX_LEN = 80;

export function shortenPaths(text: string): string {
  return text.replace(/\/(?:[^\s/]+\/){2,}[^\s/]+/g, (match) => {
    const segments = match.split('/').filter(Boolean);
    return segments[segments.length - 1];
  });
}

export function formatToolUse(toolName: string, input?: Record<string, unknown>): string {
  if (!input) return toolName;

  const path = (input.file_path || input.path || input.file || '') as string;
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
      const cmd = shortenPaths(((input.command || '') as string)).slice(0, 60);
      return cmd ? `Shell:${cmd}` : 'Shell';
    }
    case 'Grep':
    case 'Search': {
      const pattern = ((input.pattern || input.query || '') as string).slice(0, 40);
      return pattern ? `Search:${pattern}` : 'Search';
    }
    case 'Glob':
    case 'ListFiles': {
      const glob = ((input.pattern || input.glob_pattern || '') as string).slice(0, 40);
      return glob ? `Glob:${glob}` : 'Glob';
    }
    case 'WebSearch': {
      const query = ((input.search_term || input.query || '') as string).slice(0, 40);
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
