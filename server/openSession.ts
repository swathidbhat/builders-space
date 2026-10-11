import { execFile } from 'child_process';
import { realpathSync, statSync } from 'fs';
import type { AgentInfo, AgentSource } from './types';
import { logCaught } from './log';

const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

export interface CommandSpec {
  file: string;
  args: string[];
}

export type OpenSessionResult = { spec: CommandSpec; resumed: boolean } | { error: string };

/**
 * AppleScript passed to osascript. The directory and session id are argv
 * (`on run argv`), never interpolated into this source. `tool` is one of
 * two fixed literals chosen from the agent source.
 */
function resumeScript(source: AgentSource): string {
  const tool = source === 'claude-code' ? 'claude --resume' : 'codex resume';
  return [
    'on run argv',
    'set dir to item 1 of argv',
    'set sid to item 2 of argv',
    `tell application "Terminal" to do script "cd " & quoted form of dir & " && ${tool} " & quoted form of sid`,
    'end run',
  ].join('\n');
}

function assertExistingDirectory(input: string | undefined): string | null {
  if (!input || !input.startsWith('/')) return null;
  if (/[\0\r\n]/.test(input)) return null;
  try {
    const resolved = realpathSync(input);
    if (!statSync(resolved).isDirectory()) return null;
    return resolved;
  } catch (err) {
    logCaught('open-session', err, 'path rejected');
    return null;
  }
}

/**
 * Build an argv array for a known agent. The caller cannot supply a command
 * or a path: both come from server state. Nothing is passed through a shell.
 */
export function buildOpenSessionCommand(agent: AgentInfo): OpenSessionResult {
  const meta = agent.sessionMeta;
  if (!meta?.projectPath) return { error: 'Missing project path' };

  if (agent.source === 'cursor') {
    const projectPath = assertExistingDirectory(meta.projectPath);
    if (!projectPath) return { error: 'Project path is not an existing directory' };
    return {
      resumed: false,
      spec: { file: 'open', args: ['-a', 'Cursor', '--', projectPath] },
    };
  }

  if (agent.source === 'claude-code' || agent.source === 'codex') {
    const sessionId = meta.sessionId ?? '';
    const canResume = agent.status !== 'working' && sessionId.length > 0;
    if (canResume) {
      if (!SESSION_ID_RE.test(sessionId)) return { error: 'Invalid session id' };
      const dir = assertExistingDirectory(meta.cwd || meta.projectPath);
      if (!dir) return { error: 'Session directory is not an existing directory' };
      return {
        resumed: true,
        spec: {
          file: 'osascript',
          args: ['-e', resumeScript(agent.source), '--', dir, sessionId],
        },
      };
    }
    const projectPath = assertExistingDirectory(meta.projectPath);
    if (!projectPath) return { error: 'Project path is not an existing directory' };
    return {
      resumed: false,
      spec: { file: 'open', args: ['-a', 'Terminal', '--', projectPath] },
    };
  }

  return { error: `Unknown source: ${agent.source}` };
}

export function runCommand(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 15_000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
