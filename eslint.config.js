import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-electron', 'release', 'node_modules', 'coverage', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', 'electron/**/*.ts', 'scripts/**/*.mjs', '*.config.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
);
