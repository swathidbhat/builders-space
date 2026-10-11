import { Suspense, useMemo, useEffect, useRef, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei/core/OrbitControls';
import { AdditiveBlending, NoToneMapping, Vector3, type Points } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Starfield } from './Starfield';
import { Planet } from './Planet';
import { useSpaceStore } from '../store';
import { layoutOrbitalLanes } from './layout';
import { planetCameraTarget, spaceCameraTarget } from './cameraTarget';
import styles from './SpaceScene.module.css';

function useOrbitalLayout() {
  const projects = useSpaceStore((s) => s.projects);
  return useMemo(() => layoutOrbitalLanes(projects), [projects]);
}

function CameraController() {
  const { camera } = useThree();
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const projects = useSpaceStore((s) => s.projects);
  const cameraMode = useSpaceStore((s) => s.cameraMode);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const targetPosRef = useRef(new Vector3(0, 20, 30));
  const targetLookAtRef = useRef(new Vector3(0, 0, 0));
  const transitioningRef = useRef(false);
  const prevSelectionRef = useRef<{ mode: string; id: string | null }>({
    mode: 'space',
    id: null,
  });

  const { positions, ringRadii } = useOrbitalLayout();

  useEffect(() => {
    const selectionChanged =
      cameraMode !== prevSelectionRef.current.mode || selectedId !== prevSelectionRef.current.id;

    if (cameraMode === 'planet' && selectedId) {
      const idx = projects.findIndex((p) => p.id === selectedId);
      if (idx >= 0 && positions[idx]) {
        const target = planetCameraTarget(positions[idx]);
        targetPosRef.current.set(target.pos.x, target.pos.y, target.pos.z);
        targetLookAtRef.current.set(target.lookAt.x, target.lookAt.y, target.lookAt.z);
      }
    } else {
      const target = spaceCameraTarget(ringRadii);
      targetPosRef.current.set(target.pos.x, target.pos.y, target.pos.z);
      targetLookAtRef.current.set(target.lookAt.x, target.lookAt.y, target.lookAt.z);
    }

    if (selectionChanged) {
      transitioningRef.current = true;
      prevSelectionRef.current = { mode: cameraMode, id: selectedId };
    }
  }, [cameraMode, selectedId, projects, positions, ringRadii]);

  useFrame((_state, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const factor = 1 - Math.exp(-5 * delta);

    camera.position.lerp(targetPosRef.current, factor);
    controls.target.lerp(targetLookAtRef.current, factor);

    if (transitioningRef.current) {
      controls.enabled = false;

      const settled =
        camera.position.distanceTo(targetPosRef.current) < 0.05 &&
        controls.target.distanceTo(targetLookAtRef.current) < 0.05;

      if (settled) {
        camera.position.copy(targetPosRef.current);
        controls.target.copy(targetLookAtRef.current);
        transitioningRef.current = false;
        controls.enabled = true;
      }
    }

    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      minDistance={3}
      maxDistance={150}
      enablePan={false}
    />
  );
}

const nebulaVertexShader = `
  attribute float aSize;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(aSize * (300.0 / -mvPosition.z), 200.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const nebulaFragmentShader = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.15, d) * 0.015;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

function Nebula() {
  const ref = useRef<Points>(null);
  const count = 40;

  const [positions, colors, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const sz = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const r = 120 + Math.random() * 180;
      pos[i3] = Math.cos(angle) * r;
      pos[i3 + 1] = (Math.random() - 0.5) * 80;
      pos[i3 + 2] = Math.sin(angle) * r;

      const t = Math.random();
      if (t < 0.33) {
        col[i3] = 0.2;
        col[i3 + 1] = 0.06;
        col[i3 + 2] = 0.4;
      } else if (t < 0.66) {
        col[i3] = 0.06;
        col[i3 + 1] = 0.12;
        col[i3 + 2] = 0.3;
      } else {
        col[i3] = 0.3;
        col[i3 + 1] = 0.06;
        col[i3 + 2] = 0.12;
      }

      sz[i] = 40 + Math.random() * 80;
    }

    return [pos, col, sz];
  }, []);

  useFrame((_state, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.001;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={nebulaVertexShader}
        fragmentShader={nebulaFragmentShader}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        vertexColors
      />
    </points>
  );
}

function PlanetSystem() {
  const projects = useSpaceStore((s) => s.projects);
  const { positions } = useOrbitalLayout();

  return (
    <>
      {projects.map((project, i) => (
        <Planet key={project.id} project={project} position={positions[i]} />
      ))}
    </>
  );
}

export function SpaceScene() {
  const deselectPlanet = useSpaceStore((s) => s.deselectPlanet);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') deselectPlanet();
    },
    [deselectPlanet],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <Canvas
      camera={{ position: [0, 20, 30], fov: 60, near: 0.1, far: 500 }}
      className={styles.canvas}
      onPointerMissed={() => {
        useSpaceStore.getState().deselectPlanet();
      }}
      gl={{ antialias: true, toneMapping: NoToneMapping }}
    >
      <ambientLight intensity={0.15} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <pointLight position={[-10, 5, -10]} intensity={0.3} color="#4466ff" />

      <Suspense fallback={null}>
        <Starfield count={6000} />
        <Nebula />
        <PlanetSystem />
      </Suspense>

      <CameraController />
    </Canvas>
  );
}
