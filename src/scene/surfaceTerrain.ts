import * as THREE from 'three';
import {
  PATCH_ANGLE,
  PATCH_RINGS,
  PATCH_SEGMENTS,
  PLANET_RADIUS,
  TERRAIN_MAX,
  TERRAIN_MIN,
} from './surfaceConstants';
import {
  TERRAIN_PAL,
  getPlanetTypeFromProjectName,
  hashProjectName,
} from '../ui/planetIdentity';

/**
 * The single source of ground height for the landed surface view.
 *
 * Displacement is evaluated on the CPU and nowhere else: the ground mesh
 * vertices, the agent footing positions and the camera eye height all read the
 * same function, so they agree by construction. Displacing in a vertex shader
 * instead would leave agents floating above or sunk into the ground.
 *
 * Noise is sampled in 3D at the direction vector, so the field is continuous
 * over the whole sphere — no pole singularity and no ±180° meridian seam.
 * Everything here is planet-local: the planet centre is the origin.
 */

const TERRAIN_RANGE = TERRAIN_MAX - TERRAIN_MIN;

const BASE_FREQUENCY = 3;
const FBM_OCTAVES = 4;
const FBM_LACUNARITY = 2.1;
const FBM_GAIN = 0.5;
const RIDGE_OCTAVES = 3;
const RIDGE_WEIGHT = 0.28;

/** Spreads the fBm distribution across more of the band without clamping. */
const CONTRAST = 5;

function hashLattice(ix: number, iy: number, iz: number, seed: number): number {
  let h =
    seed ^
    Math.imul(ix, 0x8da6b343) ^
    Math.imul(iy, 0xd8163841) ^
    Math.imul(iz, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 16), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Quintic fade: C2 across cell boundaries, so no faceting on the lattice. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Trilinear value noise on the integer lattice, in [0, 1]. */
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const ux = fade(x - ix);
  const uy = fade(y - iy);
  const uz = fade(z - iz);

  const x00 = lerp(
    hashLattice(ix, iy, iz, seed),
    hashLattice(ix + 1, iy, iz, seed),
    ux,
  );
  const x10 = lerp(
    hashLattice(ix, iy + 1, iz, seed),
    hashLattice(ix + 1, iy + 1, iz, seed),
    ux,
  );
  const x01 = lerp(
    hashLattice(ix, iy, iz + 1, seed),
    hashLattice(ix + 1, iy, iz + 1, seed),
    ux,
  );
  const x11 = lerp(
    hashLattice(ix, iy + 1, iz + 1, seed),
    hashLattice(ix + 1, iy + 1, iz + 1, seed),
    ux,
  );

  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz);
}

function fbm(x: number, y: number, z: number, seed: number): number {
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let freq = 1;
  for (let o = 0; o < FBM_OCTAVES; o++) {
    sum += amp * valueNoise(x * freq, y * freq, z * freq, seed + o * 1013);
    norm += amp;
    amp *= FBM_GAIN;
    freq *= FBM_LACUNARITY;
  }
  return sum / norm;
}

/** Folded fBm. Supplies the creased horizon silhouette; rolling fBm alone reads as blobs. */
function ridgedFbm(x: number, y: number, z: number, seed: number): number {
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let freq = 1.7;
  for (let o = 0; o < RIDGE_OCTAVES; o++) {
    const n = valueNoise(x * freq, y * freq, z * freq, seed + 7717 + o * 1013);
    sum += amp * (1 - Math.abs(2 * n - 1));
    norm += amp;
    amp *= 0.5;
    freq *= 2.13;
  }
  return sum / norm;
}

/** The height function. `dx, dy, dz` must be a unit direction. */
function heightAt(dx: number, dy: number, dz: number, seed: number): number {
  const x = dx * BASE_FREQUENCY;
  const y = dy * BASE_FREQUENCY;
  const z = dz * BASE_FREQUENCY;
  const raw =
    (1 - RIDGE_WEIGHT) * fbm(x, y, z, seed) +
    RIDGE_WEIGHT * ridgedFbm(x, y, z, seed);
  // tanh is monotone and stays strictly inside (0, 1), so the band is honoured
  // without clamping peaks into mesas.
  const shaped = 0.5 + 0.5 * Math.tanh((raw - 0.5) * CONTRAST);
  return TERRAIN_MIN + shaped * TERRAIN_RANGE;
}

/** Radial displacement above the sphere at a unit direction, world units. */
export function terrainHeight(
  projectName: string,
  dir: [number, number, number],
): number {
  const [x, y, z] = dir;
  const len = Math.hypot(x, y, z) || 1;
  return heightAt(x / len, y / len, z / len, hashProjectName(projectName));
}

/**
 * Displaced spherical-cap mesh centred on `anchor`, covering PATCH_ANGLE.
 * Vertex-coloured from TERRAIN_PAL for the project's planet type.
 */
export function buildGroundPatch(
  projectName: string,
  anchor: [number, number, number],
): THREE.BufferGeometry {
  const seed = hashProjectName(projectName);

  // A zero-length anchor would leave n zero, and the frame below divides by
  // |h x n| — emit a patch at +Y rather than a mesh of NaN.
  const alen = Math.hypot(anchor[0], anchor[1], anchor[2]);
  const nx = alen > 0 ? anchor[0] / alen : 0;
  const ny = alen > 0 ? anchor[1] / alen : 1;
  const nz = alen > 0 ? anchor[2] / alen : 0;

  // Orthonormal frame with n = u × v. That handedness makes segments walked in
  // increasing azimuth wind counter-clockwise seen from outside the planet,
  // which is what THREE treats as front-facing.
  const hx = Math.abs(ny) < 0.9 ? 0 : 1;
  const hy = Math.abs(ny) < 0.9 ? 1 : 0;
  let ux = hy * nz;
  let uy = -hx * nz;
  let uz = hx * ny - hy * nx;
  const ulen = Math.hypot(ux, uy, uz);
  ux /= ulen;
  uy /= ulen;
  uz /= ulen;
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;

  const vertexCount = 1 + PATCH_RINGS * PATCH_SEGMENTS;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  const pal = TERRAIN_PAL[getPlanetTypeFromProjectName(projectName)];
  const lo = new THREE.Color(pal.lo);
  const mid = new THREE.Color(pal.mid);
  const hi = new THREE.Color(pal.hi);
  const tint = new THREE.Color();

  const emit = (i: number, dx: number, dy: number, dz: number) => {
    const h = heightAt(dx, dy, dz, seed);
    const r = PLANET_RADIUS + h;
    const o = i * 3;
    positions[o] = dx * r;
    positions[o + 1] = dy * r;
    positions[o + 2] = dz * r;

    const t = (h - TERRAIN_MIN) / TERRAIN_RANGE;
    if (t < 0.5) tint.lerpColors(lo, mid, t * 2);
    else tint.lerpColors(mid, hi, (t - 0.5) * 2);
    colors[o] = tint.r;
    colors[o + 1] = tint.g;
    colors[o + 2] = tint.b;
  };

  emit(0, nx, ny, nz);

  const cosPhi = new Float64Array(PATCH_SEGMENTS);
  const sinPhi = new Float64Array(PATCH_SEGMENTS);
  for (let s = 0; s < PATCH_SEGMENTS; s++) {
    const phi = (s / PATCH_SEGMENTS) * Math.PI * 2;
    cosPhi[s] = Math.cos(phi);
    sinPhi[s] = Math.sin(phi);
  }

  for (let ring = 1; ring <= PATCH_RINGS; ring++) {
    const t = ring / PATCH_RINGS;
    // Quadratic arc spacing: rings bunch up near the anchor, where the camera
    // stands 0.2 units off the ground and coarse triangles would read as
    // faceting. Out by the horizon the same triangles are a pixel tall.
    const theta = PATCH_ANGLE * t * t;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const base = 1 + (ring - 1) * PATCH_SEGMENTS;
    for (let s = 0; s < PATCH_SEGMENTS; s++) {
      const au = st * cosPhi[s];
      const av = st * sinPhi[s];
      emit(
        base + s,
        ct * nx + au * ux + av * vx,
        ct * ny + au * uy + av * vy,
        ct * nz + au * uz + av * vz,
      );
    }
  }

  const triangleCount = PATCH_SEGMENTS * (2 * PATCH_RINGS - 1);
  const indices =
    vertexCount > 65535
      ? new Uint32Array(triangleCount * 3)
      : new Uint16Array(triangleCount * 3);
  let k = 0;

  for (let s = 0; s < PATCH_SEGMENTS; s++) {
    indices[k++] = 0;
    indices[k++] = 1 + s;
    indices[k++] = 1 + ((s + 1) % PATCH_SEGMENTS);
  }

  for (let ring = 1; ring < PATCH_RINGS; ring++) {
    const inner = 1 + (ring - 1) * PATCH_SEGMENTS;
    const outer = inner + PATCH_SEGMENTS;
    for (let s = 0; s < PATCH_SEGMENTS; s++) {
      const s1 = (s + 1) % PATCH_SEGMENTS;
      indices[k++] = inner + s;
      indices[k++] = outer + s;
      indices[k++] = outer + s1;
      indices[k++] = inner + s;
      indices[k++] = outer + s1;
      indices[k++] = inner + s1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
