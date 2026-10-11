import { useState, useCallback } from 'react';
import { visibleActivity } from '../../shared/humanize';
import type { AgentInfo } from '../types';
import type { AgentIdentity } from './agentIdentity';
import { useSpaceStore } from '../store';
import { API_ORIGIN, authHeaders } from '../api';
import { activityPhrase } from './attention';
import { cssVars } from './cssVars';
import styles from './AgentCard.module.css';

const SOURCE_LABELS: Record<string, string> = {
  'claude-code': 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
};

const SOURCE_COLORS: Record<string, string> = {
  'claude-code': '#d97706',
  codex: '#10b981',
  cursor: '#6366f1',
};

const STATUS_LABELS: Record<string, string> = {
  working: 'Working',
  waiting: 'Needs you',
  done: 'Done',
  error: 'Error',
};

const STATUS_DOT_COLORS: Record<string, string> = {
  working: '#44ffaa',
  waiting: '#ffaa44',
  done: '#666',
  error: '#ff4444',
};

const TOAST_MESSAGES: Record<string, string> = {
  cursor: 'Opened in Cursor — find the agent chat in the sidebar',
  'claude-code': 'Resuming session in Terminal',
  codex: 'Resuming session in Terminal',
};

interface AgentCardProps {
  agent: AgentInfo;
  identity: AgentIdentity;
  humanLingo: boolean;
}

export function AgentCard({ agent, identity, humanLingo }: AgentCardProps) {
  const sourceColor = SOURCE_COLORS[agent.source] || '#888';
  const statusLabel = STATUS_LABELS[agent.status] || agent.status;
  const sourceLabel = SOURCE_LABELS[agent.source] || agent.source;
  const accentColor = identity.gradient[0];
  const [toast, setToast] = useState<string | null>(null);
  const humanizedTexts = useSpaceStore((s) => s.humanizedTexts);
  const humanized = agent.lastAction ? humanizedTexts[agent.lastAction] : undefined;
  const humanizedError = agent.errorReason ? humanizedTexts[agent.errorReason] : undefined;

  const openSession = useCallback(async () => {
    if (!agent.sessionMeta) return;
    try {
      const res = await fetch(`${API_ORIGIN}/api/open-session`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ agentId: agent.id }),
      });
      const data = await res.json();
      if (data.ok && agent.source === 'cursor') {
        setToast(TOAST_MESSAGES.cursor);
      } else if (data.ok && data.resumed) {
        setToast('Resuming session in Terminal');
      } else if (data.ok) {
        setToast('Opened project directory in Terminal');
      } else {
        setToast(
          typeof data.error === 'string' && data.error ? data.error : 'Could not open the session.',
        );
      }
    } catch {
      setToast('Could not connect to server');
    }
    setTimeout(() => setToast(null), 3000);
  }, [agent.source, agent.id, agent.sessionMeta]);

  const dotColor = STATUS_DOT_COLORS[agent.status] || '#666';
  const dotGlow =
    agent.status === 'working' || agent.status === 'waiting' || agent.status === 'error'
      ? `0 0 6px ${dotColor}`
      : 'none';

  const badgeBg =
    agent.status === 'waiting'
      ? 'rgba(255,170,68,0.15)'
      : agent.status === 'error'
        ? 'rgba(255,68,68,0.15)'
        : 'rgba(255,255,255,0.06)';

  const badgeColor =
    agent.status === 'waiting' ? '#ffaa44' : agent.status === 'error' ? '#ff4444' : '#aaa';

  const raw =
    agent.status === 'error' && agent.errorReason ? agent.errorReason : agent.lastAction || '';
  const translated = raw ? (agent.status === 'error' ? humanizedError : humanized) : undefined;
  const action = visibleActivity(raw, translated, humanLingo);
  const task = agent.currentTask?.trim() || agent.title?.trim() || '';
  const primary = task || identity.name;
  const quiet = activityPhrase(agent);

  return (
    <div
      className={styles.card}
      onClick={openSession}
      title={agent.sessionMeta ? 'Click to open session' : undefined}
      style={cssVars({
        '--accent': accentColor,
        '--accent-2': identity.gradient[1],
        '--soft': `${accentColor}08`,
        '--soft-2': `${identity.gradient[1]}06`,
        '--soft-hover': `${accentColor}14`,
        '--soft-2-hover': `${identity.gradient[1]}10`,
        '--glow': `${accentColor}44`,
        '--radius': identity.avatarBorderRadius,
        '--cursor': agent.sessionMeta ? 'pointer' : 'default',
        '--source': sourceColor,
        '--source-bg': `${sourceColor}18`,
        '--dot': dotColor,
        '--dot-glow': dotGlow,
        '--badge-bg': badgeBg,
        '--badge-color': badgeColor,
      })}
    >
      <div className={styles.top}>
        <div className={styles.identity}>
          <div className={styles.avatar}>{identity.initial}</div>
          <div className={styles.who}>
            <div className={styles.nameRow}>
              <span className={styles.task} title={primary}>
                {primary}
              </span>
            </div>
            <div className={styles.subRow}>
              {task && <span className={styles.alias}>{identity.name}</span>}
              <span className={styles.source}>{sourceLabel}</span>
              {quiet && <span className={styles.quiet}>{quiet}</span>}
            </div>
          </div>
        </div>

        <div className={styles.meta}>
          <div className={styles.dot} />
          <span className={styles.badge}>{statusLabel}</span>
        </div>
      </div>

      <div className={styles.action}>{action}</div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
