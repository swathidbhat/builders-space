export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraTarget {
  pos: Vec3;
  lookAt: Vec3;
}

export function planetCameraTarget(position: readonly [number, number, number]): CameraTarget {
  const [x, y, z] = position;
  return {
    pos: { x: x + 4, y: y + 2, z: z + 4 },
    lookAt: { x, y, z },
  };
}

/** Fit every orbital ring inside a 60° camera, and never sit closer than 14. */
export function spaceCameraTarget(ringRadii: readonly number[]): CameraTarget {
  const maxR = ringRadii.length > 0 ? Math.max(...ringRadii) : 10;
  const fovRad = (60 / 2) * (Math.PI / 180);
  const fitDist = (maxR * 1.5) / Math.tan(fovRad);
  const dist = Math.max(14, fitDist);
  return {
    pos: { x: 0, y: dist * 0.65, z: dist * 0.6 },
    lookAt: { x: 0, y: 0, z: 0 },
  };
}
