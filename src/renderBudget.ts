/** Status rings and the planet surface advance at 4 frames per second. */
export const MOTION_FRAME_MS = 250;

export function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export function hasAttentionState(states: readonly string[]): boolean {
  return states.some((state) => state === 'error' || state === 'waiting');
}

export function ringsKeepDrawing(
  hasAttention: boolean,
  reducedMotion: boolean,
  hidden: boolean,
): boolean {
  return hasAttention && !reducedMotion && !hidden;
}

export function surfaceKeepsDrawing(
  kinds: readonly string[],
  reducedMotion: boolean,
  hidden: boolean,
): boolean {
  if (reducedMotion || hidden) return false;
  return kinds.some((kind) => kind === 'walk' || kind === 'dig' || kind === 'shake');
}

export function motionAlpha(delta: number, speed: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return 0;
  return Math.min(1, delta * speed);
}

export function nearly(current: number, target: number, epsilon = 0.01): boolean {
  return Math.abs(current - target) <= epsilon;
}
