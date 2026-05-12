module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  env: { node: true, es2022: true },
  ignorePatterns: ['node_modules', 'dist', '.turbo', 'drizzle.config.ts', 'scripts'],
  rules: {},
  overrides: [
    {
      // Routes layer must go through the per-request scoped DB accessor
      // (`c.get('db')(fn)`), not the raw drizzle handle.
      // See docs/v4/arch-auth-and-rls.md and docs/v4/pitfalls.md (Pitfall 6).
      // routes/auth.ts is the one exception: it runs *before* the user has a
      // session and legitimately needs `rawDb` to upsert auth.users / sessions.
      files: ['src/routes/**/*.ts'],
      excludedFiles: ['src/routes/auth.ts', 'src/routes/health.ts', 'src/routes/**/*.test.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/db/client', '**/db/client.js', '../db/scope', '../db/scope.js', '../../db/scope', '../../db/scope.js'],
                message:
                  'Routes must use c.get(\'db\')(fn) — the per-request scoped accessor wired by withAuth (docs/v4/arch-auth-and-rls.md).',
              },
            ],
          },
        ],
      },
    },
  ],
};
