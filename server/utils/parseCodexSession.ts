import { readFileSync, statSync } from 'fs';
import { basename } from 'path';
import { shortenPaths } from './parseTranscript';
import { meaningfulAgentText, meaningfulUserText } from './userMessages';

export interface CodexSessionData {
  sessionId: string;
  cwd: string;
  threadName?: string;
  latestTask?: string;
  lastAction?: string;
  /** What the agent is asking, when it closed its turn with a final answer. */
  question?: string;
  isActive: boolean;
  lastActivityMs: number;
}

export function parseCodexSessionFile(filePath: string): CodexSessionData | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    let sessionId = '';
    let cwd = '';
    let latestTask: string | undefined;
    let lastAction: string | undefined;
    let lastFinalAnswer: string | undefined;
    let latestTimestamp = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
        if (ts > latestTimestamp) latestTimestamp = ts;

        if (entry.type === 'session_meta') {
          const p = entry.payload;
          if (p?.id) sessionId = p.id;
          if (p?.cwd) cwd = p.cwd;
          continue;
        }

        if (entry.type === 'event_msg' && entry.payload?.type === 'user_message') {
          // Codex writes far more into the user role than the user does: a
          // safety-classifier prompt quoting the whole transcript, attached
          // file manifests, open-browser state. Taking the raw latest message
          // regularly surfaced one of those as the agent's goal.
          const meaningful = meaningfulUserText(entry.payload.message);
          if (meaningful) latestTask = meaningful;
        }

        // `phase` distinguishes a closing answer from mid-work narration, so
        // it is a truer "is this agent waiting on you" signal than guessing
        // from whether a tool call happened to come last.
        if (entry.type === 'event_msg' && entry.payload?.type === 'agent_message') {
          const msg = entry.payload.message;
          if (typeof msg === 'string' && msg.trim()) {
            lastFinalAnswer = entry.payload.phase === 'commentary' ? undefined : msg;
          }
        }

        if (entry.type === 'response_item') {
          const p = entry.payload;
          if (p?.type === 'function_call' && p.name) {
            lastAction = formatCodexToolUse(p.name, p.arguments);
            // A tool call after the answer means work resumed.
            lastFinalAnswer = undefined;
          }
        }
      } catch {
        continue;
      }
    }

    if (!sessionId) return null;

    const fileMtime = safeStatMtime(filePath);
    const effectiveTimestamp = Math.max(latestTimestamp, fileMtime);
    const isActive = (Date.now() - effectiveTimestamp) < 2 * 60 * 1000;

    return {
      sessionId,
      cwd,
      threadName: extractThreadName(filePath),
      latestTask,
      lastAction,
      question: meaningfulAgentText(lastFinalAnswer),
      isActive,
      lastActivityMs: effectiveTimestamp,
    };
  } catch {
    return null;
  }
}

export function parseCodexSessionMeta(filePath: string): {
  sessionId: string;
  cwd: string;
  lastActivityMs: number;
} | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const firstNewline = content.indexOf('\n');
    const firstLine = firstNewline === -1 ? content : content.slice(0, firstNewline);

    const entry = JSON.parse(firstLine);
    if (entry.type !== 'session_meta' || !entry.payload?.id) return null;

    return {
      sessionId: entry.payload.id,
      cwd: entry.payload.cwd || '',
      lastActivityMs: safeStatMtime(filePath),
    };
  } catch {
    return null;
  }
}

function safeStatMtime(filePath: string): number {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function extractThreadName(filePath: string): string | undefined {
  const name = basename(filePath, '.jsonl');
  const match = name.match(/^rollout-[\dT-]+-(.+)$/);
  return match ? match[1] : undefined;
}

function formatCodexToolUse(name: string, argsJson?: string): string {
  if (!argsJson) return name;

  try {
    const args = JSON.parse(argsJson);

    if (name === 'exec_command' || name === 'shell') {
      const cmd = shortenPaths(((args.cmd || args.command || '') as string)).slice(0, 60);
      return cmd ? `Shell:${cmd}` : 'Shell';
    }

    if (name === 'apply_patch') {
      const path = (args.path || args.file_path || '') as string;
      return path ? `Edit:${basename(path)}` : 'Edit';
    }

    const path = (args.file_path || args.path || args.file || '') as string;
    const shortPath = path ? basename(path) : '';

    if (name === 'read_file') return shortPath ? `Read:${shortPath}` : 'Read';
    if (name === 'write_file') return shortPath ? `Write:${shortPath}` : 'Write';
    if (name === 'list_directory') return shortPath ? `List:${shortPath}` : 'List';

    return shortPath ? `${name}:${shortPath}` : name;
  } catch {
    return name;
  }
}
