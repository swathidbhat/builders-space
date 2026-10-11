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
  changedFiles?: string[];
  restartRequired?: boolean;
}

function startMinimized(): boolean {
  if (typeof window === 'undefined') return false;
  const compact =
    typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 999px)').matches;
  if (compact) return true;
  if (localStorage.getItem('space:hooks-seen') === '1') return true;
  return localStorage.getItem('space:hooks-minimized') === '1';
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
  const [disableMessage, setDisableMessage] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(startMinimized);

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

  useEffect(() => {
    if (!minimized) localStorage.setItem('space:hooks-seen', '1');
  }, [minimized]);

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
      setDisableMessage(null);
      setConfirmDisable(false);
      await fetchStatus();
    } catch {
      /* failed */
    }
    setLoading(false);
  };

  const handleDisable = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/hooks/disable`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('disable failed');
      setEnableResult(null);
      setConfirmDisable(false);
      setDisableMessage('Hooks removed. Restart Claude Code, Cursor, and Codex if they are open.');
      await fetchStatus();
    } catch {
      setDisableMessage('Could not remove hooks.');
    }
    setLoading(false);
  };

  const handleMinimize = () => {
    localStorage.setItem('space:hooks-minimized', '1');
    localStorage.setItem('space:hooks-seen', '1');
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
        type="button"
        className={styles.fab}
        style={cssVars({ '--icon': iconColor })}
        onClick={handleExpand}
        title="Hook settings"
        aria-label="Hook settings"
      >
        {WRENCH_SVG}
      </button>
    );
  }

  const changedFiles = enableResult?.changedFiles ?? [];
  const restartRequired = Boolean(enableResult?.restartRequired);

  return (
    <aside className={styles.card} aria-label="Hooks">
      <div className={styles.header}>
        <span className={styles.title}>Hooks</span>
        <button
          type="button"
          className={styles.minimize}
          onClick={handleMinimize}
          aria-label="Minimize hooks"
        >
          <span aria-hidden="true">&#8722;</span>
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

        {enableResult && (
          <div className={styles.feedback} role="status">
            <p className={styles.feedbackTitle}>
              {changedFiles.length > 0 ? 'Files changed' : 'No files changed'}
            </p>
            {changedFiles.length > 0 && (
              <ul className={styles.files}>
                {changedFiles.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            )}
            <p>
              {restartRequired
                ? 'Restart Claude Code, Cursor, and Codex so they load the new hooks.'
                : 'No restart needed.'}
            </p>
          </div>
        )}

        {disableMessage && (
          <p className={styles.feedback} role="status">
            {disableMessage}
          </p>
        )}

        <div className={styles.actions}>
          {confirmDisable ? (
            <div className={styles.confirm} role="group" aria-label="Confirm disable hooks">
              <p>Remove Builders Space hooks from Claude Code, Cursor, and Codex?</p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.disable}
                  onClick={() => setConfirmDisable(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.enable}
                  onClick={handleDisable}
                  disabled={loading}
                >
                  {loading ? 'Removing...' : 'Remove hooks'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {anyAvailable && !allConfigured && (
                <button
                  type="button"
                  className={styles.enable}
                  onClick={handleEnable}
                  disabled={loading}
                >
                  {loading ? 'Setting up...' : 'Enable Hooks'}
                </button>
              )}
              {anyConfigured && (
                <button
                  type="button"
                  className={styles.disable}
                  onClick={() => setConfirmDisable(true)}
                  disabled={loading}
                >
                  Disable
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
