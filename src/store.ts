import { create } from 'zustand';
import type { ProjectInfo, SpaceData } from './types';

interface SpaceStore {
  projects: ProjectInfo[];
  lastUpdated: number;
  selectedPlanetId: string | null;
  cameraMode: 'space' | 'planet';
  sidebarOpen: boolean;
  humanLingo: boolean;
  humanizedTexts: Record<string, string>;

  setData: (data: SpaceData) => void;
  selectPlanet: (id: string) => void;
  deselectPlanet: () => void;
  toggleSidebar: () => void;
  toggleHumanLingo: () => void;
  setHumanizedTexts: (texts: Record<string, string>) => void;
}

export const useSpaceStore = create<SpaceStore>((set) => ({
  projects: [],
  lastUpdated: 0,
  selectedPlanetId: null,
  cameraMode: 'space',
  sidebarOpen: true,
  humanLingo: true,
  humanizedTexts: {},

  setData: (data) =>
    set({
      projects: data.projects.filter(p => p.agents.length > 0),
      lastUpdated: data.lastUpdated,
    }),

  selectPlanet: (id) =>
    set({ selectedPlanetId: id, cameraMode: 'planet' }),

  deselectPlanet: () =>
    set({ selectedPlanetId: null, cameraMode: 'space' }),

  toggleSidebar: () =>
    set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  toggleHumanLingo: () =>
    set((s) => ({ humanLingo: !s.humanLingo })),

  setHumanizedTexts: (texts) =>
    set((s) => ({ humanizedTexts: { ...s.humanizedTexts, ...texts } })),
}));
