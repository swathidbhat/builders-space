// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { useSpaceStore } from '../../store';
import { MOTION_FRAME_MS } from '../../renderBudget';
import { testProject } from '../../test/fixtures';

const canvas = document.createElement('canvas');
const parent = document.createElement('div');
parent.appendChild(canvas);
document.body.appendChild(parent);

const camera = new PerspectiveCamera(60, 1, 0.1, 500);
camera.position.set(0, 20, 30);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

const invalidate = vi.hoisted(() => vi.fn());

vi.mock('@react-three/drei/core/OrbitControls', () => ({
  OrbitControls: () => null,
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    children,
    className,
    onPointerMissed,
  }: {
    children?: ReactNode;
    className?: string;
    onPointerMissed?: () => void;
  }) => (
    <div className={className} data-testid="scene-canvas" onClick={() => onPointerMissed?.()}>
      {children}
    </div>
  ),
  useFrame: (
    cb: (
      state: { clock: { elapsedTime: number }; size?: { width: number; height: number } },
      delta: number,
    ) => void,
  ) => {
    cb({ clock: { elapsedTime: 1.5 }, size: { width: 800, height: 600 } }, 0.016);
  },
  useThree: (
    selector?: (state: {
      camera: PerspectiveCamera;
      gl: { domElement: HTMLCanvasElement };
      size: { width: number; height: number };
      invalidate: () => void;
    }) => unknown,
  ) => {
    const state = {
      camera,
      gl: { domElement: canvas },
      size: { width: 800, height: 600 },
      invalidate,
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

import { SpaceScene } from '../SpaceScene';

describe('scene components', () => {
  afterEach(async () => {
    cleanup();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it('renders planets, rings, and labels, and leaves the canvas on Escape', async () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((arg) => String(arg)).join(' '));
    };

    useSpaceStore.setState({
      projects: [
        testProject('lumen-lab', [{ id: 'a1', status: 'error' }]),
        testProject('api-gateway', [{ id: 'b1', status: 'working' }]),
      ],
      selectedPlanetId: 'lumen-lab',
      cameraMode: 'planet',
    });

    try {
      render(<SpaceScene />);
      expect(screen.getByTestId('scene-canvas')).toBeTruthy();
      expect(document.body.textContent).toContain('Lumen Lab');
      expect(document.body.textContent).toContain('Error');
      expect(document.body.textContent).toContain('API Gateway');
      expect(document.body.textContent).not.toMatch(/\d+ agent/);
      const mesh = document.querySelector('mesh');
      expect(mesh).toBeTruthy();
      expect(document.querySelectorAll('mesh').length).toBeGreaterThan(1);
      if (!mesh) return;

      fireEvent.pointerOut(mesh);
      expect(document.body.style.cursor).toBe('default');
      expect(useSpaceStore.getState().hoveredPlanetId).toBeNull();
      fireEvent.pointerOver(mesh);
      expect(document.body.style.cursor).toBe('pointer');
      expect(useSpaceStore.getState().hoveredPlanetId).toBe('lumen-lab');
      fireEvent.click(mesh);
      expect(useSpaceStore.getState().selectedPlanetId).toBe('lumen-lab');

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(useSpaceStore.getState().cameraMode).toBe('space');
      expect(useSpaceStore.getState().selectedPlanetId).toBeNull();

      useSpaceStore.setState({ selectedPlanetId: 'lumen-lab', cameraMode: 'planet' });
      fireEvent.click(screen.getByTestId('scene-canvas'));
      expect(useSpaceStore.getState().selectedPlanetId).toBeNull();
    } finally {
      console.error = original;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(errors.filter((line) => line.includes('synchronously unmount'))).toEqual([]);
  });

  it('pulses error rings until the tab is hidden, then stops', () => {
    vi.useFakeTimers();
    setVisibility('visible');
    invalidate.mockClear();
    useSpaceStore.setState({
      projects: [testProject('lumen-lab', [{ id: 'a1', status: 'error' }])],
      selectedPlanetId: null,
      cameraMode: 'space',
      sidebarOpen: true,
    });

    try {
      render(<SpaceScene />);
      const mounted = invalidate.mock.calls.length;
      expect(mounted).toBeGreaterThan(0);
      invalidate.mockClear();
      vi.advanceTimersByTime(MOTION_FRAME_MS);
      expect(invalidate).toHaveBeenCalled();

      invalidate.mockClear();
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(MOTION_FRAME_MS * 4);
      expect(invalidate).not.toHaveBeenCalled();

      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(invalidate).toHaveBeenCalled();
    } finally {
      setVisibility('visible');
      vi.useRealTimers();
    }
  });

  it('does not pulse rings when motion is reduced', () => {
    vi.useFakeTimers();
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
    invalidate.mockClear();
    useSpaceStore.setState({
      projects: [testProject('lumen-lab', [{ id: 'a1', status: 'error' }])],
      selectedPlanetId: null,
      cameraMode: 'space',
    });

    try {
      render(<SpaceScene />);
      invalidate.mockClear();
      vi.advanceTimersByTime(MOTION_FRAME_MS * 4);
      expect(invalidate).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = original;
      vi.useRealTimers();
    }
  });
});

function setVisibility(value: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => value,
  });
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => value === 'hidden',
  });
}
