import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The one test that runs the ARTIFACT rather than the source.
 *
 * `vitest.config.ts` aliases `@evergreen-stellar/core` to `src`, which makes
 * staleness impossible and takes the build out of the inner loop — but it means
 * every other test exercises source that is not what ships. This covers the
 * gap: the built binary, spawned as a user spawns it.
 *
 * Offline on purpose. Network behaviour is covered by fixtures and by the
 * recorded evidence runs; what needs proving here is that the compiled entry
 * point loads, resolves its imports, and behaves — the class of failure a
 * source-aliased suite is structurally blind to.
 */

const BIN = new URL('../dist/bin.js', import.meta.url).pathname;

function run(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync('node', [BIN, ...args], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 20_000,
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', status: e.status ?? -1 };
  }
}

describe.skipIf(!existsSync(BIN))('the built artifact runs', () => {
  it('loads and prints help — proves the compiled import graph resolves', () => {
    // A source-aliased suite cannot catch a broken build, a missing export in
    // `dist`, or an ESM specifier that only works under the bundler.
    const { stdout, status } = run(['--help']);
    expect(status).toBe(0);
    expect(stdout).toContain('usage: evergreen scan');
  });

  it('rejects a malformed contract ID without touching the network', () => {
    const { stderr, status } = run(['scan', 'NOT_A_CONTRACT_ID']);
    expect(status).toBe(2);
    expect(stderr).toContain('Not a Stellar contract ID');
  });

  it('emits no stack trace from the compiled binary', () => {
    // The no-raw-traces rule is about what a USER sees, and a user sees dist.
    const { stderr } = run(['scan', 'NOT_A_CONTRACT_ID']);
    expect(stderr).not.toMatch(/\n\s+at /);
    expect(stderr).not.toContain('node:internal');
  });

  it('documents the four health states in its own help output', () => {
    // Keeps the shipped help honest about the states the shipped code emits.
    const { stdout } = run(['--help']);
    for (const state of ['HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN']) {
      expect(stdout).toContain(state);
    }
  });
});
