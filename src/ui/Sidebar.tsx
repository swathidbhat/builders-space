import { useEffect, useMemo, useState } from 'react';
import { dominantStatus, projectStatusColor } from '../../shared/status';
import { prettifyName } from '../prettifyName';
import { useSpaceStore } from '../store';
import {
  needsYouRows,
  projectsByUrgency,
  questionOverflows,
  type ActivityClock,
  type AttentionRow,
} from './attention';
import { cssVars } from './cssVars';
import { STATUS_MARK, STATUS_WORD } from './statusCue';
import { useCompactLayout } from './useCompactLayout';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const projects = useSpaceStore((s) => s.projects);
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const selectPlanet = useSpaceStore((s) => s.selectPlanet);
  const deselectPlanet = useSpaceStore((s) => s.deselectPlanet);
  const sidebarOpen = useSpaceStore((s) => s.sidebarOpen);
  const toggleSidebar = useSpaceStore((s) => s.toggleSidebar);
  const connection = useSpaceStore((s) => s.connection);
  const dataStale = useSpaceStore((s) => s.dataStale);
  const lastUpdated = useSpaceStore((s) => s.lastUpdated);
  const compact = useCompactLayout();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!compact) setOverlayOpen(false);
  }, [compact]);

  useEffect(() => {
    useSpaceStore.getState().setSidebarOverlay(compact && overlayOpen);
    return () => useSpaceStore.getState().setSidebarOverlay(false);
  }, [compact, overlayOpen]);

  const open = compact ? overlayOpen : sidebarOpen;
  const toggle = () => {
    if (compact) setOverlayOpen((value) => !value);
    else toggleSidebar();
  };

  const clock = useMemo<ActivityClock>(
    () => ({
      disconnected: connection === 'stale' || dataStale,
      asOfMs: lastUpdated > 0 ? lastUpdated : undefined,
    }),
    [connection, dataStale, lastUpdated],
  );
  const attention = useMemo(() => {
    const rows = new Map<string, AttentionRow>();
    for (const row of needsYouRows(projects, Date.now(), clock)) rows.set(row.projectId, row);
    return rows;
  }, [projects, clock]);
  const sorted = useMemo(() => projectsByUrgency(projects), [projects]);

  if (!open) {
    return (
      <nav id="projects-nav" aria-label="Projects" data-overlay="projects">
        <button
          type="button"
          className={styles.collapsed}
          aria-label="Open projects"
          onClick={toggle}
        >
          <span aria-hidden="true">☰</span>
        </button>
      </nav>
    );
  }

  const select = (id: string) => {
    if (id === selectedId) deselectPlanet();
    else selectPlanet(id);
  };

  return (
    <nav id="projects-nav" aria-label="Projects" className={styles.panel} data-overlay="projects">
      <div className={styles.head}>
        <span className={styles.heading}>Projects</span>
        <button type="button" className={styles.close} aria-label="Close projects" onClick={toggle}>
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className={styles.list}>
        {sorted.map((project) => {
          const row = attention.get(project.id);
          const status = row?.status ?? dominantStatus(project.agents);
          const isSelected = project.id === selectedId;
          const dotColor = projectStatusColor(project.agents);
          const pretty = prettifyName(project.name);
          const accessible = row
            ? `${STATUS_WORD[row.status]}: ${pretty}. ${row.duration}. ${row.detail}`
            : `${STATUS_WORD[status]}: ${pretty}. ${project.agents.length} ${
                project.agents.length === 1 ? 'agent' : 'agents'
              }`;
          const title = row ? `${pretty}. ${row.duration}. ${row.detail}` : pretty;
          const openQuestion = Boolean(expanded[project.id]);
          const canExpand = Boolean(row && questionOverflows(row.detail));
          return (
            <div
              key={project.id}
              className={isSelected ? `${styles.item} ${styles.selected}` : styles.item}
            >
              <button
                type="button"
                className={styles.hit}
                title={title}
                aria-label={accessible}
                onClick={() => select(project.id)}
              >
                <span className={styles.nameLine}>
                  <span
                    className={styles.dot}
                    aria-hidden="true"
                    style={cssVars({
                      '--dot': dotColor,
                      '--dot-glow': `0 0 6px ${dotColor}66`,
                    })}
                  />
                  <span className={styles.glyph} aria-hidden="true">
                    {STATUS_MARK[status]}
                  </span>
                  <span
                    className={isSelected ? `${styles.name} ${styles.selectedName}` : styles.name}
                    data-project-name=""
                  >
                    {pretty}
                  </span>
                  {!row && project.agents.length > 0 && (
                    <span className={styles.count}>{project.agents.length}</span>
                  )}
                </span>
                {row && (
                  <>
                    <span
                      className={openQuestion ? styles.reasonOpen : styles.reason}
                      data-project-reason=""
                      data-expanded={openQuestion ? 'true' : 'false'}
                    >
                      {row.detail}
                    </span>
                    <span className={styles.time} data-project-time="">
                      {row.duration}
                    </span>
                  </>
                )}
              </button>
              {canExpand && (
                <button
                  type="button"
                  className={styles.more}
                  aria-expanded={openQuestion}
                  onClick={() =>
                    setExpanded((current) => ({ ...current, [project.id]: !current[project.id] }))
                  }
                >
                  {openQuestion ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
