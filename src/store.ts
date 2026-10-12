import { create } from 'zustand';
import { CLIENT_TRANSLATION_CACHE_MAX } from '../shared/config';
import { reuseProjects } from './snapshotIdentity';
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
export type LingoPreference = 'auto' | 'on' | 'off';
export type AssistantKeyState = 'missing' | 'ready' | 'rejected';

/** How long a reconnect may keep the previous sky before an empty snapshot replaces it. */
export const STALE_HOLD_MS = 12_000;

interface SpaceStore {
  projects: ProjectInfo[];
  lastUpdated: number;
  selectedPlanetId: string | null;
  cameraMode: 'space' | 'planet';
  sidebarOpen: boolean;
  sidebarOverlayOpen: boolean;
  humanLingo: boolean;
  lingoPreference: LingoPreference;
  hoveredPlanetId: string | null;
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
  setSidebarOverlay: (open: boolean) => void;
  toggleHumanLingo: () => void;
  applyAssistantKey: (state: AssistantKeyState) => void;
  setHoveredPlanet: (id: string | null) => void;
  setHumanizedTexts: (texts: Record<string, string>) => void;
}

export const useSpaceStore = create<SpaceStore>((set) => ({
  projects: [],
  lastUpdated: 0,
  selectedPlanetId: null,
  cameraMode: 'space',
  sidebarOpen: true,
  sidebarOverlayOpen: false,
  humanLingo: false,
  lingoPreference: 'auto',
  hoveredPlanetId: null,
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
      const incoming = data.projects.filter((project) => project.agents.length > 0);
      const holding =
        incoming.length === 0 && state.projects.length > 0 && Date.now() < state.holdPreviousUntil;
      if (holding) return { pendingEmpty: true, snapshotSeen: true };
      const projects = reuseProjects(state.projects, incoming);
      const scanStartedAt = projects.length === 0 ? (state.scanStartedAt ?? Date.now()) : null;
      const next = {
        projects,
        lastUpdated: data.lastUpdated,
        connection: 'live' as const,
        dataStale: false,
        snapshotSeen: true,
        holdPreviousUntil: 0,
        pendingEmpty: false,
        scanStartedAt,
      };
      if (
        projects === state.projects &&
        state.lastUpdated === next.lastUpdated &&
        state.connection === next.connection &&
        state.dataStale === next.dataStale &&
        state.snapshotSeen === next.snapshotSeen &&
        state.holdPreviousUntil === next.holdPreviousUntil &&
        state.pendingEmpty === next.pendingEmpty &&
        state.scanStartedAt === next.scanStartedAt
      ) {
        return state;
      }
      return next;
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

  markAssistantRejected: () =>
    set((state) => ({
      assistantRejected: true,
      humanLingo: state.lingoPreference === 'auto' ? false : state.humanLingo,
    })),

  selectPlanet: (id) => set({ selectedPlanetId: id, cameraMode: 'planet' }),

  deselectPlanet: () => set({ selectedPlanetId: null, cameraMode: 'space' }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  setSidebarOverlay: (open) => set({ sidebarOverlayOpen: open }),

  toggleHumanLingo: () =>
    set((state) => {
      const humanLingo = !state.humanLingo;
      return { humanLingo, lingoPreference: humanLingo ? 'on' : 'off' };
    }),

  applyAssistantKey: (keyState) =>
    set((state) => {
      const assistantRejected = keyState === 'rejected' || state.assistantRejected;
      if (state.lingoPreference !== 'auto') return { assistantRejected };
      return { humanLingo: keyState === 'ready', assistantRejected };
    }),

  setHoveredPlanet: (id) => set({ hoveredPlanetId: id }),

  setHumanizedTexts: (texts) =>
    set((s) => ({ humanizedTexts: rememberTranslations(s.humanizedTexts, texts) })),
}));

declare global {
  interface Window {
    __spaceStore?: typeof useSpaceStore;
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__spaceStore = useSpaceStore;
}
