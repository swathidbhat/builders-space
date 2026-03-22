import { useSpaceStore } from '../store';

export function HUD() {
  const projects = useSpaceStore((s) => s.projects);
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const sidebarOpen = useSpaceStore((s) => s.sidebarOpen);

  const totalAgents = projects.reduce((sum, p) => sum + p.agents.length, 0);
  const workingAgents = projects.reduce(
    (sum, p) => sum + p.agents.filter((a) => a.status === 'working').length,
    0,
  );
  const waitingAgents = projects.reduce(
    (sum, p) => sum + p.agents.filter((a) => a.status === 'waiting').length,
    0,
  );
  const errorAgents = projects.reduce(
    (sum, p) => sum + p.agents.filter((a) => a.status === 'error').length,
    0,
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: sidebarOpen ? '200px' : 0,
        right: selectedId ? '420px' : 0,
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 50,
        fontFamily: "'Space Grotesk', sans-serif",
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(5,5,15,0.85) 0%, rgba(5,5,15,0.4) 70%, transparent 100%)',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: '#fff',
            margin: 0,
            fontFamily: "'Orbitron', sans-serif",
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textShadow: '0 0 20px rgba(100,150,255,0.3)',
          }}
        >
          Builders Space
        </h1>
        <div
          style={{
            fontSize: '11px',
            color: '#556',
            marginTop: '2px',
            letterSpacing: '0.05em',
          }}
        >
          {projects.length === 0
            ? 'Scanning for planets...'
            : `${projects.length} ${projects.length === 1 ? 'planet' : 'planets'} discovered`}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        <HUDCounter label="Agents" value={totalAgents} />
        <HUDCounter label="Working" value={workingAgents} color="#44ffaa" />
        {waitingAgents > 0 && (
          <HUDCounter label="Awaiting you" value={waitingAgents} color="#ffaa44" pulse />
        )}
        {errorAgents > 0 && (
          <HUDCounter label="Errors" value={errorAgents} color="#ff4444" pulse />
        )}
      </div>
    </div>
  );
}

function HUDCounter({
  label,
  value,
  color,
  pulse,
}: {
  label: string;
  value: number;
  color?: string;
  pulse?: boolean;
}) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div
        style={{
          fontSize: '20px',
          fontWeight: 700,
          color: color || '#e0e0e0',
          textShadow: color ? `0 0 10px ${color}44` : 'none',
          animation: pulse ? 'hudPulse 2s ease infinite' : 'none',
        }}
      >
        {value}
        <style>{`
          @keyframes hudPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}</style>
      </div>
      <div
        style={{
          fontSize: '9px',
          color: '#556',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </div>
    </div>
  );
}
