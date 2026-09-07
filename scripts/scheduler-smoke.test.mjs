import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { Contract, Networks, xdr } from '@stellar/stellar-sdk';
import { CONTRACT_ID, runSchedulerSmoke } from './scheduler-smoke.mjs';

const recorded = JSON.parse(
  readFileSync(
    new URL('../packages/core/test/fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url),
    'utf8',
  ),
).result;
const fixture = () => ({
  latestLedger: recorded.latestLedger,
  entries: [
    {
      key: xdr.LedgerKey.fromXdr(recorded.entries[0].key, 'base64'),
      val: xdr.LedgerEntryData.fromXdr(recorded.entries[0].xdr, 'base64'),
      liveUntilLedgerSeq: recorded.entries[0].liveUntilLedgerSeq,
    },
  ],
});
const serverWith = (result) => ({
  getNetwork: async () => ({ passphrase: Networks.TESTNET, protocolVersion: 28 }),
  getLedgerEntries: async (key) => {
    assert.equal(key.toXdr('base64'), new Contract(CONTRACT_ID).getFootprint().toXdr('base64'));
    return result;
  },
});

test('the command emits a structured error and exits nonzero for an RPC failure', () => {
  const script = new URL('./scheduler-smoke.mjs', import.meta.url);
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    globalThis.fetch = async () => new Response(JSON.stringify({
      jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'offline RPC failure' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    process.argv = [process.execPath, ${JSON.stringify(fileURLToPath(script))}];
    await import(${JSON.stringify(script.href)});
  `,
    ],
    { encoding: 'utf8', env: {}, timeout: 10000 },
  );
  assert.ifError(child.error);
  assert.equal(child.status, 1, child.stderr);
  assert.equal(JSON.parse(child.stdout).status, 'started');
  const failure = JSON.parse(child.stderr);
  assert.equal(failure.status, 'error');
  assert.equal(failure.trigger, 'local');
  assert.equal(failure.error, 'offline RPC failure');
});

test('reads only the A instance and calculates remaining TTL from its response ledger', async () => {
  const result = await runSchedulerSmoke(serverWith(fixture()));
  assert.deepEqual(result, {
    network: 'Testnet',
    protocolVersion: 28,
    contractId: CONTRACT_ID,
    latestLedger: 4512641,
    liveUntilLedgerSeq: 4633568,
    remainingLedgers: 120927,
  });
});

test('refuses a different network before requesting any ledger entries', async () => {
  await assert.rejects(
    runSchedulerSmoke({
      getNetwork: async () => ({ passphrase: 'wrong-network' }),
      getLedgerEntries: async () => assert.fail('Network guard must run before the entry read'),
    }),
    /Testnet passphrase/,
  );
});

test('propagates network and entry-read failures instead of reporting success', async () => {
  for (const method of ['getNetwork', 'getLedgerEntries']) {
    const server = serverWith(fixture());
    server[method] = async () => {
      throw new Error('RPC unavailable');
    };
    await assert.rejects(runSchedulerSmoke(server), /RPC unavailable/);
  }
});

test('rejects malformed ledger numbers', async () => {
  for (const latestLedger of [undefined, '4512641', 0, -1, 1.5]) {
    await assert.rejects(
      runSchedulerSmoke(serverWith({ ...fixture(), latestLedger })),
      /latestLedger/,
    );
  }
});

test('rejects missing, malformed, empty, or duplicate entry arrays', async () => {
  const entry = fixture().entries[0];
  for (const entries of [undefined, null, {}, [], [entry, entry]]) {
    await assert.rejects(runSchedulerSmoke(serverWith({ ...fixture(), entries })), /exactly one/);
  }
});

test('rejects malformed entries and entries for other ledger keys', async () => {
  for (const entry of [
    null,
    {},
    { key: xdr.LedgerKey.fromXdr(recorded.entries[1].key, 'base64') },
  ]) {
    await assert.rejects(
      runSchedulerSmoke(serverWith({ ...fixture(), entries: [entry] })),
      /unexpected ledger key/,
    );
  }
});

test('requires a valid TTL on the returned instance', async () => {
  for (const ttl of [undefined, null, '4633568', 0, -1, 1.5]) {
    const result = fixture();
    result.entries[0].liveUntilLedgerSeq = ttl;
    await assert.rejects(runSchedulerSmoke(serverWith(result)), /liveUntilLedgerSeq/);
  }
});

test('accepts the inclusive final live ledger but rejects an entry beyond it', async () => {
  const result = fixture();
  result.latestLedger = result.entries[0].liveUntilLedgerSeq;
  assert.equal((await runSchedulerSmoke(serverWith(result))).remainingLedgers, 0);
  result.latestLedger += 1;
  await assert.rejects(runSchedulerSmoke(serverWith(result)), /past its final live ledger/);
});
