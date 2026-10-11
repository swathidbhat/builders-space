import { lazy, Suspense } from 'react';
import { useSocket } from './hooks/useSocket';
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

  return (
    <>
      <Suspense fallback={<SkyLoading />}>
        <SpaceScene />
      </Suspense>
      <SkyStatus />
      <Sidebar />
      <HUD />
      <ProjectPanel />
      <HookSetupCard />
      <AssistantNotice />
      <StatusLegend />
    </>
  );
}
