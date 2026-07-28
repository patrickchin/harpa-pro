import { defineConfig } from 'vitest/config';

/** Final reporter and threshold for the merged unit + integration blobs. */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.integration.test.ts',
        'src/**/*.scope.test.ts',
        'src/**/*.live.test.ts',
        'src/__tests__/**',
      ],
      thresholds: {
        lines: 90,
      },
    },
  },
});
