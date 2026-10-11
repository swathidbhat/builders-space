import type { PlanetState } from '../../shared/status';

export const STATUS_RING_COUNT = 4;

export interface StatusRingLook {
  thickness: number;
  color: string;
}

export function statusRingLook(state: PlanetState): StatusRingLook | null {
  if (state === 'error') return { thickness: 0.06, color: '#ff4444' };
  if (state === 'waiting') return { thickness: 0.09, color: '#ffc14d' };
  return null;
}

export interface StatusRingSample {
  opacity: number;
  scale: number | null;
}

export function sampleStatusRing(
  state: 'error' | 'waiting',
  elapsed: number,
  radius: number,
  index: number,
): StatusRingSample {
  if (state === 'error') {
    const cycleDuration = 0.4;
    const minR = radius * 1.2;
    const maxR = radius * 2.5;
    const phase = (elapsed / cycleDuration + index / STATUS_RING_COUNT) % 1;
    const scale = minR + phase * (maxR - minR);
    const baseOpacity = 0.9 * (1 - phase);
    const flicker = (Math.sin(elapsed * 37 + index * 13) * 0.5 + 0.5) * 0.15;
    return { opacity: Math.max(0, baseOpacity + flicker - 0.1), scale };
  }

  if (index > 1) return { opacity: 0, scale: null };

  const cycleDuration = 1.4;
  const minR = radius * 1.2;
  const maxR = radius * 2.2;
  const phase = (elapsed / cycleDuration + index * 0.5) % 1;
  const fade = 1 - phase;
  return {
    opacity: 0.55 + 0.4 * fade,
    scale: minR + phase * (maxR - minR),
  };
}
