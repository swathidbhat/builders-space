/**
 * Descent progress, shared between the camera controller that drives it and
 * the surface view that fades in against it.
 *
 * Deliberately a module-level mutable object rather than zustand state: this
 * is written every frame, and routing it through React would re-render the
 * whole planet system 60 times a second.
 */

export type DescentPhase = 'space' | 'descending' | 'landed' | 'ascending';

export const descentState = {
  phase: 'space' as DescentPhase,
  /** 0 = in orbit, 1 = standing on the surface. */
  progress: 0,
  planetId: null as string | null,
};

export function resetDescent(): void {
  descentState.phase = 'space';
  descentState.progress = 0;
  descentState.planetId = null;
}
