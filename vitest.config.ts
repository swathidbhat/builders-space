import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // The surface suites are genuinely heavy: a ground patch is ~19k vertices
    // of CPU-displaced geometry, and several placement and motion tests sweep
    // thousands of samples to pin a range. They pass comfortably in isolation
    // but exceed the 5s default when the files run in parallel on a busy
    // machine, which shows up as flaky timeouts rather than real failures.
    testTimeout: 30_000,
  },
});
