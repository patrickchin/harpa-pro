import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'screens/**/*.test.ts',
      'screens/**/*.test.tsx',
    ],
    exclude: ['node_modules', '.expo', 'dist'],
  },
});
