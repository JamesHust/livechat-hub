import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Base flat config shared across the monorepo.
 * Framework-agnostic: no React assumptions baked in.
 */
export const baseConfig = tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/.turbo/**', '**/*.config.*'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  prettier,
);

/**
 * React preset for library packages — hooks rules only (no fast-refresh, which
 * is an app/HMR concern and just creates noise for component+helper modules).
 */
export const reactConfig = tseslint.config(...baseConfig, {
  files: ['**/*.{ts,tsx}'],
  plugins: {
    'react-hooks': reactHooks,
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
  },
});

/**
 * React preset for applications — adds the fast-refresh rule on top of the
 * library preset.
 */
export const reactAppConfig = tseslint.config(...reactConfig, {
  files: ['**/*.{ts,tsx}'],
  plugins: {
    'react-refresh': reactRefresh,
  },
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
});

export default baseConfig;
