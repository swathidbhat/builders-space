import type { PlanetState } from '../../shared/status';
import { prettifyName } from '../prettifyName';
import { useSpaceStore } from '../store';
import { cssVars } from '../ui/cssVars';
import { DomLabel } from './DomLabel';
import { labelPriority } from './labelPlacement';
import styles from './PlanetLabel.module.css';

const stateStyles: Record<
  PlanetState,
  { color: string; glow: string; suffix: string; word: string }
> = {
  active: { color: '#44ffaa', glow: '0 1px 1px rgba(0,0,0,0.9)', suffix: '', word: 'Working' },
  idle: {
    color: 'rgba(200,220,255,0.85)',
    glow: '0 1px 1px rgba(0,0,0,0.9)',
    suffix: '',
    word: 'Done',
  },
  waiting: {
    color: '#ffcc77',
    glow: '0 1px 1px rgba(0,0,0,0.9)',
    suffix: ' \u2022 needs you',
    word: 'Needs you',
  },
  error: {
    color: '#ff8d8d',
    glow: '0 1px 1px rgba(0,0,0,0.9)',
    suffix: ' \u2022 error',
    word: 'Error',
  },
};

interface PlanetLabelProps {
  projectId: string;
  name: string;
  agentCount: number;
  planetState: PlanetState;
  yOffset: number;
}

export function PlanetLabel({
  projectId,
  name,
  agentCount,
  planetState,
  yOffset,
}: PlanetLabelProps) {
  const style = stateStyles[planetState];
  const selected = useSpaceStore((s) => s.selectedPlanetId === projectId);
  const hovered = useSpaceStore((s) => s.hoveredPlanetId === projectId);
  const pretty = prettifyName(name);
  const tip = `${pretty} · ${style.word} · ${agentCount} ${agentCount === 1 ? 'agent' : 'agents'}`;

  return (
    <DomLabel
      position={[0, yOffset + 0.3, 0]}
      distanceFactor={10}
      labelId={projectId}
      priority={labelPriority(planetState, selected)}
    >
      <div
        className={hovered ? `${styles.label} ${styles.hot}` : styles.label}
        data-planet-label=""
        title={tip}
      >
        <div className={styles.name} data-planet-name="">
          {pretty}
        </div>
        {agentCount > 0 && (
          <div
            className={styles.count}
            style={cssVars({ '--state-color': style.color, '--state-glow': style.glow })}
          >
            {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
            {style.suffix}
          </div>
        )}
        {hovered && (
          <div className={styles.tip} role="tooltip">
            {tip}
          </div>
        )}
      </div>
    </DomLabel>
  );
}
