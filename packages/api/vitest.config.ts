import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['src/__tests__/setup-env.ts'],
    include: ['src/**/*.test.ts'],
    exclude: [
      'src/**/*.integration.test.ts',
      'src/**/*.scope.test.ts',
      // Live-LLM tests run only in the dedicated ai-live workflow
      // (see .github/workflows/ai-live.yml). They hit real providers
      // and must never run in the default PR / unit lane.
      'src/**/*.live.test.ts',
      'node_modules',
      'dist',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
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
