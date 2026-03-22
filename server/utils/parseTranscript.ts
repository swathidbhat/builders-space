import { readFileSync, statSync, readdirSync } from 'fs';
import { join, basename } from 'path';

export interface TranscriptData {
  userQuery: string;
  lastAction?: string;
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

    let userQuery = '';
    let lastAction: string | undefined;
    let lastModifiedMs = 0;

    try {
      lastModifiedMs = statSync(filePath).mtimeMs;
    } catch { /* ignore */ }

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (entry.role === 'user' && !userQuery) {
          const text = extractTextFromMessage(entry.message);
          if (text) userQuery = text.slice(0, 200);
        }

        if (entry.role === 'assistant') {
          const text = extractTextFromMessage(entry.message);
          if (text) lastAction = extractFirstSentence(text);
        }
      } catch {
        continue;
      }
    }

    if (!userQuery && !lastAction) return null;

    const ageMs = Date.now() - lastModifiedMs;
    const isRecentlyActive = ageMs < 2 * 60 * 1000;

    return { userQuery, lastAction, isRecentlyActive, lastActivityMs: lastModifiedMs };
  } catch {
    return null;
  }
}

export function parseTranscriptFile(filePath: string): TranscriptData | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const queryMatch = content.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
    if (!queryMatch) return null;

    const userQuery = queryMatch[1].trim().slice(0, 200);

    let lastModifiedMs = 0;
    try {
      lastModifiedMs = statSync(filePath).mtimeMs;
    } catch { /* ignore */ }

    const ageMs = Date.now() - lastModifiedMs;
    const isRecentlyActive = ageMs < 2 * 60 * 1000;

    return { userQuery, isRecentlyActive, lastActivityMs: lastModifiedMs };
  } catch {
    return null;
  }
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

export function parseClaudeSessionFile(filePath: string): ClaudeSessionData | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    let sessionId = '';
    let cwd = '';
    let latestTask = '';
    let latestTimestamp = 0;
    let lastAction: string | undefined;
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

          if (ts >= latestTimestamp && msgContent.length > 0) {
            latestTimestamp = ts;
            latestTask = msgContent.slice(0, 200);
          }
        }

        if (entry.type === 'assistant' && entry.message?.content) {
          const contentBlocks: Array<{ type: string; name?: string; text?: string; input?: Record<string, unknown> }> =
            Array.isArray(entry.message.content) ? entry.message.content : [];

          const toolUse = [...contentBlocks].reverse().find(c => c.type === 'tool_use');
          if (toolUse && toolUse.name) {
            lastAction = formatToolUse(toolUse.name, toolUse.input);
          } else {
            const textBlock = [...contentBlocks].reverse().find(c => c.type === 'text' && c.text);
            if (textBlock?.text) {
              lastAction = extractFirstSentence(textBlock.text);
            }
          }

          if (ts > latestTimestamp) latestTimestamp = ts;
        }
      } catch {
        continue;
      }
    }

    if (!sessionId) return null;

    const isActive = (Date.now() - latestTimestamp) < 2 * 60 * 1000;

    return { sessionId, cwd, latestTask, lastAction, slug, isActive, lastActivityMs: latestTimestamp };
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
