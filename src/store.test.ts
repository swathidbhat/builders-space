import { beforeEach, describe, expect, it } from 'vitest';
import { useSpaceStore } from './store';
import type { SpaceData } from './types';

const empty = {
  projects: [],
  lastUpdated: 0,
  selectedPlanetId: null,
  cameraMode: 'space' as const,
  sidebarOpen: true,
  humanLingo: true,
  humanizedTexts: {},
};

describe('space store', () => {
  beforeEach(() => {
    useSpaceStore.setState(empty);
  });

  it('drops projects that have no agents and keeps the update time', () => {
    const data: SpaceData = {
      lastUpdated: 42,
      projects: [
        { id: 'empty', name: 'empty', path: '/tmp/empty', fileCount: 0, agents: [] },
        {
          id: 'lumen',
          name: 'lumen',
          path: '/tmp/lumen',
          fileCount: 1,
          agents: [
            {
              id: 'a',
              source: 'cursor',
              sessionId: 'a',
              status: 'working',
            },
          ],
        },
      ],
    };
    useSpaceStore.getState().setData(data);
    expect(useSpaceStore.getState().projects.map((project) => project.id)).toEqual(['lumen']);
    expect(useSpaceStore.getState().lastUpdated).toBe(42);
  });

  it('selects, deselects, and toggles sidebar and human lingo', () => {
    const store = useSpaceStore.getState();
    store.selectPlanet('lumen');
    expect(useSpaceStore.getState()).toMatchObject({
      selectedPlanetId: 'lumen',
      cameraMode: 'planet',
    });
    useSpaceStore.getState().deselectPlanet();
    expect(useSpaceStore.getState().cameraMode).toBe('space');
    useSpaceStore.getState().toggleSidebar();
    expect(useSpaceStore.getState().sidebarOpen).toBe(false);
    useSpaceStore.getState().toggleHumanLingo();
    expect(useSpaceStore.getState().humanLingo).toBe(false);
    useSpaceStore.getState().setHumanizedTexts({ 'Read:App.tsx': 'Reading the app' });
    useSpaceStore.getState().setHumanizedTexts({ 'Shell:npm test': 'Running tests' });
    expect(useSpaceStore.getState().humanizedTexts).toEqual({
      'Read:App.tsx': 'Reading the app',
      'Shell:npm test': 'Running tests',
    });
  });
});
