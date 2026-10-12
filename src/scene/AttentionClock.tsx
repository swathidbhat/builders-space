import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { derivePlanetState } from '../../shared/status';
import { useSpaceStore } from '../store';
import { prefersReducedMotion } from '../reducedMotion';
import { MOTION_FRAME_MS, hasAttentionState, pageHidden, ringsKeepDrawing } from '../renderBudget';

/** Requests a frame a few times a second while an error or needs-you ring is on screen. */
export function AttentionClock() {
  const invalidate = useThree((state) => state.invalidate);
  const projects = useSpaceStore((state) => state.projects);
  const attention = useMemo(
    () => hasAttentionState(projects.map((project) => derivePlanetState(project))),
    [projects],
  );

  useEffect(() => {
    let timer = 0;
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    const arm = () => {
      stop();
      if (!ringsKeepDrawing(attention, prefersReducedMotion(), pageHidden())) return;
      timer = window.setInterval(() => {
        if (!ringsKeepDrawing(attention, prefersReducedMotion(), pageHidden())) {
          stop();
          return;
        }
        invalidate();
      }, MOTION_FRAME_MS);
    };
    const onVisibility = () => {
      if (pageHidden()) {
        stop();
        return;
      }
      invalidate();
      arm();
    };
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const onMotion = () => {
      if (media?.matches) stop();
      else arm();
    };

    arm();
    document.addEventListener('visibilitychange', onVisibility);
    media?.addEventListener('change', onMotion);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      media?.removeEventListener('change', onMotion);
    };
  }, [attention, invalidate]);

  return null;
}
