import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { MathUtils, ShaderMaterial, type Mesh } from 'three';
import { derivePlanetState } from '../../shared/status';
import { prefersReducedMotion } from '../reducedMotion';
import { motionAlpha, nearly, pageHidden } from '../renderBudget';
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
  const next = MathUtils.lerp(mesh.scale.x, hovered ? 1.12 : 1, motionAlpha(delta, 8));
  mesh.scale.setScalar(next);
}

interface PlanetProps {
  project: ProjectInfo;
  position: [number, number, number];
}

function samePosition(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function PlanetMesh({ project, position }: PlanetProps) {
  const meshRef = useRef<Mesh>(null);
  const invalidate = useThree((state) => state.invalidate);
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
    const hovered = useSpaceStore.getState().hoveredPlanetId === project.id;
    const targetDim = planetState === 'idle' ? 1 : -1;
    const targetHover = hovered ? 1 : 0;
    const targetScale = hovered ? 1.12 : 1;

    if (pageHidden() || prefersReducedMotion()) {
      material.uniforms.uDim.value = targetDim;
      material.uniforms.uHover.value = targetHover;
      meshRef.current?.scale.setScalar(targetScale);
      return;
    }

    material.uniforms.uDim.value = MathUtils.lerp(
      material.uniforms.uDim.value,
      targetDim,
      motionAlpha(delta, 3),
    );
    material.uniforms.uHover.value = MathUtils.lerp(
      material.uniforms.uHover.value,
      targetHover,
      motionAlpha(delta, 8),
    );

    if (meshRef.current) {
      advancePlanetMesh(meshRef.current, delta, planetState === 'idle', hovered);
    }
    material.uniforms.uTime.value = state.clock.elapsedTime;

    let moving = false;
    if (nearly(material.uniforms.uDim.value, targetDim)) material.uniforms.uDim.value = targetDim;
    else moving = true;
    if (nearly(material.uniforms.uHover.value, targetHover)) {
      material.uniforms.uHover.value = targetHover;
    } else moving = true;
    if (meshRef.current) {
      if (nearly(meshRef.current.scale.x, targetScale, 0.001)) {
        meshRef.current.scale.setScalar(targetScale);
      } else moving = true;
    }
    if (moving) invalidate();
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
          if (!pageHidden()) invalidate();
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
          if (useSpaceStore.getState().hoveredPlanetId === project.id) {
            useSpaceStore.getState().setHoveredPlanet(null);
          }
          if (!pageHidden()) invalidate();
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

export const Planet = memo(PlanetMesh, (prev, next) => {
  return prev.project === next.project && samePosition(prev.position, next.position);
});
