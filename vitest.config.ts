import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // docs/CONVENTIONS.md § Testing — the default run never touches the network.
    // Integration tests live in *.integration.test.ts and are excluded here on
    // purpose; run them deliberately with `pnpm test:integration`.
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      // `bin.ts` is process glue — argv, stdout, exit codes — and covering it
      // would mean testing Node rather than Evergreen. Every decision it makes
      // lives in `command.ts`, which IS covered. Excluded deliberately so the
      // threshold below measures logic instead of being diluted by wiring.
      exclude: ['packages/cli/src/bin.ts'],
      /**
       * A floor, not a target (`W2-D14-01`). CONVENTIONS asks for meaningful
       * coverage on core math/cost/decision logic, explicitly NOT 100% on glue.
       * Set just under the current numbers so an accidental drop fails CI while
       * honest refactors do not, and raise it when it is comfortably exceeded.
       */
      thresholds: {
        statements: 88,
        branches: 84,
        functions: 88,
        lines: 89,
      },
    },
  },
});
