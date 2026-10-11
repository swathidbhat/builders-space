// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlanetSurface } from '../PlanetSurface';
import { getProjectAgentIdentities } from '../agentIdentity';
import { testAgent } from '../../test/fixtures';
import { flushFrames, installAnimationFrame, installCanvasStub } from '../../test/canvas';

describe('planet surface', () => {
  beforeEach(() => {
    installCanvasStub();
    installAnimationFrame();
  });

  it('draws working, waiting, and error agents and skips done ones', () => {
    const agents = [
      testAgent({ id: 'walk', status: 'working', source: 'cursor' }),
      testAgent({ id: 'dig', status: 'working', source: 'claude-code' }),
      testAgent({ id: 'dig2', status: 'working', source: 'codex' }),
      testAgent({ id: 'err', status: 'error', source: 'cursor' }),
      testAgent({ id: 'wait', status: 'waiting', source: 'codex' }),
      testAgent({ id: 'finished', status: 'done' }),
    ];
    const { container } = render(
      <PlanetSurface
        agents={agents}
        projectName="lumen-lab"
        identities={getProjectAgentIdentities(agents.map((agent) => agent.id))}
      />,
    );
    flushFrames(420);
    const canvas = container.querySelector('canvas');
    expect(canvas?.width).toBe(200);
    expect(canvas?.height).toBe(120);
  });

  it('still paints the sky when every agent is done', () => {
    const { container } = render(
      <PlanetSurface
        agents={[testAgent({ id: 'finished', status: 'done' })]}
        projectName="quiet-ice"
        identities={new Map()}
      />,
    );
    flushFrames(2);
    expect(container.querySelector('canvas')).toBeTruthy();
  });
});
