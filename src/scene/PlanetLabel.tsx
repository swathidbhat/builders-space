import type { PlanetState } from './Planet';
import { DomLabel } from './DomLabel';
import { prettifyName } from '../prettifyName';
import { cssVars } from '../ui/cssVars';
import styles from './PlanetLabel.module.css';

const stateStyles: Record<PlanetState, { color: string; glow: string; suffix: string }> = {
  active: { color: '#44ffaa', glow: '0 0 8px rgba(68,255,170,0.6)', suffix: '' },
  idle: { color: 'rgba(200,220,255,0.5)', glow: 'none', suffix: '' },
  waiting: { color: '#ffaa44', glow: '0 0 8px rgba(255,170,68,0.7)', suffix: ' \u2022 needs you' },
  error: { color: '#ff4444', glow: '0 0 8px rgba(255,68,68,0.7)', suffix: ' \u2022 error' },
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
    <DomLabel position={[0, yOffset + 0.3, 0]} distanceFactor={10}>
      <div className={styles.label}>
        <div className={styles.name}>{prettifyName(name)}</div>
        {agentCount > 0 && (
          <div
            className={styles.count}
            style={cssVars({ '--state-color': style.color, '--state-glow': style.glow })}
          >
            {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
            {style.suffix}
          </div>
        )}
      </div>
    </DomLabel>
  );
}
