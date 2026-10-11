import { lazy, Suspense, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { useSpaceStore } from './store';
import { HUD } from './ui/HUD';
import { ProjectPanel } from './ui/ProjectPanel';
import { Sidebar } from './ui/Sidebar';
import { HookSetupCard } from './ui/HookSetupCard';
import { SkyLoading } from './ui/SkyLoading';
import { SkyStatus } from './ui/SkyStatus';
import { AssistantNotice } from './ui/AssistantNotice';
import { StatusLegend } from './ui/StatusLegend';

const SpaceScene = lazy(() =>
  import('./scene/SpaceScene').then((module) => ({ default: module.SpaceScene })),
);

export function App() {
  useSocket();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useSpaceStore.getState().deselectPlanet();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <HUD />
      <Sidebar />
      <main className="project-sky" aria-label="Project sky" aria-describedby="projects-nav">
        <p className="sr-only">Each planet is listed by name and status in Projects.</p>
        <Suspense fallback={<SkyLoading />}>
          <SpaceScene />
        </Suspense>
        <SkyStatus />
      </main>
      <ProjectPanel />
      <HookSetupCard />
      <AssistantNotice />
      <StatusLegend />
    </>
  );
}
