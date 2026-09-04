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
    },
  },
});
