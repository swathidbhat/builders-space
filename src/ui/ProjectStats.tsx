import type { AgentInfo } from '../types';
import { cssVars } from './cssVars';
import styles from './ProjectPanel.module.css';

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className={styles.stat}
      style={cssVars({
        '--stat-bg': color ? `${color}08` : 'rgba(255,255,255,0.03)',
        '--stat-color': color || '#e0e0e0',
      })}
    >
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

export function ProjectStats({ agents }: { agents: AgentInfo[] }) {
  const errCount = agents.filter((agent) => agent.status === 'error').length;
  const waitCount = agents.filter((agent) => agent.status === 'waiting').length;
  const working = agents.filter((agent) => agent.status === 'working').length;

  return (
    <div className={styles.stats}>
      <Stat label="Agents" value={String(agents.length)} />
      <Stat label="Working" value={String(working)} color="#44ffaa" />
      {errCount > 0 && <Stat label="Errors" value={String(errCount)} color="#ff4444" />}
      {waitCount > 0 && <Stat label="Waiting" value={String(waitCount)} color="#ffaa44" />}
    </div>
  );
}
