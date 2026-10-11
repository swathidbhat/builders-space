import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';
import { slimThreePlugin } from './vite/slimThreePlugin.ts';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [slimThreePlugin()],
  resolve: {
    alias: {
      three: path.join(root, 'node_modules/three/build/three.module.js'),
      '@react-three/fiber': path.join(
        root,
        'node_modules/@react-three/fiber/dist/react-three-fiber.esm.js',
      ),
    },
  },
  test: {
    include: ['server/__tests__/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    server: {
      deps: {
        inline: ['three', '@react-three/fiber', '@react-three/drei', 'three-stdlib', 'maath'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['server/**/*.ts', 'src/**/*.{ts,tsx}', 'shared/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        'src/test/**',
        // Process entry binds ports and installs signal handlers. The e2e boot covers it.
        'server/index.ts',
      ],
      thresholds: {
        'server/**/*.ts': {
          lines: 90,
        },
        'src/**/*.{ts,tsx}': {
          lines: 70,
        },
        'shared/**/*.ts': {
          lines: 90,
        },
      },
    },
  },
});
