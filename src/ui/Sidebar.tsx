import { useMemo } from 'react';
import { projectStatusColor } from '../../shared/status';
import { prettifyName } from '../prettifyName';
import { useSpaceStore } from '../store';
import { needsYouRows, projectsByUrgency } from './attention';
import { cssVars } from './cssVars';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const projects = useSpaceStore((s) => s.projects);
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const selectPlanet = useSpaceStore((s) => s.selectPlanet);
  const deselectPlanet = useSpaceStore((s) => s.deselectPlanet);
  const sidebarOpen = useSpaceStore((s) => s.sidebarOpen);
  const toggleSidebar = useSpaceStore((s) => s.toggleSidebar);

  const needsYou = useMemo(() => needsYouRows(projects), [projects]);
  const sorted = useMemo(() => projectsByUrgency(projects), [projects]);

  if (!sidebarOpen) {
    return (
      <button className={styles.collapsed} onClick={toggleSidebar}>
        ☰
      </button>
    );
  }

  const select = (id: string) => {
    if (id === selectedId) deselectPlanet();
    else selectPlanet(id);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.heading}>Projects</span>
        <button className={styles.close} onClick={toggleSidebar}>
          ×
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
                  className={isSelected ? `${styles.urgent} ${styles.selected}` : styles.urgent}
                  title={row.detail}
                  onClick={() => select(row.projectId)}
                >
                  <span className={styles.urgentTop}>
                    <span
                      className={styles.dot}
                      style={cssVars({
                        '--dot': dotColor,
                        '--dot-glow': `0 0 6px ${dotColor}66`,
                      })}
                    />
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

            return (
              <button
                key={project.id}
                className={isSelected ? `${styles.item} ${styles.selected}` : styles.item}
                onClick={() => select(project.id)}
              >
                <span
                  className={styles.dot}
                  style={cssVars({
                    '--dot': dotColor,
                    '--dot-glow': `0 0 6px ${dotColor}66`,
                  })}
                />
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
    </div>
  );
}
