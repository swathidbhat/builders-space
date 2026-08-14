import { create } from 'zustand';
import type { AgentInfo, AgentParty, ProjectInfo, SpaceData } from './types';

/**
 * The parties standing on the landed planet, and which roster they describe.
 *
 * `key` is the content hash of the roster the server was asked about, so a
 * response that arrives after the roster moved on can be recognised as stale.
 */
export interface Briefing {
  projectId: string;
  key: string;
  parties: AgentParty[];
}

/**
 * The watchers can surface the same session twice — a Claude session picked up
 * both by transcript scan and by process detection, for example. Duplicates
 * break React keys and give one agent two bodies on the planet surface, so
 * they are collapsed once here rather than in every consumer.
 */
function dedupeById(agents: AgentInfo[]): AgentInfo[] {
  const seen = new Map<string, AgentInfo>();
  for (const a of agents) {
    if (!seen.has(a.id)) seen.set(a.id, a);
  }
  return [...seen.values()];
}

interface SpaceStore {
  projects: ProjectInfo[];
  lastUpdated: number;
  selectedPlanetId: string | null;
  /** 'surface' means the camera has descended and is standing on the planet. */
  cameraMode: 'space' | 'surface';
  sidebarOpen: boolean;
  briefing: Briefing | null;

  setData: (data: SpaceData) => void;
  selectPlanet: (id: string) => void;
  deselectPlanet: () => void;
  toggleSidebar: () => void;
  setBriefing: (briefing: Briefing) => void;
}

export const useSpaceStore = create<SpaceStore>((set) => ({
  projects: [],
  lastUpdated: 0,
  selectedPlanetId: null,
  cameraMode: 'space',
  sidebarOpen: true,
  briefing: null,

  setData: (data) =>
    set({
      projects: data.projects
        .map(p => ({ ...p, agents: dedupeById(p.agents) }))
        .filter(p => p.agents.length > 0),
      lastUpdated: data.lastUpdated,
    }),

  selectPlanet: (id) =>
    set({ selectedPlanetId: id, cameraMode: 'surface' }),

  deselectPlanet: () =>
    set({ selectedPlanetId: null, cameraMode: 'space' }),

  toggleSidebar: () =>
    set((s) => ({ sidebarOpen: !s.sidebarOpen })),


  // Replaced wholesale rather than merged: a briefing is a statement about a
  // whole roster, and half of an old party set alongside half of a new one
  // would describe a camp that never existed. Kept across `deselectPlanet` so
  // re-landing on the same planet is instant.
  setBriefing: (briefing) => set({ briefing }),
}));
