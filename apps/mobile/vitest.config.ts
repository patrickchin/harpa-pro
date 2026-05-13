/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // React Native / Expo modules reference `__DEV__` as a global. Vitest
  // doesn't provide it, so define it as a compile-time constant for any
  // transitively-imported native modules.
  define: {
    __DEV__: 'false',
  },
  // Repo tsconfig uses `jsx="react-native"` (RN babel handles it at
  // runtime). Vitest uses esbuild — override to the automatic runtime
  // so test files don't need `import React`.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'screens/**/*.test.ts',
      'screens/**/*.test.tsx',
      'components/**/*.test.ts',
      'components/**/*.test.tsx',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
    ],
    exclude: ['node_modules', '.expo', 'dist'],
  },
});

