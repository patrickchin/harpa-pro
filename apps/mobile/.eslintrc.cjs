module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  env: { node: true, es2022: true },
  ignorePatterns: ['node_modules', '.expo', 'dist', 'build', 'babel.config.js', 'metro.config.js', 'tailwind.config.js'],
  rules: {
    // Pitfall 5: no non-null assertions on EXPO_PUBLIC_* vars.
    // Funnel reads through lib/env.ts only.
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "TSNonNullExpression > MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_/]",
        message: 'Do not non-null-assert process.env.EXPO_PUBLIC_*; use lib/env.ts.',
      },
      {
        selector:
          "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_/]",
        message: 'Read EXPO_PUBLIC_* via lib/env.ts only (Pitfall 5).',
      },
    ],
  },
  overrides: [
    {
      // lib/env.ts is the one allowed place to read EXPO_PUBLIC_*.
      // *.test.ts files must mutate process.env.EXPO_PUBLIC_* to exercise
      // the validator's defaults / coercion / failure paths, and to drive
      // env-dependent modules like lib/api/base-url.
      files: ['lib/env.ts', 'lib/env.test.ts', 'lib/api/base-url.test.ts', 'vitest.setup.ts', 'features/voice/fixtureRecorder.test.ts', 'features/voice/pickRecorder.ts'],
      rules: { 'no-restricted-syntax': 'off' },
    },
    {
      // AGENTS.md hard rule #9: no Alert.alert outside the dialog primitive.
      files: ['**/*.{ts,tsx}'],
      excludedFiles: ['lib/dialogs/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'react-native',
                importNames: ['Alert'],
                message: 'Use useAppDialogSheet() from lib/dialogs — never Alert.alert.',
              },
            ],
          },
        ],
      },
    },
    {
      // Pitfall 3: no hex color literals in components/**. Use Tailwind
      // tokens from tailwind.config.js. Scoped to components/** to mirror
      // the previous scripts/check-no-hex-colors.sh gate exactly.
      files: ['components/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\\b/]",
            message:
              'Hex color literals are forbidden in components/** — use Tailwind tokens (Pitfall 3).',
          },
          {
            selector:
              "TemplateElement[value.raw=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\\b/]",
            message:
              'Hex color literals are forbidden in components/** — use Tailwind tokens (Pitfall 3).',
          },
        ],
      },
    },
    {
      // Route files must use `as Href` (or the typed `{ pathname, params }`
      // form) rather than `as any` / `as never` / `as unknown`. The latter
      // silence typed-routes errors and let stale paths land in production.
      // See docs/v4/pitfalls.md (route-cast follow-up to the P3.1 slug
      // migration).
      files: ['app/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "TSAsExpression > TSAnyKeyword",
            message:
              "Don't escape route types with `as any` — import { type Href } from 'expo-router' and cast as Href, or use the { pathname, params } object form.",
          },
          {
            selector: "TSAsExpression > TSNeverKeyword",
            message:
              "Don't escape route types with `as never` — import { type Href } from 'expo-router' and cast as Href, or use the { pathname, params } object form.",
          },
          {
            selector: "TSAsExpression > TSUnknownKeyword",
            message:
              "Don't escape route types with `as unknown` — import { type Href } from 'expo-router' and cast as Href.",
          },
        ],
      },
    },
  ],
};
