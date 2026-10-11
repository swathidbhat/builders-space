import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/__tests__/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['server/**/*.ts', 'src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        'src/test/**',
        // Process entry binds ports and installs signal handlers. The e2e boot covers it.
        'server/index.ts',
      ],
      thresholds: {
        'server/**/*.ts': {
          lines: 80,
        },
        'src/**/*.{ts,tsx}': {
          lines: 60,
        },
      },
    },
  },
});
