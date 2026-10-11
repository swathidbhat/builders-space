import path from 'path';
import type { Plugin } from 'vite';

/** Constructors our JSX intrinsics need `extend()` to register. */
const JSX_CATALOGUE = [
  'AmbientLight',
  'BufferAttribute',
  'BufferGeometry',
  'DirectionalLight',
  'Group',
  'Mesh',
  'PointLight',
  'Points',
  'ShaderMaterial',
  'SphereGeometry',
] as const;

const CLOCK_MODULE = path.resolve(import.meta.dirname, '../src/scene/fiberClock.ts');

/**
 * Fiber imports the entire three namespace and passes it to `extend()`, which keeps every
 * export alive. Rewrite that import to the members the file actually touches, and substitute
 * FiberClock so the deprecated THREE.Clock constructor never runs.
 */
export function slimThreePlugin(): Plugin {
  return {
    name: 'builders-slim-three',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes(`${path.sep}@react-three${path.sep}fiber${path.sep}`)) return null;
      if (!id.endsWith('.js')) return null;
      const importStar = `import * as THREE from 'three';`;
      if (!code.includes(importStar)) return null;

      const used = new Set<string>();
      for (const match of code.matchAll(/THREE\.([A-Za-z0-9_]+)/g)) used.add(match[1]);
      if (code.includes('extend(THREE)')) {
        for (const name of JSX_CATALOGUE) used.add(name);
      }
      const needsClock = used.delete('Clock');
      const names = [...used].sort();
      const fields = [...names];
      if (needsClock) fields.push('Clock: FiberClock');

      const clockImport = needsClock
        ? `import { FiberClock } from ${JSON.stringify(CLOCK_MODULE)};\n`
        : '';
      const threeImport = names.length > 0 ? `import { ${names.join(', ')} } from 'three';\n` : '';
      const replacement = `${clockImport}${threeImport}const THREE = { ${fields.join(', ')} };`;
      return { code: code.replace(importStar, replacement), map: null };
    },
  };
}
