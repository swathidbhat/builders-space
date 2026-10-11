import { useState, useEffect, useCallback } from 'react';
import { API_ORIGIN, authHeaders } from '../api';
import { cssVars } from './cssVars';
import { HookToolRow, type EnableToolResult } from './HookToolRow';
import styles from './HookSetupCard.module.css';

type ToolStatus = 'configured' | 'available' | 'not_installed';

interface HookStatusResponse {
  claude: ToolStatus;
  cursor: ToolStatus;
  codex: ToolStatus;
}

interface EnableResponse {
  claude: EnableToolResult;
  cursor: EnableToolResult;
  codex: EnableToolResult;
}

const API_BASE = API_ORIGIN;
const TOOLS = ['claude', 'cursor', 'codex'] as const;

const WRENCH_SVG = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

export function HookSetupCard() {
  const [status, setStatus] = useState<HookStatusResponse | null>(null);
  const [enableResult, setEnableResult] = useState<EnableResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(
    () => localStorage.getItem('space:hooks-minimized') === '1',
  );

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/hooks/status`, { headers: authHeaders() });
      const data: HookStatusResponse = await res.json();
      setStatus(data);
    } catch {
      /* server not reachable */
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (!status) return null;

  const anyAvailable = TOOLS.some((t) => status[t] === 'available');
  const anyConfigured = TOOLS.some((t) => status[t] === 'configured');
  const allConfigured = TOOLS.every(
    (t) => status[t] === 'configured' || status[t] === 'not_installed',
  );

  const handleEnable = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/hooks/enable`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data: EnableResponse = await res.json();
      setEnableResult(data);
      await fetchStatus();
    } catch {
      /* failed */
    }
    setLoading(false);
  };

  const handleDisable = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/hooks/disable`, { method: 'POST', headers: authHeaders() });
      setEnableResult(null);
      await fetchStatus();
    } catch {
      /* failed */
    }
    setLoading(false);
  };

  const handleMinimize = () => {
    localStorage.setItem('space:hooks-minimized', '1');
    setMinimized(true);
  };

  const handleExpand = () => {
    localStorage.removeItem('space:hooks-minimized');
    setMinimized(false);
  };

  if (minimized) {
    const iconColor = anyConfigured ? '#4ade80' : 'rgba(255,255,255,0.4)';
    return (
      <button
        className={styles.fab}
        style={cssVars({ '--icon': iconColor })}
        onClick={handleExpand}
        title="Hook settings"
      >
        {WRENCH_SVG}
      </button>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>Hooks</span>
        <button className={styles.minimize} onClick={handleMinimize} title="Minimize">
          &#8722;
        </button>
      </div>

      <div className={styles.body}>
        {!allConfigured && (
          <p className={styles.copy}>
            Improve tracking for Claude, Codex, and Cursor. Claude, Codex and Cursor can report what
            they are doing more quickly and accurately. If live updates from these tools stop,
            Builders Space will continue inferring activity, just in a different way.
          </p>
        )}

        <div className={styles.rows}>
          {TOOLS.map((tool) => (
            <HookToolRow
              key={tool}
              tool={tool}
              status={status[tool]}
              result={enableResult?.[tool]}
            />
          ))}
        </div>

        {!allConfigured && (
          <div className={styles.note}>
            <p>
              This adds a few lines to your tool config files. Originals are backed up to{' '}
              <span>~/.builders-space/backups/</span> before any changes. You can disable at any
              time to remove everything cleanly.
            </p>
          </div>
        )}

        <div className={styles.actions}>
          {anyAvailable && !allConfigured && (
            <button className={styles.enable} onClick={handleEnable} disabled={loading}>
              {loading ? 'Setting up...' : 'Enable Hooks'}
            </button>
          )}
          {anyConfigured && (
            <button className={styles.disable} onClick={handleDisable} disabled={loading}>
              Disable
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
