import { useMemo } from 'react';
import { useSpaceStore } from '../store';
import { AgentCard } from './AgentCard';
import { getProjectAgentIdentities } from './agentIdentity';
import { HumanLingoToggle } from './HumanLingoToggle';
import { PlanetSurface } from './PlanetSurface';
import { ProjectPanelHeader } from './ProjectPanelHeader';
import { ProjectStats } from './ProjectStats';
import { useProjectHumanize } from './useProjectHumanize';
import { compareAgentStatus } from '../../shared/status';
import styles from './ProjectPanel.module.css';

export function ProjectPanel() {
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const projects = useSpaceStore((s) => s.projects);
  const deselectPlanet = useSpaceStore((s) => s.deselectPlanet);
  const humanLingo = useSpaceStore((s) => s.humanLingo);
  const toggleHumanLingo = useSpaceStore((s) => s.toggleHumanLingo);

  const project = projects.find((item) => item.id === selectedId);
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

  if (!project) return null;

  return (
    <aside className={styles.panel} aria-label="Project details">
      <ProjectPanelHeader name={project.name} path={project.path} onClose={deselectPlanet} />
      <ProjectStats agents={project.agents} />
      <PlanetSurface agents={project.agents} projectName={project.name} identities={identities} />

      <div>
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
    </aside>
  );
}
