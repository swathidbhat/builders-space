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
        // Per file, so a low file cannot hide inside the server average.
        'server/createServer.ts': { lines: 90, perFile: true },
        'server/security.ts': { lines: 100, perFile: true },
        'server/stateManager.ts': { lines: 97, perFile: true },
        'server/peerUser.ts': { lines: 87, perFile: true },
        'server/openSession.ts': { lines: 89, perFile: true },
        'server/io/incrementalRead.ts': { lines: 94, perFile: true },
        'server/utils/parseCodexSession.ts': { lines: 90, perFile: true },
        'server/utils/parseTranscript.ts': { lines: 97, perFile: true },
        'server/watchers/claudeWatcher.ts': { lines: 83, perFile: true },
        'server/watchers/codexWatcher.ts': { lines: 83, perFile: true },
        'server/watchers/cursorWatcher.ts': { lines: 92, perFile: true },
        'server/watchers/eventWatcher.ts': { lines: 91, perFile: true },
        'server/watchers/sessionFiles.ts': { lines: 100, perFile: true },
        'src/**/*.{ts,tsx}': {
          lines: 70,
        },
        // Per-file floors so a scene component cannot sit at 0% behind the src average.
        'src/scene/Planet.tsx': { lines: 70 },
        'src/scene/SpaceScene.tsx': { lines: 75 },
        'src/scene/StatusRings.tsx': { lines: 70 },
        'src/scene/Starfield.tsx': { lines: 80 },
        'shared/**/*.ts': {
          lines: 90,
        },
      },
    },
  },
});
