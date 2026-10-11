// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { useSpaceStore } from '../../store';
import { testProject } from '../../test/fixtures';

const canvas = document.createElement('canvas');
const parent = document.createElement('div');
parent.appendChild(canvas);
document.body.appendChild(parent);

const camera = new PerspectiveCamera(60, 1, 0.1, 500);
camera.position.set(0, 20, 30);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

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
  useThree: () => ({
    camera,
    gl: { domElement: canvas },
    size: { width: 800, height: 600 },
  }),
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
      projects: [testProject('lumen-lab', [{ id: 'a1', status: 'error' }])],
      selectedPlanetId: 'lumen-lab',
      cameraMode: 'planet',
    });

    try {
      render(<SpaceScene />);
      expect(screen.getByTestId('scene-canvas')).toBeTruthy();
      expect(document.body.textContent).toContain('Lumen Lab');
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
});
