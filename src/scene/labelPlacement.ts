import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera, type Object3D } from 'three';

const worldPos = new Vector3();
const cameraPos = new Vector3();
const cameraDir = new Vector3();
const projected = new Vector3();

const Z_INDEX_RANGE: [number, number] = [16777271, 0];

export interface LabelStyle {
  transform: string;
  zIndex: string;
  visible: boolean;
}

/**
 * Screen placement used by planet labels. Same projection, distance scale,
 * and depth order as drei's non-transform Html with `center` and `distanceFactor`.
 */
export function labelStyle(
  object: Object3D,
  camera: Camera,
  width: number,
  height: number,
  distanceFactor: number,
): LabelStyle {
  object.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();

  const objectPos = worldPos.setFromMatrixPosition(object.matrixWorld);
  projected.copy(objectPos).project(camera);
  const widthHalf = width / 2;
  const heightHalf = height / 2;
  const x = projected.x * widthHalf + widthHalf;
  const y = -(projected.y * heightHalf) + heightHalf;

  const cam = cameraPos.setFromMatrixPosition(camera.matrixWorld);
  const behind =
    objectPos.clone().sub(cam).angleTo(camera.getWorldDirection(cameraDir)) > Math.PI / 2;
  const scale = labelScale(objectPos, cam, camera, distanceFactor);
  return {
    transform: `translate3d(${x}px,${y}px,0) scale(${scale})`,
    zIndex: depthIndex(objectPos, cam, camera),
    visible: !behind,
  };
}

export function labelScale(
  objectPos: Vector3,
  cameraPos: Vector3,
  camera: Camera,
  distanceFactor: number,
): number {
  if (camera instanceof OrthographicCamera) return camera.zoom * distanceFactor;
  if (!(camera instanceof PerspectiveCamera)) return distanceFactor;
  const distance = objectPos.distanceTo(cameraPos);
  const vFov = (camera.fov * Math.PI) / 180;
  const scaleFov = 2 * Math.tan(vFov / 2) * distance;
  if (scaleFov === 0) return distanceFactor;
  return (1 / scaleFov) * distanceFactor;
}

function depthIndex(objectPos: Vector3, cameraPos: Vector3, camera: Camera): string {
  if (!(camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera)) return '0';
  const distance = objectPos.distanceTo(cameraPos);
  const slope = (Z_INDEX_RANGE[1] - Z_INDEX_RANGE[0]) / (camera.far - camera.near);
  const intercept = Z_INDEX_RANGE[1] - slope * camera.far;
  return String(Math.round(slope * distance + intercept));
}
