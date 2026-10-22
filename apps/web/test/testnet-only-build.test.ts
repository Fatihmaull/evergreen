/**
 * The published site may not be built for anything but testnet.
 *
 * `resolveNetwork` in core refuses a mainnet build that is **misconfigured** —
 * no `SOROBAN_RPC_URL` — which is the right guard for the CLI and the wrong
 * level for this site. A *correctly* configured mainnet build would sail past
 * it and publish a dashboard reading mainnet with "Testnet only. Read-only:
 * these pages never sign or submit anything." still in the footer of every
 * page. One environment variable, no error anywhere.
 *
 * Testnet only until DoD-2 is met (`PH2-E5-02`, `AGENTS.md` hard rule 1), and
 * `web-reference/design-language/claims-and-copy.md` puts any mainnet reference
 * on the never-appears list. `src/lib/network.ts` is network-agnostic on
 * purpose, so this is the one thing standing between that plumbing and a
 * mainnet artefact — which is why it is asserted rather than trusted.
 *
 * The refusal is the first thing `build.mjs` does, before it typechecks or
 * writes anything, so these spawns cost milliseconds rather than a build.
 */
import { describe, expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNetwork } from '../../../packages/core/src/index';

const BUILD = fileURLToPath(new URL('../build.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function build(env: Record<string, string | undefined>): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync('node', [BUILD], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, EVERGREEN_WEB_OUT: undefined, ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('the site refuses to be built for another network', () => {
  test('mainnet is refused, and the message says why rather than how', () => {
    const { status, stderr } = build({ EVERGREEN_NETWORK: 'mainnet' });
    expect(status).not.toBe(0);
    expect(stderr).toContain('EVERGREEN_NETWORK is "mainnet"');
    // The reason a reader needs is the rule and the card, not the mechanism.
    expect(stderr).toContain('PH2-E5-02');
    expect(stderr).toContain('Testnet only');
  });

  test('an unknown network is refused too, not only mainnet', () => {
    // A name core does not know would otherwise reach `resolveNetwork` and
    // fail there with a different message, from a different layer.
    const { status, stderr } = build({ EVERGREEN_NETWORK: 'futurenet' });
    expect(status).not.toBe(0);
    expect(stderr).toContain('EVERGREEN_NETWORK is "futurenet"');
  });

  /**
   * A real build, so the timeout is a build's worth. The default 5 s passed
   * only because `tsc` happened to be warm; in the full suite it is not, and a
   * test that depends on build-cache state is a flake waiting for CI.
   */
  test('an empty value is unset, not an error', { timeout: 180_000 }, () => {
    // An exported-but-empty variable is how a CI step passes "no opinion", and
    // `resolveNetwork` treats it as unset. Asserting only that the refusal
    // string is ABSENT would pass for any failure at all, so this also asserts
    // the build got past the refusal and started — into a temporary directory,
    // so the test never writes the published site.
    const out = mkdtempSync(join(tmpdir(), 'evergreen-network-test-'));
    try {
      const { status, stdout, stderr } = build({ EVERGREEN_NETWORK: '', EVERGREEN_WEB_OUT: out });
      expect(stderr).not.toContain('EVERGREEN_NETWORK is');
      expect(stdout).toContain('building 31 routes into');
      expect(status).toBe(0);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  /**
   * Rakha's blocker on #345. The refusal above reads a network NAME, and an
   * RPC URL is not one: `resolveNetwork({ env: 'testnet', rpcUrl: <a mainnet
   * endpoint> })` returns the testnet name and the testnet passphrase pointed
   * at mainnet, so the refusal never fires. #338 tells developers to export
   * `SOROBAN_RPC_URL` for the CLI's mainnet reads, so this is a normal shell
   * rather than a contrived one, and the result was a page saying "Testnet
   * only" over mainnet data.
   */
  test('SOROBAN_RPC_URL is not inherited by the site', { timeout: 180_000 }, () => {
    const out = mkdtempSync(join(tmpdir(), 'evergreen-rpc-test-'));
    try {
      const { status, stdout } = build({
        SOROBAN_RPC_URL: 'https://mainnet.example.invalid/rpc',
        EVERGREEN_WEB_OUT: out,
      });
      expect(status).toBe(0);
      // Announced, not silently dropped: someone pointing the site at a
      // private testnet RPC would otherwise watch it quietly not work.
      expect(stdout).toContain('SOROBAN_RPC_URL is set and NOT used');
      for (const bundle of readdirSync(join(out, 'assets')).filter((f) => f.endsWith('.js'))) {
        expect(readFileSync(join(out, 'assets', bundle), 'utf8')).not.toContain('mainnet.example');
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  /**
   * The shell's two literals must be the same answer core's resolver gives.
   * `chrome-client.ts` cannot import `resolveNetwork` without pulling core's
   * table into every page's bundle, so `build.mjs` reads the table itself —
   * and two readers of one fact are two chances to disagree.
   */
  test("the shell's literals match core's resolver", { timeout: 180_000 }, () => {
    const out = mkdtempSync(join(tmpdir(), 'evergreen-shell-test-'));
    try {
      build({ EVERGREEN_WEB_OUT: out });
      const shell = readFileSync(join(out, 'assets/chrome.js'), 'utf8');
      const expected = resolveNetwork({});
      expect(shell).toContain(expected.rpcUrl);
      expect(shell).toContain(expected.passphrase);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
