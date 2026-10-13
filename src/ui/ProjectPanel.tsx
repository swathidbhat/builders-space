import { useEffect, useMemo, useRef } from 'react';
import { useSpaceStore } from '../store';
import { AgentCard } from './AgentCard';
import { getProjectAgentIdentities } from './agentIdentity';
import { HumanLingoToggle } from './HumanLingoToggle';
import { PlanetSurface } from './PlanetSurface';
import { ProjectPanelHeader } from './ProjectPanelHeader';
import { projectStatsText } from './projectStatsText';
import { useProjectHumanize } from './useProjectHumanize';
import { compareAgentStatus } from '../../shared/status';
import styles from './ProjectPanel.module.css';

export function ProjectPanel() {
  const project = useSpaceStore((s) =>
    s.selectedPlanetId ? s.projects.find((item) => item.id === s.selectedPlanetId) : undefined,
  );
  const deselectPlanet = useSpaceStore((s) => s.deselectPlanet);
  const humanLingo = useSpaceStore((s) => s.humanLingo);
  const toggleHumanLingo = useSpaceStore((s) => s.toggleHumanLingo);

  useProjectHumanize(project, humanLingo);

  const identities = useMemo(
    () =>
      project ? getProjectAgentIdentities(project.agents.map((agent) => agent.id)) : new Map(),
    [project],
  );

  const sortedAgents = useMemo(
    () =>
      project ? [...project.agents].sort((a, b) => compareAgentStatus(a.status, b.status)) : [],
    [project],
  );

  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, [project?.id]);

  if (!project) return null;

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className={styles.panel}
      aria-label="Project details"
      data-overlay="panel"
    >
      <ProjectPanelHeader
        name={project.name}
        path={project.path}
        summary={projectStatsText(project.agents)}
        onClose={deselectPlanet}
      />
      <div className={styles.agents}>
        <div className={styles.agentsHead}>
          <div className={styles.agentsLabel}>Agents</div>
          <HumanLingoToggle humanLingo={humanLingo} onToggle={toggleHumanLingo} />
        </div>

        {project.agents.length === 0 ? (
          <div className={styles.empty}>No active agents on this planet</div>
        ) : (
          <div className={styles.list}>
            {sortedAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                identity={identities.get(agent.id)!}
                humanLingo={humanLingo}
              />
            ))}
          </div>
        )}
      </div>
      <div className={styles.surface} data-pixel-surface="">
        <PlanetSurface agents={project.agents} projectName={project.name} identities={identities} />
      </div>
    </aside>
  );
}
