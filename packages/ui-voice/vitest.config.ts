import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Tests run under jsdom; `react-native` must resolve to its web
      // shim so View/Text/etc. render as div/span.
      'react-native': 'react-native-web',
    },
    dedupe: ['react', 'react-dom', 'react-native-web'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'src/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        // Force Vite to transform RNW so its `require('react')` calls
        // are rewritten through Vite's resolver (and therefore deduped
        // to the workspace-root React copy). Otherwise Node externalizes
        // RNW and it loads its own nested `react-native-web/node_modules/react`,
        // producing duplicate React-element symbols and
        // "Objects are not valid as a React child" errors.
        inline: ['react-native-web'],
      },
    },
  },
});
