import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
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
        assert.equal(result.alertReceipts.length, 1);
        assert.equal(result.alertReceipts[0].status, 'preview');
        if (scenario === 'rpc-timeout') assert.equal(result.execution, undefined);
        else {
          assert.equal(result.execution.records[0].outcome, 'failed');
          assert.equal(result.execution.records[0].txHash, undefined);
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
