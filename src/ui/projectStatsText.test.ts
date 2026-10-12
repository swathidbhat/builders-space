import { describe, expect, it } from 'vitest';
import { testAgent } from '../test/fixtures';
import { projectStatsText } from './projectStatsText';

describe('project stats text', () => {
  it('names every count the stats boxes used to show', () => {
    expect(
      projectStatsText([
        testAgent({ id: 'a', status: 'working' }),
        testAgent({ id: 'b', status: 'error' }),
        testAgent({ id: 'c', status: 'waiting' }),
        testAgent({ id: 'd', status: 'done' }),
      ]),
    ).toBe('4 agents, 1 working, 1 error, 1 waiting');
  });

  it('drops error and waiting when there are none, and uses the singular', () => {
    expect(projectStatsText([testAgent({ id: 'a', status: 'working' })])).toBe(
      '1 agent, 1 working',
    );
    expect(
      projectStatsText([
        testAgent({ id: 'a', status: 'error' }),
        testAgent({ id: 'b', status: 'error' }),
        testAgent({ id: 'c', status: 'waiting' }),
        testAgent({ id: 'd', status: 'waiting' }),
      ]),
    ).toBe('4 agents, 0 working, 2 errors, 2 waiting');
  });
});
