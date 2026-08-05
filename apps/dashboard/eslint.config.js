import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'playwright-report', 'test-results'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='import'][object.property.name='meta'][property.name='env']",
          message: 'Read Vite environment variables only in src/lib/env.ts.',
        },
      ],
    },
  },
  {
    files: ['src/lib/env.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
