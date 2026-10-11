import { useState } from 'react';
import { cssVars } from './cssVars';
import styles from './HookToolRow.module.css';

type ToolStatus = 'configured' | 'available' | 'not_installed';
type EnableResult = 'ok' | 'manual' | 'not_installed' | 'error';

export interface EnableToolResult {
  status: EnableResult;
  snippet?: string;
  error?: string;
}

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

export function HookToolRow({
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
  let statusText =
    status === 'not_installed'
      ? 'Not installed'
      : status === 'configured'
        ? 'Configured'
        : 'Available';

  if (result?.status === 'manual' && result.snippet) {
    statusText = 'Manual step needed';
    indicatorColor = INDICATOR_COLORS.manual;
  }

  return (
    <div>
      <div className={styles.row}>
        <div className={styles.nameWrap}>
          <span className={styles.dot} style={cssVars({ '--dot': indicatorColor })} />
          <span className={styles.name}>{label}</span>
        </div>
        <span className={styles.status}>{statusText}</span>
      </div>
      {result?.status === 'manual' && result.snippet && (
        <div className={styles.manual}>
          <button className={styles.toggle} onClick={() => setShowSnippet(!showSnippet)}>
            {showSnippet ? 'Hide' : 'Show'} manual steps
          </button>
          {showSnippet && <pre className={styles.snippet}>{result.snippet}</pre>}
        </div>
      )}
    </div>
  );
}
