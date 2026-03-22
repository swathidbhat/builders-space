import { watch } from 'chokidar';
import { readFileSync, unlinkSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { StateManager } from '../stateManager';
import type { HookRuntimeEntry } from '../stateManager';
import { ensureAppDirs } from '../services/hookSetup';
import { formatToolUse } from '../utils/parseTranscript';
import type { AgentSource } from '../types';

const EVENTS_DIR = join(homedir(), '.builders-space', 'events');

/** Cursor common-schema signals (see https://cursor.com/docs/hooks). */
function isCursorPayload(event: Record<string, unknown>): boolean {
  return event.cursor_version !== undefined
    || Array.isArray(event.workspace_roots)
    || event.transcript_path !== undefined;
}

export function detectSource(event: Record<string, unknown>): AgentSource {
  if (event.tool === 'codex' || event.source === 'codex') return 'codex';
  if (event.tool === 'cursor' || event.source === 'cursor') return 'cursor';
  if (isCursorPayload(event)) return 'cursor';
  if (event.tool === 'claude' || event.source === 'claude') return 'claude-code';
  if (event.hook_event_name !== undefined) return 'claude-code';
  return 'claude-code';
}

export function extractSessionId(event: Record<string, unknown>): string {
  return (event.session_id || event.sessionId || event.conversation_id || '') as string;
}

export function extractCwd(event: Record<string, unknown>): string | undefined {
  const cwd = event.cwd ?? event.working_directory;
  if (typeof cwd === 'string' && cwd) return cwd;
  const roots = event.workspace_roots;
  if (Array.isArray(roots) && roots.length > 0 && typeof roots[0] === 'string') {
    return roots[0];
  }
  return undefined;
}

function modeForSource(_source: AgentSource): 'realtime' {
  return 'realtime';
}

export function normalizeFireEvent(event: Record<string, unknown>): HookRuntimeEntry {
  const source = detectSource(event);
  const sessionId = extractSessionId(event);
  const reason = (event.error_message || event.reason || event.status || 'Session ended with error') as string;
  const cwd = extractCwd(event);

  return {
    source,
    sessionId,
    cwd,
    status: 'error',
    errorReason: reason,
    lastEventAt: Date.now(),
    terminal: true,
    mode: modeForSource(source),
  };
}

function isStopHookError(event: Record<string, unknown>): boolean {
  const status = event.status;
  if (status === 'error') return true;
  if (typeof status === 'string' && status.toLowerCase() === 'error') return true;
  if (event.reason === 'error') return true;
  if (Boolean(event.error_message)) return true;
  return false;
}

/** Cursor `stop` hook: status may be completed | aborted | error */
function isCursorStopCompletedOrAborted(event: Record<string, unknown>): boolean {
  const s = event.status;
  return s === 'completed' || s === 'aborted';
}

export function normalizeStatusEvent(event: Record<string, unknown>): HookRuntimeEntry | null {
  const source = detectSource(event);
  const sessionId = extractSessionId(event);
  const cwd = extractCwd(event);
  const hookEvent = (event.hook_event_name || event.event || '') as string;
  const mode = modeForSource(source);

  switch (hookEvent) {
    case 'SessionStart':
    case 'session_start':
    case 'sessionStart':
      return {
        source, sessionId, cwd,
        status: 'working',
        lastEventAt: Date.now(),
        terminal: false,
        mode,
      };

    case 'PostToolUse':
    case 'postToolUse': {
      const toolName = (event.tool_name || event.tool || '') as string;
      const toolInput = event.tool_input as Record<string, unknown> | undefined;
      const action = toolName ? formatToolUse(toolName, toolInput) : undefined;
      return {
        source, sessionId, cwd,
        status: 'working',
        lastAction: action,
        lastEventAt: Date.now(),
        terminal: false,
        mode,
      };
    }

    case 'Stop':
    case 'stop': {
      if (isCursorStopCompletedOrAborted(event)) {
        return {
          source, sessionId, cwd,
          status: 'waiting',
          lastEventAt: Date.now(),
          terminal: false,
          mode,
        };
      }

      if (isStopHookError(event)) {
        const reason = (event.error_message || event.reason || 'Agent stopped with error') as string;
        return {
          source, sessionId, cwd,
          status: 'error',
          errorReason: reason,
          lastEventAt: Date.now(),
          terminal: true,
          mode,
        };
      }

      return {
        source, sessionId, cwd,
        status: 'waiting',
        lastEventAt: Date.now(),
        terminal: false,
        mode,
      };
    }

    case 'SessionEnd':
    case 'session_end':
    case 'sessionEnd': {
      const reasonStr = typeof event.reason === 'string' ? event.reason : '';
      if (reasonStr === 'error') {
        const errMsg = (event.error_message || event.final_status || 'Session ended with error') as string;
        return {
          source, sessionId, cwd,
          status: 'error',
          errorReason: errMsg,
          lastEventAt: Date.now(),
          terminal: true,
          mode,
        };
      }

      return {
        source, sessionId, cwd,
        status: 'done',
        lastEventAt: Date.now(),
        terminal: true,
        mode,
      };
    }

    default:
      return null;
  }
}

export class EventWatcher {
  private watcher: ReturnType<typeof watch> | null = null;
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  start(): void {
    ensureAppDirs();

    this.processExistingEvents();

    this.watcher = watch(EVENTS_DIR, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher.on('add', (filePath) => {
      if (filePath.endsWith('.json')) this.processEvent(filePath);
    });
    this.watcher.on('change', (filePath) => {
      if (filePath.endsWith('.json')) this.processEvent(filePath);
    });

    console.log(`[EventWatcher] Watching ${EVENTS_DIR}`);
  }

  stop(): void {
    this.watcher?.close();
  }

  private processExistingEvents(): void {
    try {
      const files = readdirSync(EVENTS_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        this.processEvent(join(EVENTS_DIR, file));
      }
    } catch { /* directory may not exist yet */ }
  }

  private processEvent(filePath: string): void {
    try {
      if (!existsSync(filePath)) return;
      const content = readFileSync(filePath, 'utf-8');
      const event = JSON.parse(content);
      const fileName = basename(filePath);

      let overlay: HookRuntimeEntry | null = null;

      if (fileName.startsWith('fire-')) {
        overlay = normalizeFireEvent(event);
      } else if (fileName.startsWith('status-')) {
        overlay = normalizeStatusEvent(event);
      }

      if (overlay) {
        this.stateManager.applyHookOverlay(overlay);
      }

      unlinkSync(filePath);
    } catch (err) {
      console.error('[EventWatcher] Error processing event:', err);
      try { unlinkSync(filePath); } catch { /* ignore */ }
    }
  }
}
