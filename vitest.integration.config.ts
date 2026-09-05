import { defineConfig } from 'vitest/config';

// Integration tests hit real testnet RPC. Run them deliberately:
//   pnpm test:integration
// They are never part of `pnpm test` and never run in CI by default
// (AGENTS.md hard rule 9, docs/CONVENTIONS.md § Testing).
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30_000,
  },
});
