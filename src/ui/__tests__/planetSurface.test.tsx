// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanetSurface } from '../PlanetSurface';
import { getProjectAgentIdentities } from '../agentIdentity';
import { testAgent } from '../../test/fixtures';
import { MOTION_FRAME_MS } from '../../renderBudget';
import * as drawSurface from '../surface/drawSurface';
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

  it('paints moving agents a few times a second and pauses while hidden', () => {
    vi.useFakeTimers();
    const draw = vi.spyOn(drawSurface, 'drawSurfaceFrame');
    setSurfaceVisibility('visible');
    const agents = [
      testAgent({ id: 'walk', status: 'working' }),
      testAgent({ id: 'err', status: 'error' }),
    ];
    try {
      render(
        <PlanetSurface
          agents={agents}
          projectName="lumen-lab"
          identities={getProjectAgentIdentities(agents.map((agent) => agent.id))}
        />,
      );
      expect(draw).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(MOTION_FRAME_MS * 2);
      expect(draw).toHaveBeenCalledTimes(3);

      setSurfaceVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      const paused = draw.mock.calls.length;
      vi.advanceTimersByTime(MOTION_FRAME_MS * 4);
      expect(draw).toHaveBeenCalledTimes(paused);

      setSurfaceVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(draw.mock.calls.length).toBeGreaterThan(paused);
    } finally {
      setSurfaceVisibility('visible');
      draw.mockRestore();
      vi.useRealTimers();
    }
  });

  it('draws a reduced-motion surface once', () => {
    const draw = vi.spyOn(drawSurface, 'drawSurfaceFrame');
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    })) as typeof window.matchMedia;
    const agents = [testAgent({ id: 'walk', status: 'working' })];
    try {
      render(
        <PlanetSurface
          agents={agents}
          projectName="quiet-ice"
          identities={getProjectAgentIdentities(['walk'])}
        />,
      );
      expect(draw).toHaveBeenCalledTimes(1);
    } finally {
      window.matchMedia = original;
      draw.mockRestore();
    }
  });
});

function setSurfaceVisibility(value: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => value,
  });
}
