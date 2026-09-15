import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import {
  privateEnvReader,
  assertReadOnlyRpc,
  READ_ONLY_RPC_METHODS,
} from './rehearse-engine-alerts.mjs';
for (const scenario of ['rpc-timeout', 'insufficient-balance', 'missed-run']) {
  test(`real command rehearses ${scenario} without network or signer`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'rehearse-test-'));
    try {
      execFileSync(
        process.execPath,
        ['scripts/rehearse-engine-alerts.mjs', scenario, root, 'fixture'],
        { stdio: 'pipe', timeout: 15000 },
      );
      const { injection, result } = JSON.parse(
        await readFile(join(root, 'fixture-rehearsal.json'), 'utf8'),
      );
      assert.equal(injection.emailRequests, 0);
      assert.equal(injection.stellarNetworkRequests, 0);
      assert.equal(injection.rpcMethods.includes('sendTransaction'), false);
      if (scenario === 'missed-run') {
        assert.equal(result.assessment.status, 'missing');
        assert.equal(injection.repeatedStatus, 'deduplicated');
        assert.equal(result.receipt.status, 'preview');
      } else {
        // Network validation uses the existing three-attempt read retry policy.
        assert.equal(injection.injectedFailures, scenario === 'rpc-timeout' ? 3 : 1);
        assert.equal(result.exitCode, 2);
        assert.equal(result.alertReceipts.length, scenario === 'insufficient-balance' ? 2 : 1);
        assert(result.alertReceipts.every((r) => r.status === 'preview'));
        assert.equal(
          new Set(result.alertReceipts.map((r) => r.id)).size,
          result.alertReceipts.length,
        );
        if (scenario === 'rpc-timeout') assert.equal(result.execution, undefined);
        else {
          assert.equal(result.execution.records[0].outcome, 'failed');
          assert.equal(result.execution.records[0].transactionHash, undefined);
          assert(result.alertReceipts.some((r) => r.id.includes(':bump:')));
          assert(
            result.alertReceipts.some((r) =>
              r.notification.body.includes('Code: EXECUTION_INCOMPLETE'),
            ),
          );
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

/**
 * The two barriers nobody had seen fire.
 *
 * This harness runs with `mode: 'live'` and `--submit`, and submission is
 * unreachable four ways over. But three of the four are *upstream* of these two:
 * every scenario injects a failure that stops execution before signing is
 * reached, so deleting either of these left all three tests green when mutated on
 * 2026-09-15. They are not load-bearing for the scenarios that exist.
 *
 * That is a fact about the scenarios that exist. Adding one without an upstream
 * failure — an afternoon's work — silently promotes both to load-bearing on a
 * path that can submit, with nothing verifying either. Carrying that as a known
 * risk for a fifth report is how it stops being mentioned rather than how it gets
 * decided, so they are exercised directly here instead.
 */
test('the signer barrier refuses exactly the names that could produce a key', () => {
  const read = privateEnvReader({
    EVERGREEN_SIGNER_SECRET: 'S-must-not-be-returned',
    ARTIFACT_SEED: 'S-must-not-be-returned',
    PATH: '/usr/bin',
  });
  // The config points secretEnvVar at ARTIFACT_SEED on purpose, so this is the
  // lookup that would otherwise hand back a signing key.
  assert.throws(() => read('EVERGREEN_SIGNER_SECRET'), /must not access a signer/);
  assert.throws(() => read('ARTIFACT_SEED'), /must not access a signer/);
  // It is a deny-list, not a blanket refusal: the harness still needs its
  // environment, and a barrier that blocked everything would be untestable from
  // the outside and useless from the inside.
  assert.equal(read('PATH'), '/usr/bin');
  assert.equal(read('NOT_SET_ANYWHERE'), undefined);
});

test('the RPC barrier permits reads and refuses everything that writes', () => {
  for (const method of READ_ONLY_RPC_METHODS) assert.doesNotThrow(() => assertReadOnlyRpc(method));
  // The one that matters: a submission cannot leave this harness.
  assert.throws(() => assertReadOnlyRpc('sendTransaction'), /Write RPC forbidden/);
  for (const method of ['sendTransaction', 'simulateTransactionAsync', 'getEvents', ''])
    assert.throws(() => assertReadOnlyRpc(method), /Write RPC forbidden/);
  // Default-deny rather than a deny-list: an RPC method invented after this was
  // written is refused without anyone remembering to add it.
  assert.throws(() => assertReadOnlyRpc('someMethodAddedNextYear'), /Write RPC forbidden/);
  assert.equal(READ_ONLY_RPC_METHODS.includes('sendTransaction'), false);
});
