import { watch } from 'chokidar';
import {
  readFileSync,
  unlinkSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  chmodSync,
} from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { StateManager } from '../stateManager';
import type { HookRuntimeEntry } from '../stateManager';
import { formatToolUse } from '../utils/parseTranscript';
import { logCaught } from '../log';
import type { AgentSource } from '../types';
import { STALE_EVENT_MAX_AGE_MS } from '../../shared/config';
import { hookString, isRecord, parseHookEvent, type HookEvent } from '../schema/sessionLog';

export { STALE_EVENT_MAX_AGE_MS };

export function defaultEventsDir(): string {
  return join(homedir(), '.builders-space', 'events');
}

/**
 * Returns the file mtime to stamp on a live overlay, or null when the file
 * is too old to treat as something happening now.
 */
export function acceptEventTime(fileMtimeMs: number, now = Date.now()): number | null {
  if (!Number.isFinite(fileMtimeMs)) return null;
  if (now - fileMtimeMs > STALE_EVENT_MAX_AGE_MS) return null;
  if (fileMtimeMs > now + 5_000) return now;
  return fileMtimeMs;
}

function asHook(event: Record<string, unknown>): HookEvent {
  return parseHookEvent(event) ?? {};
}

/** Cursor common-schema signals (see https://cursor.com/docs/hooks). */
function isCursorPayload(event: HookEvent): boolean {
  return (
    event.cursor_version !== undefined ||
    Array.isArray(event.workspace_roots) ||
    event.transcript_path !== undefined
  );
}

export function detectSource(raw: Record<string, unknown>): AgentSource {
  const event = asHook(raw);
  if (event.tool === 'codex' || event.source === 'codex') return 'codex';
  if (event.tool === 'cursor' || event.source === 'cursor') return 'cursor';
  if (isCursorPayload(event)) return 'cursor';
  if (event.tool === 'claude' || event.source === 'claude') return 'claude-code';
  if (event.hook_event_name !== undefined) return 'claude-code';
  return 'claude-code';
}

export function extractSessionId(raw: Record<string, unknown>): string {
  return hookString(asHook(raw), 'session_id', 'sessionId', 'conversation_id');
}

export function extractCwd(raw: Record<string, unknown>): string | undefined {
  const event = asHook(raw);
  const cwd = hookString(event, 'cwd', 'working_directory');
  if (cwd) return cwd;
  const root = event.workspace_roots?.[0];
  if (typeof root === 'string' && root.length > 0) return root;
  return undefined;
}

export function normalizeFireEvent(
  raw: Record<string, unknown>,
  at = Date.now(),
): HookRuntimeEntry {
  const event = asHook(raw);
  const source = detectSource(raw);
  const sessionId = extractSessionId(raw);
  const reason =
    hookString(event, 'error_message', 'reason', 'status') || 'Session ended with error';
  const cwd = extractCwd(raw);

  return {
    source,
    sessionId,
    cwd,
    status: 'error',
    errorReason: reason,
    lastEventAt: at,
    terminal: true,
    mode: 'realtime',
  };
}

function isStopHookError(event: HookEvent): boolean {
  const status = event.status;
  if (status === 'error') return true;
  if (typeof status === 'string' && status.toLowerCase() === 'error') return true;
  if (event.reason === 'error') return true;
  if (event.error_message) return true;
  return false;
}

/** Cursor `stop` hook: status may be completed | aborted | error */
function isCursorStopCompletedOrAborted(event: HookEvent): boolean {
  const s = event.status;
  return s === 'completed' || s === 'aborted';
}

export function normalizeStatusEvent(
  raw: Record<string, unknown>,
  at = Date.now(),
): HookRuntimeEntry | null {
  const event = asHook(raw);
  const source = detectSource(raw);
  const sessionId = extractSessionId(raw);
  const cwd = extractCwd(raw);
  const hookEvent = hookString(event, 'hook_event_name', 'event');
  const mode = 'realtime' as const;

  switch (hookEvent) {
    case 'SessionStart':
    case 'session_start':
    case 'sessionStart':
      return {
        source,
        sessionId,
        cwd,
        status: 'working',
        lastEventAt: at,
        terminal: false,
        mode,
      };

    case 'PostToolUse':
    case 'postToolUse': {
      const toolName = hookString(event, 'tool_name', 'tool');
      const toolInput = isRecord(event.tool_input) ? event.tool_input : undefined;
      const action = toolName ? formatToolUse(toolName, toolInput) : undefined;
      return {
        source,
        sessionId,
        cwd,
        status: 'working',
        lastAction: action,
        lastEventAt: at,
        terminal: false,
        mode,
      };
    }

    case 'Stop':
    case 'stop': {
      if (isCursorStopCompletedOrAborted(event)) {
        return {
          source,
          sessionId,
          cwd,
          status: 'waiting',
          lastEventAt: at,
          terminal: false,
          mode,
        };
      }

      if (isStopHookError(event)) {
        const reason = hookString(event, 'error_message', 'reason') || 'Agent stopped with error';
        return {
          source,
          sessionId,
          cwd,
          status: 'error',
          errorReason: reason,
          lastEventAt: at,
          terminal: true,
          mode,
        };
      }

      return {
        source,
        sessionId,
        cwd,
        status: 'waiting',
        lastEventAt: at,
        terminal: false,
        mode,
      };
    }

    case 'SessionEnd':
    case 'session_end':
    case 'sessionEnd': {
      const reasonStr = typeof event.reason === 'string' ? event.reason : '';
      if (reasonStr === 'error') {
        const errMsg =
          hookString(event, 'error_message', 'final_status') || 'Session ended with error';
        return {
          source,
          sessionId,
          cwd,
          status: 'error',
          errorReason: errMsg,
          lastEventAt: at,
          terminal: true,
          mode,
        };
      }

      return {
        source,
        sessionId,
        cwd,
        status: 'done',
        lastEventAt: at,
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
  private eventsDir: string;

  constructor(stateManager: StateManager, eventsDir?: string) {
    this.stateManager = stateManager;
    this.eventsDir = eventsDir ?? defaultEventsDir();
  }

  start(): void {
    try {
      if (!existsSync(this.eventsDir)) mkdirSync(this.eventsDir, { recursive: true, mode: 0o700 });
      chmodSync(this.eventsDir, 0o700);
    } catch (err) {
      logCaught('EventWatcher', err, `creating ${this.eventsDir}`);
    }

    this.processExistingEvents();

    this.watcher = watch(this.eventsDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher.on('add', (filePath) => {
      if (filePath.endsWith('.json')) this.processEvent(filePath);
    });
    this.watcher.on('change', (filePath) => {
      if (filePath.endsWith('.json')) this.processEvent(filePath);
    });
    this.watcher.on('error', (err) => logCaught('EventWatcher', err, 'file watch error'));

    console.log(`[EventWatcher] Watching ${this.eventsDir}`);
  }

  stop(): void {
    void this.watcher?.close();
  }

  private processExistingEvents(): void {
    try {
      const files = readdirSync(this.eventsDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        this.processEvent(join(this.eventsDir, file));
      }
    } catch (err) {
      logCaught('EventWatcher', err, `reading ${this.eventsDir}`);
    }
  }

  private processEvent(filePath: string): void {
    try {
      if (!existsSync(filePath)) return;
      const mtimeMs = statSync(filePath).mtimeMs;
      const at = acceptEventTime(mtimeMs);
      const content = readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      if (!isRecord(parsed)) throw new Error('event is not an object');
      const event = parsed;
      const fileName = basename(filePath);

      if (at === null) {
        console.warn(
          `[EventWatcher] Dropping stale event ${fileName} (file mtime ${new Date(mtimeMs).toISOString()})`,
        );
        unlinkSync(filePath);
        return;
      }

      let overlay: HookRuntimeEntry | null = null;

      if (fileName.startsWith('fire-')) {
        overlay = normalizeFireEvent(event, at);
      } else if (fileName.startsWith('status-')) {
        overlay = normalizeStatusEvent(event, at);
      }

      if (overlay) {
        this.stateManager.applyHookOverlay(overlay);
      }

      unlinkSync(filePath);
    } catch (err) {
      logCaught('EventWatcher', err, filePath);
      try {
        unlinkSync(filePath);
      } catch (unlinkErr) {
        logCaught('EventWatcher', unlinkErr, `removing ${filePath}`);
      }
    }
  }
}
