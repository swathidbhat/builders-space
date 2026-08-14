import { useSpaceStore } from '../store';

export function HUD() {
  const projects = useSpaceStore((s) => s.projects);
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const deselectPlanet = useSpaceStore((s) => s.deselectPlanet);
  const landedProject = projects.find((p) => p.id === selectedId);
  const sidebarOpen = useSpaceStore((s) => s.sidebarOpen);
  const cameraMode = useSpaceStore((s) => s.cameraMode);

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
        right: 0,
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 50,
        fontFamily: "'Inter', sans-serif",
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(5,5,15,0.85) 0%, rgba(5,5,15,0.4) 70%, transparent 100%)',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: '#fff',
            margin: 0,
            // Inter wants tight tracking at display sizes; the wide uppercase
            // spacing that suited Orbitron reads as costume here.
            letterSpacing: '-0.01em',
          }}
        >
          {landedProject ? landedProject.name : 'Builders Space'}
        </h1>
        {/* Standing on a planet, the workspace-level count is not what you
            need to know — which world you are on is. */}
        <div
          style={{
            fontSize: '11px',
            color: '#fff',
            marginTop: '2px',
            letterSpacing: landedProject ? 0 : '0.05em',
            fontFamily: landedProject ? "'JetBrains Mono', monospace" : undefined,
            maxWidth: '420px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={landedProject?.path}
        >
          {landedProject
            ? landedProject.path
            : projects.length === 0
              ? 'Scanning for planets...'
              : `${projects.length} ${projects.length === 1 ? 'planet' : 'planets'} discovered`}
        </div>
      </div>

      {/* Orbital-scale awareness only. Standing on one planet, a global tally
          competes with the project in front of you, and the overlay bar's chips
          already say who is doing what here. */}
      {landedProject && (
        <button
          onClick={deselectPlanet}
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.16)',
            color: '#fff',
            borderRadius: '8px',
            padding: '7px 12px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Back to orbit
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              padding: '1px 5px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.22)',
            }}
          >
            ESC
          </span>
        </button>
      )}

      <div style={{ display: 'flex', gap: '20px', opacity: cameraMode === 'space' ? 1 : 0, transition: 'opacity 0.35s ease', position: landedProject ? 'absolute' : 'static', right: 24, pointerEvents: 'none' }}>
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
          color: '#fff',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </div>
    </div>
  );
}
