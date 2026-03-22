import { useState, useCallback } from 'react';
import type { AgentInfo } from '../types';
import type { AgentIdentity } from './agentIdentity';
import { useSpaceStore } from '../store';

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
  const [hovered, setHovered] = useState(false);
  const humanizedTexts = useSpaceStore((s) => s.humanizedTexts);
  const humanized = agent.lastAction ? humanizedTexts[agent.lastAction] : undefined;
  const humanizedError = agent.errorReason ? humanizedTexts[agent.errorReason] : undefined;

  const openSession = useCallback(async () => {
    if (!agent.sessionMeta) return;
    try {
      const res = await fetch('http://localhost:3002/api/open-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: agent.source, status: agent.status, sessionMeta: agent.sessionMeta }),
      });
      const data = await res.json();
      if (data.ok && agent.source === 'cursor') {
        setToast(TOAST_MESSAGES.cursor);
      } else if (data.ok && data.resumed) {
        setToast('Resuming session in Terminal');
      } else if (data.ok) {
        setToast('Opened project directory in Terminal');
      } else {
        setToast(`Failed: ${data.error}`);
      }
    } catch {
      setToast('Could not connect to server');
    }
    setTimeout(() => setToast(null), 3000);
  }, [agent.source, agent.status, agent.sessionMeta]);

  const dotColor = STATUS_DOT_COLORS[agent.status] || '#666';
  const dotGlow = agent.status === 'working' || agent.status === 'waiting' || agent.status === 'error'
    ? `0 0 6px ${dotColor}` : 'none';

  const badgeBg = agent.status === 'waiting' ? 'rgba(255,170,68,0.15)'
    : agent.status === 'error' ? 'rgba(255,68,68,0.15)'
    : 'rgba(255,255,255,0.06)';

  const badgeColor = agent.status === 'waiting' ? '#ffaa44'
    : agent.status === 'error' ? '#ff4444'
    : '#aaa';

  return (
    <div
      onClick={openSession}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={agent.sessionMeta ? 'Click to open session' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px 14px',
        background: hovered
          ? `linear-gradient(135deg, ${accentColor}14, ${identity.gradient[1]}10)`
          : `linear-gradient(135deg, ${accentColor}08, ${identity.gradient[1]}06)`,
        borderRadius: '8px',
        borderLeft: `3px solid ${accentColor}`,
        cursor: agent.sessionMeta ? 'pointer' : 'default',
        transition: 'background 0.15s ease',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: identity.avatarBorderRadius,
              background: `linear-gradient(135deg, ${identity.gradient[0]}, ${identity.gradient[1]})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 700,
              color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              flexShrink: 0,
              boxShadow: `0 0 10px ${accentColor}44`,
            }}
          >
            {identity.initial}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#e0e0e0' }}>
                {identity.name}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  color: sourceColor,
                  fontWeight: 500,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: `${sourceColor}18`,
                }}
              >
                {sourceLabel}
              </span>
            </div>
            {agent.title && (
              <span style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', lineHeight: 1.2 }}>
                {agent.title}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: dotColor,
              boxShadow: dotGlow,
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '10px',
              background: badgeBg,
              color: badgeColor,
            }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      <div style={{ fontSize: '12px', color: '#c0c0c0', lineHeight: '1.4', paddingLeft: '42px' }}>
        {agent.status === 'error' && agent.errorReason
          ? (humanLingo ? (humanizedError || agent.errorReason) : agent.errorReason)
          : humanLingo
            ? (humanized || agent.lastAction || '')
            : (agent.lastAction || '')}
      </div>

      {toast && (
        <div
          style={{
            position: 'absolute',
            bottom: '-32px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.85)',
            color: '#e0e0e0',
            fontSize: '11px',
            padding: '5px 12px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            zIndex: 200,
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
