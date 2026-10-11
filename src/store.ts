import { create } from 'zustand';
import { CLIENT_TRANSLATION_CACHE_MAX } from '../shared/config';
import type { ProjectInfo, SpaceData } from './types';

function rememberTranslations(
  current: Record<string, string>,
  texts: Record<string, string>,
): Record<string, string> {
  const merged = { ...current };
  for (const [key, value] of Object.entries(texts)) {
    delete merged[key];
    merged[key] = value;
  }
  const keys = Object.keys(merged);
  if (keys.length <= CLIENT_TRANSLATION_CACHE_MAX) return merged;
  const trimmed: Record<string, string> = {};
  for (const key of keys.slice(keys.length - CLIENT_TRANSLATION_CACHE_MAX)) {
    trimmed[key] = merged[key];
  }
  return trimmed;
}

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
      projects: data.projects.filter((p) => p.agents.length > 0),
      lastUpdated: data.lastUpdated,
    }),

  selectPlanet: (id) => set({ selectedPlanetId: id, cameraMode: 'planet' }),

  deselectPlanet: () => set({ selectedPlanetId: null, cameraMode: 'space' }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  toggleHumanLingo: () => set((s) => ({ humanLingo: !s.humanLingo })),

  setHumanizedTexts: (texts) =>
    set((s) => ({ humanizedTexts: rememberTranslations(s.humanizedTexts, texts) })),
}));
