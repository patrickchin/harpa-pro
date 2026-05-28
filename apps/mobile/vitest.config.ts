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
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Cover the source tree the tests are aimed at; exclude
      // generated, vendor, test, snapshot, fixture, and runtime-only
      // (route layouts / Expo entrypoints) surfaces so coverage
      // reflects logic we can actually unit-test in node + jsdom.
      include: [
        'lib/**/*.{ts,tsx}',
        'features/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'screens/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/__tests__/**',
        '**/__snapshots__/**',
        '**/__fixtures__/**',
        '**/__mocks__/**',
        '**/*.d.ts',
        'lib/api/hooks.gen.ts',
        'lib/dev-fixtures/**',
      ],
      // Ratchet thresholds — set just below current baseline so CI
      // catches *regressions* immediately. Lift these numbers as
      // coverage rises; never lower without a documented reason.
      //
      // P3 exit-gate target: lines ≥ 80%
      // (docs/v4/plan-p3-feature-build.md). Current baseline:
      //   lines 77.77% · statements 77.77% · branches 79.48% · functions 69.36%
      // The remaining ~2.2% on lines lands in a focused follow-up
      // (see plan-p3-feature-build.md exit gate).
      thresholds: {
        lines: 77,
        statements: 77,
        functions: 69,
        branches: 79,
      },
    },
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'screens/**/*.test.ts',
      'screens/**/*.test.tsx',
      'components/**/*.test.ts',
      'components/**/*.test.tsx',
      'features/**/*.test.ts',
      'features/**/*.test.tsx',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
      '__tests__/**/*.test.ts',
      '__tests__/**/*.test.tsx',
    ],
    exclude: ['node_modules', '.expo', 'dist'],
  },
});

