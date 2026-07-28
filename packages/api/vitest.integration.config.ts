import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['src/__tests__/setup-env.ts'],
    include: ['src/**/*.integration.test.ts', 'src/**/*.scope.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.integration.test.ts',
        'src/**/*.scope.test.ts',
        'src/**/*.live.test.ts',
        'src/__tests__/**',
      ],
    },
  },
});
