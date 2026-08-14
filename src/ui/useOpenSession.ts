import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentInfo } from '../types';

const TOAST_MESSAGES: Record<string, string> = {
  cursor: 'Opened in Cursor — find the agent chat in the sidebar',
  'claude-code': 'Resuming session in Terminal',
  codex: 'Resuming session in Terminal',
};

interface OpenSessionResponse {
  ok?: boolean;
  resumed?: boolean;
  error?: string;
}

export interface OpenSession {
  openSession: () => void;
  toast: string | null;
}

/**
 * Opens an agent's session in its native tool and surfaces a transient toast.
 * No-op for agents the collector could not attach session metadata to.
 */
export function useOpenSession(agent: AgentInfo): OpenSession {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Each toast owns the full 3s: a rapid second click restarts the clock
  // rather than inheriting the first click's remaining time.
  const showToast = useCallback((message: string) => {
    if (!mountedRef.current) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setToast(message);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setToast(null);
    }, 3000);
  }, []);

  const openSession = useCallback(async () => {
    if (!agent.sessionMeta) return;
    try {
      const res = await fetch('http://localhost:3002/api/open-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: agent.source, status: agent.status, sessionMeta: agent.sessionMeta }),
      });
      const data: OpenSessionResponse = await res.json();
      if (data.ok && agent.source === 'cursor') {
        showToast(TOAST_MESSAGES.cursor);
      } else if (data.ok && data.resumed) {
        showToast(TOAST_MESSAGES[agent.source] || 'Resuming session in Terminal');
      } else if (data.ok) {
        showToast('Opened project directory in Terminal');
      } else {
        showToast(`Failed: ${data.error}`);
      }
    } catch {
      showToast('Could not connect to server');
    }
  }, [agent.source, agent.status, agent.sessionMeta, showToast]);

  return { openSession, toast };
}
