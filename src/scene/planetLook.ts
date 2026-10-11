import { Color } from 'three';

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash |= 0;
  }
  return Math.abs(hash);
}

export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export type PlanetType = 'gasGiant' | 'rocky' | 'oceanic' | 'volcanic' | 'ice';

export const PLANET_TYPES: PlanetType[] = ['gasGiant', 'rocky', 'oceanic', 'volcanic', 'ice'];

export function getPlanetType(seed: number): PlanetType {
  return PLANET_TYPES[seed % PLANET_TYPES.length];
}

export const vertexShader = `
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vPosition = position;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uRimColor;
  uniform float uDim;
  uniform float uTime;
  uniform float uSeed;
  uniform int uPlanetType;

  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float noise3d(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p, int octaves) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
      if (i >= octaves) break;
      val += amp * noise3d(p * freq + uSeed * 10.0);
      freq *= 2.1;
      amp *= 0.5;
    }
    return val;
  }

  float warpedFbm(vec3 p) {
    vec3 q = vec3(
      fbm(p, 3),
      fbm(p + vec3(5.2, 1.3, 2.8), 3),
      fbm(p + vec3(1.7, 9.2, 4.1), 3)
    );
    return fbm(p + 4.0 * q, 3);
  }

  float getLatitude(vec3 pos) {
    return abs(normalize(pos).y);
  }

  vec3 renderGasGiant(vec3 pos, float n, float lat) {
    float bands = sin(lat * 25.0 + n * 3.0) * 0.5 + 0.5;
    bands = smoothstep(0.3, 0.7, bands);
    vec3 surface = mix(uColor1, uColor2, bands);
    float storm = warpedFbm(pos * 5.0);
    storm = smoothstep(0.55, 0.65, storm);
    surface = mix(surface, uColor3 * 1.3, storm * 0.6);
    float turb = noise3d(pos * 12.0);
    surface += (turb - 0.5) * 0.08;
    return surface;
  }

  vec3 renderRocky(vec3 pos, float n, float lat) {
    float warped = warpedFbm(pos * 2.5);
    float elevation = fbm(pos * 6.0, 4);
    vec3 lowland = mix(uColor1, uColor2, warped);
    vec3 highland = uColor3;
    vec3 surface = mix(lowland, highland, smoothstep(0.4, 0.7, elevation));
    float craterNoise = 1.0 - smoothstep(0.48, 0.52, warpedFbm(pos * 7.0));
    surface = mix(surface, surface * 0.6, craterNoise * 0.4);
    float dustCap = smoothstep(0.8, 0.95, lat);
    surface = mix(surface, uColor1 * 1.3 + vec3(0.15), dustCap * 0.5);
    return surface;
  }

  vec3 renderOceanic(vec3 pos, float n, float lat) {
    float warped = warpedFbm(pos * 3.0);
    float islandMask = smoothstep(0.58, 0.65, warped);
    float depth = fbm(pos * 4.0, 3);
    vec3 deepSea = uColor1 * 0.35;
    vec3 shallowSea = uColor1 * 0.7 + uColor2 * 0.15;
    vec3 ocean = mix(deepSea, shallowSea, depth);
    float islandElev = fbm(pos * 8.0, 3);
    vec3 island = mix(uColor2 * 0.8, uColor3, smoothstep(0.3, 0.6, islandElev));
    vec3 surface = mix(ocean, island, islandMask);
    float frost = smoothstep(0.82, 0.95, lat);
    surface = mix(surface, vec3(0.8, 0.88, 0.95), frost * 0.5);
    return surface;
  }

  vec3 renderVolcanic(vec3 pos, float n, float lat) {
    float warped = warpedFbm(pos * 3.0);
    vec3 basalt = uColor1 * 0.5 + vec3(0.08, 0.06, 0.05);
    vec3 darkRock = uColor2 * 0.6 + vec3(0.1, 0.08, 0.06);
    vec3 surface = mix(basalt, darkRock, warped);
    float ridged = 1.0 - abs(2.0 * fbm(pos * 5.0, 4) - 1.0);
    ridged = pow(ridged, 4.0);
    vec3 lava = mix(vec3(0.8, 0.15, 0.0), vec3(1.0, 0.4, 0.05), 0.5);
    surface = mix(surface, lava, ridged * 0.8);
    float highland = fbm(pos * 8.0, 3);
    surface += vec3(0.05) * smoothstep(0.6, 0.8, highland);
    return surface;
  }

  vec3 renderIce(vec3 pos, float n, float lat) {
    float warped = warpedFbm(pos * 2.0);
    vec3 ice1 = vec3(0.78, 0.83, 0.88) + uColor1 * 0.1;
    vec3 ice2 = vec3(0.70, 0.76, 0.84) + uColor2 * 0.1;
    vec3 surface = mix(ice1, ice2, warped);
    float crevasse = 1.0 - abs(2.0 * fbm(pos * 6.0, 4) - 1.0);
    crevasse = pow(crevasse, 6.0);
    vec3 crevasseColor = uColor3 * 0.2 + vec3(0.1, 0.15, 0.25);
    surface = mix(surface, crevasseColor, crevasse * 0.6);
    float glacial = smoothstep(0.5, 0.85, lat);
    surface = mix(surface, vec3(0.92, 0.94, 0.98), glacial * 0.5);
    return surface;
  }

  void main() {
    vec3 lightDir = normalize(vec3(1.0, 0.8, 0.5));
    float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
    float ambient = 0.35;
    float shadow = smoothstep(-0.2, 0.5, dot(vWorldNormal, lightDir));

    float n = fbm(vPosition * 3.0, 3);
    float lat = getLatitude(vPosition);

    vec3 surface;
    if (uPlanetType == 0) {
      surface = renderGasGiant(vPosition, n, lat);
    } else if (uPlanetType == 1) {
      surface = renderRocky(vPosition, n, lat);
    } else if (uPlanetType == 2) {
      surface = renderOceanic(vPosition, n, lat);
    } else if (uPlanetType == 3) {
      surface = renderVolcanic(vPosition, n, lat);
    } else {
      surface = renderIce(vPosition, n, lat);
    }

    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(vWorldNormal, halfDir), 0.0), 32.0);
    float specMask = 0.0;
    if (uPlanetType == 2 || uPlanetType == 4) specMask = 0.25;
    if (uPlanetType == 3) specMask = 0.15;

    float rim = 1.0 - max(dot(vWorldNormal, viewDir), 0.0);
    float rimStrength = 0.5;
    if (uPlanetType == 0) rimStrength = 0.7;
    if (uPlanetType == 2) rimStrength = 0.6;
    vec3 glow = uRimColor * pow(rim, 3.0) * rimStrength;

    vec3 lit = surface * (ambient + diffuse * shadow) + spec * specMask + glow;

    // uDim: 1.0 = idle (desaturate + darken), -1.0 = active/attention (boost brightness)
    if (uDim > 0.0) {
      float gray = dot(lit, vec3(0.299, 0.587, 0.114));
      lit = mix(lit, vec3(gray), uDim * 0.4);
      lit *= 1.0 - uDim * 0.2;
    } else {
      lit *= 1.0 - uDim * 0.35;
    }

    gl_FragColor = vec4(lit, 1.0);
  }
`;

// --- Color config (identity — stable per project name, never changes) ---

export interface PlanetTypeConfig {
  color1: Color;
  color2: Color;
  color3: Color;
  rimColor: Color;
}

export function buildColors(type: PlanetType, rand: () => number): PlanetTypeConfig {
  const hsl = (h: number, s: number, l: number) => {
    const c = new Color();
    c.setHSL(h / 360, s, l);
    return c;
  };

  switch (type) {
    case 'gasGiant':
      return {
        color1: hsl(20 + rand() * 40, 0.5 + rand() * 0.3, 0.5 + rand() * 0.15),
        color2: hsl(30 + rand() * 50, 0.4 + rand() * 0.3, 0.4 + rand() * 0.15),
        color3: hsl(rand() * 30, 0.6 + rand() * 0.2, 0.55 + rand() * 0.1),
        rimColor: hsl(25 + rand() * 20, 0.3, 0.5),
      };
    case 'rocky':
      return {
        color1: hsl(15 + rand() * 30, 0.3 + rand() * 0.25, 0.35 + rand() * 0.15),
        color2: hsl(30 + rand() * 30, 0.2 + rand() * 0.2, 0.4 + rand() * 0.12),
        color3: hsl(40 + rand() * 20, 0.15 + rand() * 0.15, 0.5 + rand() * 0.1),
        rimColor: hsl(25, 0.3, 0.5),
      };
    case 'oceanic':
      return {
        color1: hsl(180 + rand() * 40, 0.5 + rand() * 0.3, 0.38 + rand() * 0.12),
        color2: hsl(35 + rand() * 25, 0.3 + rand() * 0.2, 0.5 + rand() * 0.1),
        color3: hsl(20 + rand() * 30, 0.25 + rand() * 0.2, 0.45 + rand() * 0.1),
        rimColor: hsl(190, 0.5, 0.6),
      };
    case 'volcanic':
      return {
        color1: hsl(rand() * 20, 0.2 + rand() * 0.2, 0.25 + rand() * 0.1),
        color2: hsl(15 + rand() * 20, 0.3 + rand() * 0.2, 0.28 + rand() * 0.1),
        color3: hsl(10 + rand() * 20, 0.8 + rand() * 0.2, 0.55 + rand() * 0.1),
        rimColor: hsl(10, 0.5, 0.4),
      };
    case 'ice':
      return {
        color1: hsl(200 + rand() * 15, 0.08 + rand() * 0.1, 0.72 + rand() * 0.1),
        color2: hsl(210 + rand() * 15, 0.1 + rand() * 0.1, 0.68 + rand() * 0.08),
        color3: hsl(220 + rand() * 20, 0.2 + rand() * 0.15, 0.35 + rand() * 0.1),
        rimColor: hsl(210, 0.15, 0.75),
      };
  }
}
