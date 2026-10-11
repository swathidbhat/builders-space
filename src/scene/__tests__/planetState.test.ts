import { describe, expect, it } from 'vitest';
import { derivePlanetState, Planet, type PlanetState } from '../Planet';
import { PlanetLabel } from '../PlanetLabel';
import { SpaceScene } from '../SpaceScene';
import { Starfield } from '../Starfield';
import type { ProjectInfo } from '../../types';
import { testProject } from '../../test/fixtures';

function stateFor(statuses: Array<'working' | 'waiting' | 'done' | 'error'>): PlanetState {
  const project = testProject(
    'lumen',
    statuses.map((status, index) => ({ id: `a${index}`, status })),
  );
  return derivePlanetState(project);
}

describe('planet status', () => {
  it('ranks error above waiting, working, and idle', () => {
    expect(stateFor(['working', 'working', 'error'])).toBe('error');
    expect(stateFor(['working', 'waiting'])).toBe('waiting');
    expect(stateFor(['working'])).toBe('active');
    expect(stateFor(['done'])).toBe('idle');
    const empty: ProjectInfo = {
      id: 'none',
      name: 'none',
      path: '/tmp/none',
      fileCount: 0,
      agents: [],
    };
    expect(derivePlanetState(empty)).toBe('idle');
  });

  it('loads the scene modules that draw those states', () => {
    expect(typeof Planet).toBe('function');
    expect(typeof PlanetLabel).toBe('function');
    expect(typeof SpaceScene).toBe('function');
    expect(typeof Starfield).toBe('function');
  });
});
