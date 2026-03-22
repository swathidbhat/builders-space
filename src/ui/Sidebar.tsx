import { useMemo } from 'react';
import { useSpaceStore } from '../store';

function prettifyName(raw: string): string {
  return raw
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getStatusColor(project: { agents: { status: string }[] }): string {
  const hasError = project.agents.some((a) => a.status === 'error');
  if (hasError) return '#ff4444';
  const hasWaiting = project.agents.some((a) => a.status === 'waiting');
  if (hasWaiting) return '#ffaa44';
  const hasWorking = project.agents.some((a) => a.status === 'working');
  if (hasWorking) return '#44ffaa';
  if (project.agents.length > 0) return '#6688aa';
  return '#444';
}

export function Sidebar() {
  const projects = useSpaceStore((s) => s.projects);
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const selectPlanet = useSpaceStore((s) => s.selectPlanet);
  const deselectPlanet = useSpaceStore((s) => s.deselectPlanet);
  const sidebarOpen = useSpaceStore((s) => s.sidebarOpen);
  const toggleSidebar = useSpaceStore((s) => s.toggleSidebar);

  const sorted = useMemo(
    () =>
      [...projects].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [projects],
  );

  if (!sidebarOpen) {
    return (
      <button
        onClick={toggleSidebar}
        style={{
          position: 'fixed',
          top: '60px',
          left: '12px',
          zIndex: 60,
          background: 'rgba(10,10,30,0.7)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(100,140,255,0.12)',
          borderRadius: '8px',
          color: '#8899bb',
          fontSize: '16px',
          width: '36px',
          height: '36px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Space Grotesk', sans-serif",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(30,30,60,0.85)';
          e.currentTarget.style.color = '#ccd';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(10,10,30,0.7)';
          e.currentTarget.style.color = '#8899bb';
        }}
      >
        ☰
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '200px',
        height: '100vh',
        background:
          'linear-gradient(180deg, rgba(10,10,30,0.92), rgba(5,5,20,0.96))',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(100,140,255,0.08)',
        zIndex: 60,
        fontFamily: "'Space Grotesk', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        animation: 'sidebarIn 0.25s ease',
      }}
    >
      <style>{`
        @keyframes sidebarIn {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      <div
        style={{
          padding: '14px 14px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(100,140,255,0.06)',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            color: '#667',
            textTransform: 'uppercase',
            fontFamily: "'Orbitron', sans-serif",
            letterSpacing: '0.1em',
          }}
        >
          Projects
        </span>
        <button
          onClick={toggleSidebar}
          style={{
            background: 'none',
            border: 'none',
            color: '#556',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '0 2px',
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#aab';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#556';
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 0',
        }}
      >
        {sorted.map((p) => {
          const isSelected = p.id === selectedId;
          const dotColor = getStatusColor(p);

          return (
            <button
              key={p.id}
              onClick={() => {
                if (isSelected) {
                  deselectPlanet();
                } else {
                  selectPlanet(p.id);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '7px 14px',
                background: isSelected
                  ? 'rgba(100,140,255,0.12)'
                  : 'transparent',
                border: 'none',
                borderLeft: isSelected
                  ? '2px solid rgba(100,140,255,0.5)'
                  : '2px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: "'Space Grotesk', sans-serif",
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isSelected)
                  e.currentTarget.style.background =
                    'rgba(100,140,255,0.06)';
              }}
              onMouseLeave={(e) => {
                if (!isSelected)
                  e.currentTarget.style.background = 'transparent';
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: dotColor,
                  boxShadow: `0 0 6px ${dotColor}66`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? '#dde' : '#99a',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {prettifyName(p.name)}
              </span>
              {p.agents.length > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    color: '#556',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {p.agents.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
