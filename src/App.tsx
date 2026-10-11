import { lazy, Suspense } from 'react';
import { useSocket } from './hooks/useSocket';
import { HUD } from './ui/HUD';
import { ProjectPanel } from './ui/ProjectPanel';
import { Sidebar } from './ui/Sidebar';
import { HookSetupCard } from './ui/HookSetupCard';

const SpaceScene = lazy(() =>
  import('./scene/SpaceScene').then((module) => ({ default: module.SpaceScene })),
);

export function App() {
  useSocket();

  return (
    <>
      <Suspense fallback={null}>
        <SpaceScene />
      </Suspense>
      <Sidebar />
      <HUD />
      <ProjectPanel />
      <HookSetupCard />
    </>
  );
}
