import { useSocket } from './hooks/useSocket';
import { SpaceScene } from './scene/SpaceScene';
import { HUD } from './ui/HUD';
import { Sidebar } from './ui/Sidebar';
import { HookSetupCard } from './ui/HookSetupCard';
import { useBriefProject } from './ui/useBriefProject';
import { useSpaceStore } from './store';

/**
 * The landed project, and the side effects that belong to being landed.
 *
 * Renders nothing itself. Everything about a landed project now lives in the
 * world — goals ride above the work parties, questions above the agent asking
 * them — so the only thing left at this level is keeping the briefing current.
 */
function LandedContext() {
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const projects = useSpaceStore((s) => s.projects);
  const project = projects.find((p) => p.id === selectedId);

  useBriefProject(project);
  return null;
}

export function App() {
  useSocket();

  return (
    <>
      <SpaceScene />
      <Sidebar />
      <HUD />
      <LandedContext />
      <HookSetupCard />
    </>
  );
}
