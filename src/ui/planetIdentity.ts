/**
 * Stable per-project planet identity (matches orbital Planet.tsx / former 2D panel).
 */

export type PlanetType = 'gasGiant' | 'rocky' | 'oceanic' | 'volcanic' | 'ice';

export const PLANET_TYPES: PlanetType[] = ['gasGiant', 'rocky', 'oceanic', 'volcanic', 'ice'];

export function hashProjectName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getPlanetTypeFromProjectName(projectName: string): PlanetType {
  return PLANET_TYPES[hashProjectName(projectName) % PLANET_TYPES.length];
}

export const TERRAIN_PAL: Record<PlanetType, { hi: string; mid: string; lo: string }> = {
  rocky: { hi: '#7a6a5a', mid: '#5a4a3a', lo: '#3a3228' },
  oceanic: { hi: '#3a7a8a', mid: '#2a5a6a', lo: '#1a3a4a' },
  volcanic: { hi: '#7a3a2a', mid: '#4a2a2a', lo: '#2a1a1a' },
  ice: { hi: '#7a8a9a', mid: '#5a6a7a', lo: '#3a4a5a' },
  gasGiant: { hi: '#7a6a4a', mid: '#5a4a2a', lo: '#3a2a18' },
};
