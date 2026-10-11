import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { slimThreePlugin } from '../../vite/slimThreePlugin';

const IMPORT_STAR = `import * as THREE from 'three';`;

describe('slimThreePlugin', () => {
  it('rewrites the three import in the installed Fiber package', () => {
    const dist = resolve('node_modules/@react-three/fiber/dist');
    const files = readdirSync(dist).filter((name) => name.endsWith('.js'));
    const matches = files.filter((name) =>
      readFileSync(join(dist, name), 'utf8').includes(IMPORT_STAR),
    );
    expect(matches.length).toBeGreaterThan(0);

    const plugin = slimThreePlugin();
    if (typeof plugin.transform !== 'function') {
      throw new Error('slimThreePlugin did not register a transform');
    }

    for (const name of matches) {
      const id = join(dist, name);
      const source = readFileSync(id, 'utf8');
      const result = plugin.transform.call({} as never, source, id);
      if (
        !result ||
        result instanceof Promise ||
        typeof result === 'string' ||
        typeof result.code !== 'string'
      ) {
        throw new Error(`expected a code result for ${name}`);
      }
      expect(result.code).not.toContain(IMPORT_STAR);
      if (source.includes('THREE.Clock')) expect(result.code).toContain('FiberClock');
    }
  });

  it('leaves a file alone when Fiber no longer imports the three namespace', () => {
    const plugin = slimThreePlugin();
    if (typeof plugin.transform !== 'function') {
      throw new Error('slimThreePlugin did not register a transform');
    }
    const id = join('node_modules', '@react-three', 'fiber', 'dist', 'other.js');
    expect(plugin.transform.call({} as never, 'export const x = 1;\n', id)).toBeNull();
  });
});
