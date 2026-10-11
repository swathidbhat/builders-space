import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { MathUtils, ShaderMaterial, type Mesh } from 'three';
import { derivePlanetState } from '../../shared/status';
import { useSpaceStore } from '../store';
import type { ProjectInfo } from '../types';
import { PlanetLabel } from './PlanetLabel';
import { StatusRings } from './StatusRings';
import {
  PLANET_TYPES,
  buildColors,
  fragmentShader,
  getPlanetType,
  hashString,
  seededRandom,
  vertexShader,
} from './planetLook';

export { derivePlanetState, type PlanetState } from '../../shared/status';

interface PlanetProps {
  project: ProjectInfo;
  position: [number, number, number];
}

export function Planet({ project, position }: PlanetProps) {
  const meshRef = useRef<Mesh>(null);
  const selectPlanet = useSpaceStore((s) => s.selectPlanet);

  const seed = hashString(project.name);
  const planetType = getPlanetType(seed);
  const planetState = useMemo(() => derivePlanetState(project), [project]);

  const radius = 1.8;

  const material = useMemo(() => {
    const rand = seededRandom(seed);
    const colors = buildColors(planetType, rand);
    const planetTypeIndex = PLANET_TYPES.indexOf(planetType);

    return new ShaderMaterial({
      vertexShader,
      fragmentShader,
      toneMapped: false,
      uniforms: {
        uColor1: { value: colors.color1 },
        uColor2: { value: colors.color2 },
        uColor3: { value: colors.color3 },
        uRimColor: { value: colors.rimColor },
        uDim: { value: 0 },
        uTime: { value: 0 },
        uSeed: { value: (seed % 1000) / 1000 },
        uPlanetType: { value: planetTypeIndex },
      },
    });
  }, [seed, planetType]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  useFrame((state, delta) => {
    const targetDim = planetState === 'idle' ? 1 : -1;
    material.uniforms.uDim.value = MathUtils.lerp(
      material.uniforms.uDim.value,
      targetDim,
      delta * 3,
    );

    if (meshRef.current) {
      const rotSpeed = planetState === 'idle' ? 0.006 : 0.06;
      meshRef.current.rotation.y += delta * rotSpeed;
    }

    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      selectPlanet(project.id);
    },
    [project.id, selectPlanet],
  );

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        material={material}
        onClick={handleClick}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[radius, 64, 64]} />
      </mesh>

      <StatusRings radius={radius} state={planetState} />

      <PlanetLabel
        name={project.name}
        agentCount={project.agents.length}
        planetState={planetState}
        yOffset={radius + 0.8}
      />
    </group>
  );
}
