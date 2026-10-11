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

export type ConnectionState = 'connecting' | 'live' | 'stale';

/** How long a reconnect may keep the previous sky before an empty snapshot replaces it. */
export const STALE_HOLD_MS = 12_000;

interface SpaceStore {
  projects: ProjectInfo[];
  lastUpdated: number;
  selectedPlanetId: string | null;
  cameraMode: 'space' | 'planet';
  sidebarOpen: boolean;
  humanLingo: boolean;
  humanizedTexts: Record<string, string>;
  connection: ConnectionState;
  dataStale: boolean;
  snapshotSeen: boolean;
  scanStartedAt: number | null;
  holdPreviousUntil: number;
  pendingEmpty: boolean;
  assistantRejected: boolean;

  setData: (data: SpaceData) => void;
  markDisconnected: () => void;
  markSocketUp: () => void;
  releaseHold: () => void;
  markAssistantRejected: () => void;
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
  connection: 'connecting',
  dataStale: false,
  snapshotSeen: false,
  scanStartedAt: null,
  holdPreviousUntil: 0,
  pendingEmpty: false,
  assistantRejected: false,

  setData: (data) =>
    set((state) => {
      const projects = data.projects.filter((p) => p.agents.length > 0);
      const holding =
        projects.length === 0 && state.projects.length > 0 && Date.now() < state.holdPreviousUntil;
      if (holding) return { pendingEmpty: true, snapshotSeen: true };
      return {
        projects,
        lastUpdated: data.lastUpdated,
        connection: 'live',
        dataStale: false,
        snapshotSeen: true,
        holdPreviousUntil: 0,
        pendingEmpty: false,
        scanStartedAt: projects.length === 0 ? (state.scanStartedAt ?? Date.now()) : null,
      };
    }),

  markDisconnected: () =>
    set((state) => ({
      connection: 'stale',
      dataStale: state.snapshotSeen || state.projects.length > 0,
      holdPreviousUntil: Number.POSITIVE_INFINITY,
    })),

  markSocketUp: () =>
    set((state) => ({
      holdPreviousUntil: state.projects.length > 0 ? Date.now() + STALE_HOLD_MS : 0,
    })),

  releaseHold: () =>
    set((state) => {
      if (Date.now() < state.holdPreviousUntil) return {};
      if (!state.pendingEmpty) return { holdPreviousUntil: 0 };
      return {
        projects: [],
        connection: 'live',
        dataStale: false,
        holdPreviousUntil: 0,
        pendingEmpty: false,
        snapshotSeen: true,
        scanStartedAt: state.scanStartedAt ?? Date.now(),
      };
    }),

  markAssistantRejected: () => set({ assistantRejected: true }),

  selectPlanet: (id) => set({ selectedPlanetId: id, cameraMode: 'planet' }),

  deselectPlanet: () => set({ selectedPlanetId: null, cameraMode: 'space' }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  toggleHumanLingo: () => set((s) => ({ humanLingo: !s.humanLingo })),

  setHumanizedTexts: (texts) =>
    set((s) => ({ humanizedTexts: rememberTranslations(s.humanizedTexts, texts) })),
}));
