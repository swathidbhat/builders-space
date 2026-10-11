import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide, MeshBasicMaterial, RingGeometry, type Group } from 'three';
import type { PlanetState } from '../../shared/status';
import { STATUS_RING_COUNT, sampleStatusRing, statusRingLook } from './statusRingMotion';

export function StatusRings({ radius, state }: { radius: number; state: PlanetState }) {
  const ringsRef = useRef<Group>(null);
  const matsRef = useRef<MeshBasicMaterial[]>([]);
  const look = statusRingLook(state);
  const thickness = look?.thickness ?? 0.05;
  const color = look?.color ?? '#ffaa44';

  const ringGeo = useMemo(() => new RingGeometry(1 - thickness, 1, 64), [thickness]);

  const materials = useMemo(() => {
    const mats = Array.from(
      { length: STATUS_RING_COUNT },
      () =>
        new MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          side: DoubleSide,
          depthWrite: false,
          blending: AdditiveBlending,
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
    if (!ringsRef.current || (state !== 'error' && state !== 'waiting')) return;
    const children = ringsRef.current.children;
    for (let i = 0; i < STATUS_RING_COUNT; i++) {
      const sample = sampleStatusRing(state, s.clock.elapsedTime, radius, i);
      matsRef.current[i].opacity = sample.opacity;
      if (sample.scale !== null) children[i].scale.setScalar(sample.scale);
    }
  });

  if (state !== 'error' && state !== 'waiting') return null;

  return (
    <group ref={ringsRef}>
      {materials.map((mat, i) => (
        <mesh
          key={['ring-a', 'ring-b', 'ring-c', 'ring-d'][i]}
          material={mat}
          geometry={ringGeo}
          rotation={[Math.PI / 2, 0, 0]}
        ></mesh>
      ))}
    </group>
  );
}
