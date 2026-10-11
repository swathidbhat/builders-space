import { useEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { labelStyle } from './labelPlacement';
import { dropLabel, syncLabel } from './labelRegistry';

/**
 * DOM label inside the canvas. drei's Html creates a second React root and
 * unmounts it from a layout effect, which React 19 logs as an error.
 * This root is unmounted on a later turn, after that commit has finished.
 *
 * Priority -1 runs before the layout pass (priority 0) and does not take
 * over the render loop. A positive priority would disable automatic rendering.
 */
export function DomLabel({
  position,
  distanceFactor = 10,
  labelId,
  priority = 3,
  children,
}: {
  position: [number, number, number];
  distanceFactor?: number;
  labelId: string;
  priority?: number;
  children: ReactNode;
}) {
  const groupRef = useRef<Group>(null);
  const { camera, gl, size } = useThree();
  const elRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<Root | null>(null);

  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    el.style.pointerEvents = 'none';
    el.dataset.planetAnchor = labelId;
    parent.appendChild(el);
    const root = createRoot(el);
    elRef.current = el;
    rootRef.current = root;
    return () => {
      dropLabel(labelId);
      elRef.current = null;
      rootRef.current = null;
      el.remove();
      queueMicrotask(() => root.unmount());
    };
  }, [gl, labelId]);

  useEffect(() => {
    rootRef.current?.render(
      <div style={{ position: 'absolute', transform: 'translate3d(-50%,-50%,0)' }}>{children}</div>,
    );
  }, [children]);

  useFrame(() => {
    const el = elRef.current;
    const object = groupRef.current;
    if (!el || !object || typeof object.updateWorldMatrix !== 'function') return;
    const style = labelStyle(object, camera, size.width, size.height, distanceFactor);
    const placed = /translate3d\(([-\d.]+)px,([-\d.]+)px,0\) scale\(([-\d.]+)\)/.exec(
      style.transform,
    );
    if (placed) {
      el.dataset.lx = placed[1];
      el.dataset.ly = placed[2];
      el.dataset.ls = placed[3];
    }
    const node = el.querySelector('[data-planet-label]');
    if (node instanceof HTMLElement) {
      el.dataset.lw = String(node.offsetWidth);
      el.dataset.lh = String(node.offsetHeight);
    }
    el.style.transform = style.transform;
    el.style.zIndex = style.zIndex;
    el.style.display = style.visible ? 'block' : 'none';
    syncLabel(labelId, el, priority);
  }, -1);

  return <group ref={groupRef} position={position} />;
}
