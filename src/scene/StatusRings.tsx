import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlanetState } from '../../shared/status';

const RING_COUNT = 4;

export function StatusRings({ radius, state }: { radius: number; state: PlanetState }) {
  const ringsRef = useRef<THREE.Group>(null);
  const matsRef = useRef<THREE.MeshBasicMaterial[]>([]);

  const ringGeo = useMemo(() => {
    const thickness = state === 'error' ? 0.06 : 0.05;
    return new THREE.RingGeometry(1 - thickness, 1, 64);
  }, [state]);

  const color = state === 'error' ? '#ff4444' : '#ffaa44';

  const materials = useMemo(() => {
    const mats = Array.from(
      { length: RING_COUNT },
      () =>
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
    );
    matsRef.current = mats;
    return mats;
  }, [color]);

  useEffect(() => {
    return () => {
      ringGeo.dispose();
      for (const mat of materials) mat.dispose();
    };
  }, [ringGeo, materials]);

  useFrame((s) => {
    if (!ringsRef.current) return;
    const t = s.clock.elapsedTime;
    const children = ringsRef.current.children;

    if (state === 'error') {
      const cycleDuration = 0.4;
      const minR = radius * 1.2;
      const maxR = radius * 2.5;
      for (let i = 0; i < RING_COUNT; i++) {
        const phase = (t / cycleDuration + i / RING_COUNT) % 1;
        const r = minR + phase * (maxR - minR);
        const baseOpacity = 0.9 * (1 - phase);
        const flicker = (Math.sin(t * 37 + i * 13) * 0.5 + 0.5) * 0.15;
        matsRef.current[i].opacity = Math.max(0, baseOpacity + flicker - 0.1);
        children[i].scale.setScalar(r);
      }
    } else {
      const cycleDuration = 1.4;
      const minR = radius * 1.2;
      const maxR = radius * 2.2;
      const phase = (t / cycleDuration) % 1;
      const fadeOut = 1 - phase;
      const r = minR + phase * (maxR - minR);
      matsRef.current[0].opacity = 0.9 * fadeOut * fadeOut;
      children[0].scale.setScalar(r);
      for (let i = 1; i < RING_COUNT; i++) {
        matsRef.current[i].opacity = 0;
      }
    }
  });

  if (state !== 'error' && state !== 'waiting') return null;

  return (
    <group ref={ringsRef}>
      {materials.map((mat, i) => (
        <mesh key={i} material={mat} geometry={ringGeo} rotation={[Math.PI / 2, 0, 0]}></mesh>
      ))}
    </group>
  );
}
