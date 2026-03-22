import { Html } from '@react-three/drei';
import type { PlanetState } from './Planet';

function prettifyName(raw: string): string {
  return raw
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const stateStyles: Record<PlanetState, { color: string; glow: string; suffix: string }> = {
  active:  { color: '#44ffaa', glow: '0 0 8px rgba(68,255,170,0.6)', suffix: '' },
  idle:    { color: 'rgba(200,220,255,0.5)', glow: 'none', suffix: '' },
  waiting: { color: '#ffaa44', glow: '0 0 8px rgba(255,170,68,0.7)', suffix: ' \u2022 needs you' },
  error:   { color: '#ff4444', glow: '0 0 8px rgba(255,68,68,0.7)', suffix: ' \u2022 error' },
};

interface PlanetLabelProps {
  name: string;
  agentCount: number;
  planetState: PlanetState;
  yOffset: number;
}

export function PlanetLabel({ name, agentCount, planetState, yOffset }: PlanetLabelProps) {
  const style = stateStyles[planetState];

  return (
    <Html
      position={[0, yOffset + 0.3, 0]}
      center
      distanceFactor={10}
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          color: '#fff',
          fontFamily: "'Space Grotesk', sans-serif",
          textAlign: 'center',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            fontSize: '16px',
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 600,
            letterSpacing: '0.05em',
            textShadow: '0 0 10px rgba(100,180,255,0.5)',
          }}
        >
          {prettifyName(name)}
        </div>
        {agentCount > 0 && (
          <div
            style={{
              fontSize: '12px',
              fontWeight: 400,
              marginTop: '2px',
              color: style.color,
              textShadow: style.glow,
            }}
          >
            {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
            {style.suffix}
          </div>
        )}
      </div>
    </Html>
  );
}
