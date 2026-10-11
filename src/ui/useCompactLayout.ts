import { useEffect, useState } from 'react';
import { COMPACT_MAX_PX } from '../scene/labelPlacement';

export const COMPACT_MEDIA = `(max-width: ${COMPACT_MAX_PX}px)`;

function matchesCompact(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(COMPACT_MEDIA).matches;
}

/** True when the sidebar and detail panel should overlay the sky. */
export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(matchesCompact);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(COMPACT_MEDIA);
    const onChange = () => setCompact(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return compact;
}
