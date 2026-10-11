import { useEffect, useState } from 'react';
import { useSpaceStore } from '../store';
import { EMPTY_SCAN_MS, skyPhase } from './skyCopy';

/** Re-render once the empty-sky timeout elapses. */
export function useSkyClock(): number {
  const connection = useSpaceStore((s) => s.connection);
  const projectCount = useSpaceStore((s) => s.projects.length);
  const snapshotSeen = useSpaceStore((s) => s.snapshotSeen);
  const scanStartedAt = useSpaceStore((s) => s.scanStartedAt);
  const [now, setNow] = useState(() => Date.now());
  const phase = skyPhase({ connection, projectCount, snapshotSeen, scanStartedAt, now });

  useEffect(() => {
    if (phase !== 'searching' || scanStartedAt == null) return;
    const remaining = scanStartedAt + EMPTY_SCAN_MS - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [phase, scanStartedAt]);

  return now;
}
