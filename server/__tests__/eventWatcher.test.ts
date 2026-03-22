import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HookRuntimeEntry } from '../stateManager';

type ApplyFn = (entry: HookRuntimeEntry) => void;

function createMockStateManager() {
  const overlays: HookRuntimeEntry[] = [];
  return {
    overlays,
    applyHookOverlay: vi.fn((entry: HookRuntimeEntry) => {
      overlays.push(entry);
    }),
  };
}

// We test the normalization logic by extracting it into importable helpers.
// Since the current EventWatcher couples filesystem I/O with normalization,
// the refactored version should expose these as testable functions.
// For now, we import the helpers that will be added during implementation.

// These imports will fail until Phase 3c lands — that's expected.
import {
  normalizeFireEvent,
  normalizeStatusEvent,
  detectSource,
  extractSessionId,
  extractCwd,
} from '../watchers/eventWatcher';

describe('EventWatcher normalization', () => {

  // ── Event normalization ────────────────────────────────────────────

  describe('normalizeStatusEvent', () => {
    it('SessionStart -> working, non-terminal, realtime for claude-code', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'SessionStart',
        session_id: 'sess1',
        cwd: '/proj',
        source: 'claude',
      });

      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('working');
      expect(entry!.terminal).toBe(false);
      expect(entry!.mode).toBe('realtime');
      expect(entry!.source).toBe('claude-code');
    });

    it('session_start variant also maps to working', () => {
      const entry = normalizeStatusEvent({
        event: 'session_start',
        session_id: 'sess1',
        cwd: '/proj',
        source: 'codex',
      });

      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('working');
      expect(entry!.terminal).toBe(false);
    });

    it('PostToolUse -> working with derived lastAction', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'PostToolUse',
        session_id: 'sess1',
        cwd: '/proj',
        tool_name: 'Read',
        tool_input: { file_path: '/proj/src/foo.ts' },
        source: 'claude',
      });

      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('working');
      expect(entry!.terminal).toBe(false);
      expect(entry!.lastAction).toBe('Read:foo.ts');
    });

    it('Stop without error -> waiting, non-terminal', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'Stop',
        session_id: 'sess1',
        cwd: '/proj',
        source: 'claude',
      });

      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('waiting');
      expect(entry!.terminal).toBe(false);
    });

    it('Stop with status=error -> error, terminal, errorReason set', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'Stop',
        session_id: 'sess1',
        cwd: '/proj',
        status: 'error',
        error_message: 'Out of memory',
        source: 'claude',
      });

      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('error');
      expect(entry!.terminal).toBe(true);
      expect(entry!.errorReason).toBe('Out of memory');
    });

    it('Stop with reason=error -> error, terminal', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'Stop',
        session_id: 'sess1',
        cwd: '/proj',
        reason: 'error',
        source: 'claude',
      });

      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('error');
      expect(entry!.terminal).toBe(true);
    });

    it('Stop with error_message present -> error, terminal', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'Stop',
        session_id: 'sess1',
        cwd: '/proj',
        error_message: 'Something broke',
        source: 'claude',
      });

      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('error');
      expect(entry!.terminal).toBe(true);
      expect(entry!.errorReason).toBe('Something broke');
    });

    it('SessionEnd -> done, terminal', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'SessionEnd',
        session_id: 'sess1',
        cwd: '/proj',
        source: 'claude',
      });

      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('done');
      expect(entry!.terminal).toBe(true);
    });

    it('session_end variant also maps to done', () => {
      const entry = normalizeStatusEvent({
        event: 'session_end',
        session_id: 'sess1',
        cwd: '/proj',
        source: 'codex',
      });

      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('done');
      expect(entry!.terminal).toBe(true);
    });
  });

  // ── Mode assignment ────────────────────────────────────────────────

  describe('mode assignment', () => {
    it('Claude source -> mode realtime', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'SessionStart',
        session_id: 'sess1',
        cwd: '/proj',
        source: 'claude',
      });
      expect(entry!.mode).toBe('realtime');
    });

    it('Codex source -> mode realtime', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'SessionStart',
        session_id: 'sess1',
        cwd: '/proj',
        source: 'codex',
      });
      expect(entry!.mode).toBe('realtime');
    });

    it('Cursor source -> mode realtime', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'SessionStart',
        session_id: 'sess1',
        cwd: '/proj',
        source: 'cursor',
      });
      expect(entry!.mode).toBe('realtime');
    });
  });

  describe('Cursor lifecycle (camelCase + common schema)', () => {
    it('sessionStart -> working, realtime, cursor when cursor_version present', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'sessionStart',
        cursor_version: '1.0.0',
        conversation_id: 'conv-1',
        workspace_roots: ['/proj'],
      });
      expect(entry).not.toBeNull();
      expect(entry!.source).toBe('cursor');
      expect(entry!.sessionId).toBe('conv-1');
      expect(entry!.cwd).toBe('/proj');
      expect(entry!.status).toBe('working');
      expect(entry!.terminal).toBe(false);
      expect(entry!.mode).toBe('realtime');
    });

    it('postToolUse -> working with lastAction', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'postToolUse',
        cursor_version: '1.0',
        conversation_id: 'c',
        workspace_roots: ['/p'],
        tool_name: 'Read',
        tool_input: { file_path: '/p/src/foo.ts' },
      });
      expect(entry!.mode).toBe('realtime');
      expect(entry!.lastAction).toBe('Read:foo.ts');
    });

    it('stop with status completed -> waiting', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'stop',
        cursor_version: '1.0',
        conversation_id: 'c',
        workspace_roots: ['/p'],
        status: 'completed',
      });
      expect(entry!.status).toBe('waiting');
      expect(entry!.terminal).toBe(false);
    });

    it('stop with status error -> error terminal', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'stop',
        cursor_version: '1.0',
        conversation_id: 'c',
        workspace_roots: ['/p'],
        status: 'error',
        error_message: 'boom',
      });
      expect(entry!.status).toBe('error');
      expect(entry!.terminal).toBe(true);
      expect(entry!.errorReason).toBe('boom');
    });

    it('sessionEnd with reason error -> error terminal', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'sessionEnd',
        cursor_version: '1.0',
        conversation_id: 'c',
        workspace_roots: ['/p'],
        reason: 'error',
        error_message: 'failed',
      });
      expect(entry!.status).toBe('error');
      expect(entry!.terminal).toBe(true);
      expect(entry!.errorReason).toBe('failed');
    });

    it('sessionEnd with reason completed -> done', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'sessionEnd',
        cursor_version: '1.0',
        conversation_id: 'c',
        workspace_roots: ['/p'],
        reason: 'completed',
      });
      expect(entry!.status).toBe('done');
      expect(entry!.terminal).toBe(true);
    });
  });

  // ── Fire events ────────────────────────────────────────────────────

  describe('normalizeFireEvent', () => {
    it('produces error overlay with terminal=true and errorReason', () => {
      const entry = normalizeFireEvent({
        session_id: 'sess1',
        cwd: '/proj',
        error_message: 'Agent crashed',
        source: 'cursor',
      });

      expect(entry.status).toBe('error');
      expect(entry.terminal).toBe(true);
      expect(entry.errorReason).toBe('Agent crashed');
      expect(entry.source).toBe('cursor');
    });

    it('falls back to reason or status for errorReason', () => {
      const entry = normalizeFireEvent({
        session_id: 'sess1',
        cwd: '/proj',
        reason: 'timeout',
        source: 'claude',
      });

      expect(entry.errorReason).toBe('timeout');
    });

    it('uses default errorReason when none provided', () => {
      const entry = normalizeFireEvent({
        session_id: 'sess1',
        cwd: '/proj',
        source: 'claude',
      });

      expect(entry.errorReason).toBe('Session ended with error');
    });
  });

  // ── Deletion edge cases (unknown-event default removed) ────────────

  describe('unknown event handling', () => {
    it('unknown event name returns null (no overlay written)', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'FooBar',
        session_id: 'sess1',
        cwd: '/proj',
        source: 'claude',
      });
      expect(entry).toBeNull();
    });

    it('event with no hook_event_name and no event field returns null', () => {
      const entry = normalizeStatusEvent({
        session_id: 'sess1',
        cwd: '/proj',
        source: 'claude',
      });
      expect(entry).toBeNull();
    });

    it('event with missing session_id uses empty string', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'SessionStart',
        cwd: '/proj',
        source: 'claude',
      });
      expect(entry).not.toBeNull();
      expect(entry!.sessionId).toBe('');
    });

    it('event with missing cwd and working_directory uses undefined', () => {
      const entry = normalizeStatusEvent({
        hook_event_name: 'SessionStart',
        session_id: 'sess1',
        source: 'claude',
      });
      expect(entry).not.toBeNull();
      expect(entry!.cwd).toBeUndefined();
    });
  });

  // ── detectSource ───────────────────────────────────────────────────

  describe('detectSource', () => {
    it('tool=codex -> codex', () => {
      expect(detectSource({ tool: 'codex' })).toBe('codex');
    });

    it('source=codex -> codex', () => {
      expect(detectSource({ source: 'codex' })).toBe('codex');
    });

    it('tool=cursor -> cursor', () => {
      expect(detectSource({ tool: 'cursor' })).toBe('cursor');
    });

    it('source=cursor -> cursor', () => {
      expect(detectSource({ source: 'cursor' })).toBe('cursor');
    });

    it('tool=claude -> claude-code', () => {
      expect(detectSource({ tool: 'claude' })).toBe('claude-code');
    });

    it('source=claude -> claude-code', () => {
      expect(detectSource({ source: 'claude' })).toBe('claude-code');
    });

    it('has hook_event_name -> claude-code when no Cursor signals', () => {
      expect(detectSource({ hook_event_name: 'SessionStart' })).toBe('claude-code');
    });

    it('cursor_version + hook_event_name -> cursor', () => {
      expect(detectSource({ hook_event_name: 'sessionStart', cursor_version: '1.0' })).toBe('cursor');
    });

    it('workspace_roots + hook_event_name -> cursor', () => {
      expect(detectSource({ hook_event_name: 'PostToolUse', workspace_roots: ['/x'] })).toBe('cursor');
    });

    it('unknown defaults to claude-code', () => {
      expect(detectSource({})).toBe('claude-code');
    });
  });

  describe('extractSessionId / extractCwd', () => {
    it('uses session_id before conversation_id', () => {
      expect(extractSessionId({ session_id: 'a', conversation_id: 'b' })).toBe('a');
      expect(extractSessionId({ conversation_id: 'b' })).toBe('b');
    });

    it('extractCwd falls back to workspace_roots[0]', () => {
      expect(extractCwd({ workspace_roots: ['/first', '/second'] })).toBe('/first');
    });
  });
});
