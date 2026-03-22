import { useMemo, useEffect, useRef } from 'react';
import { useSpaceStore } from '../store';
import { AgentCard } from './AgentCard';
import { getProjectAgentIdentities } from './agentIdentity';
import { PlanetSurface } from './PlanetSurface';
import { requestHumanize } from '../hooks/useSocket';
import type { AgentStatus } from '../types';

const STATUS_PRIORITY: Record<AgentStatus, number> = {
  error: 0,
  waiting: 1,
  working: 2,
  done: 3,
};

export function ProjectPanel() {
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const projects = useSpaceStore((s) => s.projects);
  const deselectPlanet = useSpaceStore((s) => s.deselectPlanet);
  const humanLingo = useSpaceStore((s) => s.humanLingo);
  const toggleHumanLingo = useSpaceStore((s) => s.toggleHumanLingo);

  const setHumanizedTexts = useSpaceStore((s) => s.setHumanizedTexts);
  const humanizedTexts = useSpaceStore((s) => s.humanizedTexts);

  const project = projects.find((p) => p.id === selectedId);

  const identities = useMemo(
    () => project ? getProjectAgentIdentities(project.agents.map((a) => a.id)) : new Map(),
    [project?.agents],
  );

  const sortedAgents = useMemo(
    () => project ? [...project.agents].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]) : [],
    [project?.agents],
  );

  const lastHumanizeRef = useRef<string>('');

  useEffect(() => {
    if (!project || !humanLingo) return;

    const rawTexts = project.agents
      .flatMap(a => [a.lastAction, a.errorReason].filter(Boolean) as string[])
      .filter(t => !humanizedTexts[t])
      .filter((t, i, arr) => arr.indexOf(t) === i);

    if (rawTexts.length === 0) return;

    const key = rawTexts.sort().join('|');
    if (key === lastHumanizeRef.current) return;
    lastHumanizeRef.current = key;

    requestHumanize(rawTexts).then((result) => {
      if (Object.keys(result.texts).length > 0) {
        setHumanizedTexts(result.texts);
      }
    });
  }, [project, humanLingo, humanizedTexts, setHumanizedTexts]);

  if (!project) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '420px',
        height: '100vh',
        background: 'linear-gradient(135deg, rgba(10,10,30,0.95), rgba(5,5,20,0.98))',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(100,140,255,0.1)',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto',
        zIndex: 100,
        fontFamily: "'Space Grotesk', sans-serif",
        animation: 'slideIn 0.3s ease',
      }}
    >
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2
            style={{
              fontSize: '18px',
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              color: '#fff',
              margin: 0,
              letterSpacing: '0.02em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {project.name}
          </h2>
          <div
            style={{
              fontSize: '11px',
              color: '#666',
              marginTop: '4px',
              fontFamily: "'Space Mono', monospace",
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {project.path}
          </div>
        </div>
        <button
          onClick={deselectPlanet}
          style={{
            flexShrink: 0,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#aaa',
            borderRadius: '6px',
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: '12px',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = '#aaa';
          }}
        >
          ESC
        </button>
      </div>

      {/* Stats row */}
      {(() => {
        const errCount = project.agents.filter(a => a.status === 'error').length;
        const waitCount = project.agents.filter(a => a.status === 'waiting').length;
        return (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Stat label="Agents" value={String(project.agents.length)} />
            <Stat
              label="Working"
              value={String(project.agents.filter(a => a.status === 'working').length)}
              color="#44ffaa"
            />
            {errCount > 0 && (
              <Stat label="Errors" value={String(errCount)} color="#ff4444" />
            )}
            {waitCount > 0 && (
              <Stat label="Waiting" value={String(waitCount)} color="#ffaa44" />
            )}
          </div>
        );
      })()}

      {/* Planet surface visualization */}
      <PlanetSurface agents={project.agents} projectName={project.name} identities={identities} />

      {/* Agents */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div
            style={{
              fontSize: '11px',
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 500,
            }}
          >
            Agents
          </div>
          <div
            style={{
              display: 'flex',
              position: 'relative',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '2px',
              cursor: 'pointer',
              fontSize: '10px',
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: '0.02em',
            }}
            onClick={toggleHumanLingo}
          >
            <div
              style={{
                position: 'absolute',
                top: '2px',
                left: humanLingo ? 'calc(50% - 1px)' : '2px',
                width: humanLingo ? 'calc(50% + 1px)' : 'calc(50% - 1px)',
                height: 'calc(100% - 4px)',
                background: 'rgba(100,150,255,0.18)',
                border: '1px solid rgba(100,150,255,0.25)',
                borderRadius: '10px',
                transition: 'left 0.25s ease, width 0.25s ease',
              }}
            />
            <span
              style={{
                position: 'relative',
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '3px 8px',
                color: humanLingo ? '#555' : '#8ab4ff',
                transition: 'color 0.2s ease',
                userSelect: 'none',
              }}
            >
              Raw
            </span>
            <span
              style={{
                position: 'relative',
                flex: 1,
                textAlign: 'center',
                padding: '3px 8px',
                color: humanLingo ? '#8ab4ff' : '#555',
                transition: 'color 0.2s ease',
                userSelect: 'none',
              }}
            >
              Human Lingo
            </span>
          </div>
        </div>

        {project.agents.length === 0 ? (
          <div
            style={{
              fontSize: '13px',
              color: '#555',
              textAlign: 'center',
              padding: '20px',
            }}
          >
            No active agents on this planet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sortedAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} identity={identities.get(agent.id)!} humanLingo={humanLingo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: '10px 12px',
        background: color ? `${color}08` : 'rgba(255,255,255,0.03)',
        borderRadius: '8px',
        textAlign: 'center',
        minWidth: '60px',
      }}
    >
      <div
        style={{
          fontSize: '18px',
          fontWeight: 700,
          color: color || '#e0e0e0',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '10px',
          color: '#666',
          marginTop: '2px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
    </div>
  );
}
