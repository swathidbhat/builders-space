import { useMemo } from 'react';
import { projectStatusColor } from '../../shared/status';
import { prettifyName } from '../prettifyName';
import { useSpaceStore } from '../store';
import { cssVars } from './cssVars';
import styles from './Sidebar.module.css';

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
      <button className={styles.collapsed} onClick={toggleSidebar}>
        ☰
      </button>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.heading}>Projects</span>
        <button className={styles.close} onClick={toggleSidebar}>
          ×
        </button>
      </div>

      <div className={styles.list}>
        {sorted.map((project) => {
          const isSelected = project.id === selectedId;
          const dotColor = projectStatusColor(project.agents);

          return (
            <button
              key={project.id}
              className={isSelected ? `${styles.item} ${styles.selected}` : styles.item}
              onClick={() => {
                if (isSelected) deselectPlanet();
                else selectPlanet(project.id);
              }}
            >
              <span
                className={styles.dot}
                style={cssVars({
                  '--dot': dotColor,
                  '--dot-glow': `0 0 6px ${dotColor}66`,
                })}
              />
              <span className={isSelected ? `${styles.name} ${styles.selectedName}` : styles.name}>
                {prettifyName(project.name)}
              </span>
              {project.agents.length > 0 && (
                <span className={styles.count}>{project.agents.length}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
