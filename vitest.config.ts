import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    /**
     * Unit tests read SOURCE, not `dist`.
     *
     * Without this, a cross-package test resolves `@evergreen-stellar/core`
     * through `main` to the built output, so a change to `core/src` is
     * invisible until a build runs. Demonstrated 2026-09-10: mutating
     * `coverageIssues` to return `[]` — which should break three tests —
     * reported 9 passed against a stale `dist`.
     *
     * The sharp version of the hazard is that it corrupts mutation testing
     * across the package boundary: a mutation that never reaches `dist` reads
     * as "no test covers this", which is the reassuring answer and the wrong
     * one. Building before `test` closed the hole; this removes it, and takes
     * the build out of the inner loop.
     *
     * **What this gives up:** unit tests no longer exercise the artifact that
     * ships. `packages/cli/test/artifact.integration.test.ts` covers that — the
     * bundled CLI, run as a user runs it — so speed and truthfulness are split
     * deliberately rather than traded.
     */
    alias: {
      '@evergreen-stellar/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
      '@evergreen-stellar/shared-types': new URL(
        './packages/shared-types/src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
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
        /**
         * PER-FILE floors on the modules where a regression is expensive.
         *
         * A global number cannot see a new critical module landing at 0% — the
         * hole `rent-quoter.ts` sat in while the global read a healthy 85%. It
         * reopens the moment the next one arrives, so the modules that decide
         * things carry their own floor.
         *
         * Deliberately NOT applied to `rpc.ts` or `bin.ts`: those are network
         * adapter and process glue, and covering them means testing the SDK or
         * Node rather than Evergreen.
         */
        'packages/core/src/ttl.ts': { statements: 95, branches: 95, lines: 95 },
        'packages/core/src/rent.ts': { statements: 90, branches: 80, lines: 90 },
        'packages/core/src/rent-quoter.ts': { statements: 90, branches: 80, lines: 90 },
        'packages/core/src/health.ts': { statements: 90, branches: 90, lines: 90 },
        'packages/core/src/liveness.ts': { statements: 90, branches: 85, lines: 90 },
        'packages/core/src/config.ts': { statements: 85, branches: 75, lines: 85 },
        'packages/core/src/network-config.ts': { statements: 85, branches: 75, lines: 85 },
        'packages/cli/src/cost.ts': { statements: 95, branches: 80, lines: 95 },
      },
    },
  },
});
