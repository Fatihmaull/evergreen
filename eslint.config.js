import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // Type-aware linting for our own TypeScript only. Config files and scripts
    // are deliberately excluded — they aren't part of any package's program.
    files: ['packages/*/src/**/*.ts', 'packages/*/test/**/*.ts', 'apps/*/**/*.ts', '*.config.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The rules docs/CONVENTIONS.md § TypeScript actually promises.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'No default exports (docs/CONVENTIONS.md). Use a named export.',
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },

  {
    // Vite/Vitest configs are the one place a default export is required.
    files: ['*.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  prettier,
);
