import { useEffect, useRef } from 'react';
import { useSpaceStore } from '../store';
import { cssVars } from './cssVars';
import {
  DISCONNECT_BANNER,
  LOADING_SKY,
  NO_SESSIONS,
  planetSubtitle,
  SEARCHING_SKY,
  skyPhase,
} from './skyCopy';
import { useCompactLayout } from './useCompactLayout';
import { useSkyClock } from './useSkyClock';
import styles from './HUD.module.css';

export function HUD() {
  const projects = useSpaceStore((s) => s.projects);
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const sidebarOpen = useSpaceStore((s) => s.sidebarOpen);
  const compact = useCompactLayout();
  const connection = useSpaceStore((s) => s.connection);
  const dataStale = useSpaceStore((s) => s.dataStale);
  const snapshotSeen = useSpaceStore((s) => s.snapshotSeen);
  const scanStartedAt = useSpaceStore((s) => s.scanStartedAt);
  const now = useSkyClock();
  const phase = skyPhase({
    connection,
    projectCount: projects.length,
    snapshotSeen,
    scanStartedAt,
    now,
  });
  const subtitle =
    projects.length > 0
      ? planetSubtitle(projects.length, dataStale || connection === 'stale')
      : phase === 'retrying'
        ? DISCONNECT_BANNER
        : phase === 'searching'
          ? SEARCHING_SKY
          : phase === 'empty'
            ? NO_SESSIONS
            : LOADING_SKY;

  const totalAgents = projects.reduce((sum, project) => sum + project.agents.length, 0);
  const workingAgents = projects.reduce(
    (sum, project) => sum + project.agents.filter((agent) => agent.status === 'working').length,
    0,
  );
  const waitingAgents = projects.reduce(
    (sum, project) => sum + project.agents.filter((agent) => agent.status === 'waiting').length,
    0,
  );
  const errorAgents = projects.reduce(
    (sum, project) => sum + project.agents.filter((agent) => agent.status === 'error').length,
    0,
  );

  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const apply = () => {
      document.documentElement.style.setProperty(
        '--hud-bottom',
        `${Math.ceil(header.getBoundingClientRect().height)}px`,
      );
    };
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, [projects, connection, compact, selectedId, phase]);

  const hudClass = [
    styles.hud,
    compact ? styles.compact : '',
    !compact && sidebarOpen ? styles.withSidebar : '',
    !compact && selectedId ? styles.withPanel : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header ref={headerRef} className={hudClass} data-overlay="hud">
      <div>
        <h1 className={styles.title}>Builders Space</h1>
        <div className={styles.subtitle}>{subtitle}</div>
      </div>
      <div
        className={styles.counters}
        data-counters=""
        title={`${totalAgents} ${totalAgents === 1 ? 'agent' : 'agents'} · ${workingAgents} working`}
      >
        {waitingAgents > 0 && (
          <HUDCounter label="Needs you" value={waitingAgents} color="#ffaa44" pulse />
        )}
        {errorAgents > 0 && <HUDCounter label="Errors" value={errorAgents} color="#ff4444" pulse />}
      </div>
    </header>
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
    <div className={styles.counter}>
      <div
        className={pulse ? `${styles.value} ${styles.pulse}` : styles.value}
        style={cssVars({
          '--counter': color || '#e0e0e0',
          '--counter-glow': color ? `0 0 10px ${color}44` : 'none',
        })}
      >
        {value}
      </div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
