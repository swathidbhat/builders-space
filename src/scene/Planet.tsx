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

export function advancePlanetMesh(
  mesh: { rotation: { y: number }; scale: { x: number; setScalar: (value: number) => void } },
  delta: number,
  idle: boolean,
  hovered: boolean,
): void {
  mesh.rotation.y += delta * (idle ? 0.006 : 0.06);
  const next = MathUtils.lerp(mesh.scale.x, hovered ? 1.04 : 1, delta * 8);
  mesh.scale.setScalar(next);
}

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
        uHover: { value: 0 },
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
    const hovered = useSpaceStore.getState().hoveredPlanetId === project.id;
    material.uniforms.uHover.value = MathUtils.lerp(
      material.uniforms.uHover.value,
      hovered ? 1 : 0,
      delta * 8,
    );

    if (meshRef.current) {
      advancePlanetMesh(meshRef.current, delta, planetState === 'idle', hovered);
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
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
          useSpaceStore.getState().setHoveredPlanet(project.id);
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
          if (useSpaceStore.getState().hoveredPlanetId === project.id) {
            useSpaceStore.getState().setHoveredPlanet(null);
          }
        }}
      >
        <sphereGeometry args={[radius, 64, 64]} />
      </mesh>

      <StatusRings radius={radius} state={planetState} />

      <PlanetLabel
        projectId={project.id}
        name={project.name}
        agentCount={project.agents.length}
        planetState={planetState}
        yOffset={radius + 0.8}
      />
    </group>
  );
}
