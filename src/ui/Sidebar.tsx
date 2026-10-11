import { useEffect, useMemo, useState } from 'react';
import { dominantStatus, projectStatusColor } from '../../shared/status';
import { prettifyName } from '../prettifyName';
import { useSpaceStore } from '../store';
import { needsYouRows, projectsByUrgency } from './attention';
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
  const compact = useCompactLayout();
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    if (!compact) setOverlayOpen(false);
  }, [compact]);

  const open = compact ? overlayOpen : sidebarOpen;
  const toggle = () => {
    if (compact) setOverlayOpen((value) => !value);
    else toggleSidebar();
  };

  const needsYou = useMemo(() => needsYouRows(projects), [projects]);
  const sorted = useMemo(() => projectsByUrgency(projects), [projects]);

  if (!open) {
    return (
      <nav id="projects-nav" aria-label="Projects">
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
    <nav id="projects-nav" aria-label="Projects" className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.heading}>Projects</span>
        <button type="button" className={styles.close} aria-label="Close projects" onClick={toggle}>
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className={styles.list}>
        {needsYou.length > 0 && (
          <section aria-label="Needs you">
            <div className={styles.section}>Needs you</div>
            {needsYou.map((row) => {
              const isSelected = row.projectId === selectedId;
              const dotColor = row.status === 'error' ? '#ff4444' : '#ffaa44';
              return (
                <button
                  key={row.agentId}
                  type="button"
                  className={isSelected ? `${styles.urgent} ${styles.selected}` : styles.urgent}
                  title={row.detail}
                  onClick={() => select(row.projectId)}
                >
                  <span className={styles.urgentTop}>
                    <span
                      className={styles.dot}
                      aria-hidden="true"
                      style={cssVars({
                        '--dot': dotColor,
                        '--dot-glow': `0 0 6px ${dotColor}66`,
                      })}
                    />
                    <span className={styles.glyph} aria-hidden="true">
                      {STATUS_MARK[row.status]}
                    </span>
                    <span className="sr-only">{STATUS_WORD[row.status]}</span>
                    <span className={styles.urgentProject}>{prettifyName(row.projectName)}</span>
                    <span className={styles.urgentTime}>{row.duration}</span>
                  </span>
                  <span className={styles.urgentTask}>{row.task}</span>
                  {row.detail !== row.task && (
                    <span className={styles.urgentDetail}>{row.detail}</span>
                  )}
                </button>
              );
            })}
          </section>
        )}

        <section aria-label="All projects">
          {sorted.map((project) => {
            const isSelected = project.id === selectedId;
            const dotColor = projectStatusColor(project.agents);

            const status = dominantStatus(project.agents);
            return (
              <button
                key={project.id}
                type="button"
                className={isSelected ? `${styles.item} ${styles.selected}` : styles.item}
                onClick={() => select(project.id)}
              >
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
                <span className="sr-only">{STATUS_WORD[status]}</span>
                <span
                  className={isSelected ? `${styles.name} ${styles.selectedName}` : styles.name}
                >
                  {prettifyName(project.name)}
                </span>
                {project.agents.length > 0 && (
                  <span className={styles.count}>{project.agents.length}</span>
                )}
              </button>
            );
          })}
        </section>
      </div>
    </nav>
  );
}
