export const EMPTY_SCAN_MS = 8_000;

export const DISCONNECT_BANNER = 'Disconnected — retrying';
export const STALE_MARK = 'last update is stale';
export const LOADING_SKY = 'Loading the sky…';
export const SEARCHING_SKY = 'Looking for sessions…';
export const NO_SESSIONS = 'No sessions yet';

export type ConnectionPhase = 'connecting' | 'live' | 'stale';
export type SkyPhase = 'loading' | 'retrying' | 'searching' | 'empty' | 'ready';

export function skyPhase(input: {
  connection: ConnectionPhase;
  projectCount: number;
  snapshotSeen: boolean;
  scanStartedAt: number | null;
  now: number;
}): SkyPhase {
  if (input.projectCount > 0) return input.connection === 'stale' ? 'retrying' : 'ready';
  if (input.connection === 'stale') return 'retrying';
  if (!input.snapshotSeen || input.connection === 'connecting') return 'loading';
  if (input.scanStartedAt == null || input.now - input.scanStartedAt < EMPTY_SCAN_MS) {
    return 'searching';
  }
  return 'empty';
}

export function planetSubtitle(count: number, stale: boolean): string {
  const noun = `${count} ${count === 1 ? 'planet' : 'planets'} discovered`;
  return stale ? `${noun} · ${STALE_MARK}` : noun;
}
