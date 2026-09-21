// @ts-check
// Fallback config for workspace packages (packages/*) that don't ship their
// own eslint.config.*. apps/* each have their own (Next.js / Nest need
// different rule sets) and take precedence when ESLint is run from inside them.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', '**/coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
