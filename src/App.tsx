import { useSocket } from './hooks/useSocket';
import { SpaceScene } from './scene/SpaceScene';
import { HUD } from './ui/HUD';
import { ProjectPanel } from './ui/ProjectPanel';
import { Sidebar } from './ui/Sidebar';
import { HookSetupCard } from './ui/HookSetupCard';

export function App() {
  useSocket();

  return (
    <>
      <SpaceScene />
      <Sidebar />
      <HUD />
      <ProjectPanel />
      <HookSetupCard />
    </>
  );
}
