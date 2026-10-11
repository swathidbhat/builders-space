import { useEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { labelStyle } from './labelPlacement';

/**
 * DOM label inside the canvas. drei's Html creates a second React root and
 * unmounts it from a layout effect, which React 19 logs as an error.
 * This root is unmounted on a later turn, after that commit has finished.
 */
export function DomLabel({
  position,
  distanceFactor = 10,
  children,
}: {
  position: [number, number, number];
  distanceFactor?: number;
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
    parent.appendChild(el);
    const root = createRoot(el);
    elRef.current = el;
    rootRef.current = root;
    return () => {
      elRef.current = null;
      rootRef.current = null;
      el.remove();
      queueMicrotask(() => root.unmount());
    };
  }, [gl]);

  useEffect(() => {
    rootRef.current?.render(
      <div style={{ position: 'absolute', transform: 'translate3d(-50%,-50%,0)' }}>{children}</div>,
    );
  }, [children]);

  useFrame(() => {
    const el = elRef.current;
    const object = groupRef.current;
    if (!el || !object) return;
    const style = labelStyle(object, camera, size.width, size.height, distanceFactor);
    el.style.transform = style.transform;
    el.style.zIndex = style.zIndex;
    el.style.display = style.visible ? 'block' : 'none';
  });

  return <group ref={groupRef} position={position} />;
}
