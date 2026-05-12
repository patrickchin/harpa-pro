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
      // lib/env.test.ts must mutate process.env.EXPO_PUBLIC_* to exercise
      // the validator's defaults / coercion / failure paths.
      files: ['lib/env.ts', 'lib/env.test.ts'],
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
  ],
};
