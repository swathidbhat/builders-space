import { useState, useEffect, useCallback } from 'react';

type ToolStatus = 'configured' | 'available' | 'not_installed';
type EnableResult = 'ok' | 'manual' | 'not_installed' | 'error';

interface HookStatusResponse {
  claude: ToolStatus;
  cursor: ToolStatus;
  codex: ToolStatus;
}

interface EnableToolResult {
  status: EnableResult;
  snippet?: string;
  error?: string;
}

interface EnableResponse {
  claude: EnableToolResult;
  cursor: EnableToolResult;
  codex: EnableToolResult;
}

const API_BASE = 'http://localhost:3002';
const TOOLS = ['claude', 'cursor', 'codex'] as const;
const TOOL_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex',
};

const INDICATOR_COLORS: Record<string, string> = {
  configured: '#4ade80',
  available: '#facc15',
  not_installed: 'rgba(255,255,255,0.2)',
  manual: '#fb923c',
};

const WRENCH_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

export function HookSetupCard() {
  const [status, setStatus] = useState<HookStatusResponse | null>(null);
  const [enableResult, setEnableResult] = useState<EnableResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(() =>
    localStorage.getItem('space:hooks-minimized') === '1'
  );

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/hooks/status`);
      const data: HookStatusResponse = await res.json();
      setStatus(data);
    } catch { /* server not reachable */ }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (!status) return null;

  const anyAvailable = TOOLS.some(t => status[t] === 'available');
  const anyConfigured = TOOLS.some(t => status[t] === 'configured');
  const allConfigured = TOOLS.every(
    t => status[t] === 'configured' || status[t] === 'not_installed'
  );

  const handleEnable = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/hooks/enable`, { method: 'POST' });
      const data: EnableResponse = await res.json();
      setEnableResult(data);
      await fetchStatus();
    } catch { /* failed */ }
    setLoading(false);
  };

  const handleDisable = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/hooks/disable`, { method: 'POST' });
      setEnableResult(null);
      await fetchStatus();
    } catch { /* failed */ }
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
        onClick={handleExpand}
        title="Hook settings"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 40,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(10, 10, 30, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          color: iconColor,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          transition: 'border-color 0.2s',
        }}
      >
        {WRENCH_SVG}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 40,
      width: 300,
      background: 'rgba(10, 10, 30, 0.95)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
      fontFamily: 'monospace',
      color: 'rgba(255, 255, 255, 0.8)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa', letterSpacing: 0.5 }}>
          Hooks
        </span>
        <button
          onClick={handleMinimize}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.3)',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 2px',
          }}
          title="Minimize"
        >
          &#8722;
        </button>
      </div>

      <div style={{ padding: '12px 14px' }}>
        {!allConfigured && (
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Improve tracking for Claude, Codex, and Cursor.
            Claude, Codex and Cursor can report what they're doing more quickly and accurately.
            If live updates from these tools stop, Builders Space will continue
            inferring activity, just in a different way.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TOOLS.map(tool => (
            <ToolRow
              key={tool}
              tool={tool}
              status={status[tool]}
              result={enableResult?.[tool]}
            />
          ))}
        </div>

        {!allConfigured && (
          <div style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.6 }}>
              This adds a few lines to your tool config files.
              Originals are backed up to <span style={{ color: 'rgba(255,255,255,0.55)' }}>~/.builders-space/backups/</span> before
              any changes. You can disable at any time to remove
              everything cleanly.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {anyAvailable && !allConfigured && (
            <button
              onClick={handleEnable}
              disabled={loading}
              style={{
                flex: 1,
                fontSize: 10,
                fontFamily: 'monospace',
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {loading ? 'Setting up...' : 'Enable Hooks'}
            </button>
          )}
          {anyConfigured && (
            <button
              onClick={handleDisable}
              disabled={loading}
              style={{
                fontSize: 10,
                fontFamily: 'monospace',
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.4)',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.5 : 1,
                transition: 'opacity 0.2s, color 0.2s',
              }}
            >
              Disable
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolRow({
  tool,
  status,
  result,
}: {
  tool: string;
  status: ToolStatus;
  result?: EnableToolResult;
}) {
  const [showSnippet, setShowSnippet] = useState(false);
  const label = TOOL_LABELS[tool] || tool;

  let indicatorColor = INDICATOR_COLORS[status] || INDICATOR_COLORS.available;
  let statusText = status === 'not_installed' ? 'Not installed'
    : status === 'configured' ? 'Configured'
    : 'Available';

  if (result?.status === 'manual' && result.snippet) {
    statusText = 'Manual step needed';
    indicatorColor = INDICATOR_COLORS.manual;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: indicatorColor,
            display: 'inline-block',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>{label}</span>
        </div>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>{statusText}</span>
      </div>
      {result?.status === 'manual' && result.snippet && (
        <div style={{ marginTop: 4 }}>
          <button
            onClick={() => setShowSnippet(!showSnippet)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fb923c',
              cursor: 'pointer',
              fontSize: 9,
              padding: 0,
              fontFamily: 'monospace',
            }}
          >
            {showSnippet ? 'Hide' : 'Show'} manual steps
          </button>
          {showSnippet && (
            <pre style={{
              marginTop: 4,
              fontSize: 8,
              color: 'rgba(255,255,255,0.5)',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 4,
              padding: 8,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.4,
            }}>
              {result.snippet}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
