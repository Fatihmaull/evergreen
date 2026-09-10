import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/target/**',
      '**/*.tsbuildinfo',
    ],
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
        // One home for a policy (docs/CONVENTIONS.md). A hand-written
        // `remaining < threshold` is a COPY of the rule, and copies do not move
        // when the rule does. This has already shipped a wrong answer once:
        // `exitCodeFor` kept `<` after the threshold became a floor, so
        // `evergreen-check` passed CI at the exact ledger the engine alarmed.
        // Grep found that one. This makes the next one unwritable instead.
        {
          selector:
            'BinaryExpression[operator=/^[<>]=?$/] > :matches(Identifier, MemberExpression)[name=/remaining|threshold/i]',
          message:
            'Call needsAction()/hasExpired() from @evergreen-stellar/core — never hand-write a TTL threshold or expiry comparison (docs/CONVENTIONS.md § One home for a policy).',
        },
        {
          selector:
            'BinaryExpression[operator=/^[<>]=?$/] > MemberExpression[property.name=/remaining|[Tt]hreshold|Below$/]',
          message:
            'Call needsAction()/hasExpired() from @evergreen-stellar/core — never hand-write a TTL threshold or expiry comparison (docs/CONVENTIONS.md § One home for a policy).',
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },

  {
    // `ttl.ts` IS the one home. The predicates have to write the comparison
    // somewhere, and this is the somewhere — which is the whole point of the
    // rule above: exactly one file may, and every other module must call it.
    files: ['packages/core/src/ttl.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'No default exports (docs/CONVENTIONS.md). Use a named export.',
        },
      ],
    },
  },

  {
    // Vite/Vitest configs are the one place a default export is required.
    files: ['*.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  prettier,
);
