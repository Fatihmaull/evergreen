import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBoundary } from './verify-ttl-boundary.mjs';

const metadata = { key: 'temporary-fixture-key', liveUntilLedgerSeq: 100 };
const observation = (latestLedger, present, ttl = 100) => ({
  jsonrpc: '2.0',
  result: {
    latestLedger,
    entries: present ? [{ key: metadata.key, liveUntilLedgerSeq: ttl }] : [],
  },
});

test('confirms only with the final live ledger and the immediately following absent ledger', () => {
  const result = verifyBoundary([observation(100, true), observation(101, false)], metadata);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.presentAtBoundary, true);
  assert.equal(result.presentAtNextLedger, false);
});

test('does not turn a skipped boundary into a confirmation', () => {
  const result = verifyBoundary([observation(99, true), observation(102, false)], metadata);
  assert.equal(result.status, 'inconclusive');
  assert.equal(result.presentAtBoundary, null);
  assert.equal(result.presentAtNextLedger, null);
});

test('reports an entry absent on its advertised final live ledger as a contradiction', () => {
  assert.equal(verifyBoundary([observation(100, false)], metadata).status, 'contradicted');
});

test('reports a still-present entry after expiry as a contradiction', () => {
  assert.equal(verifyBoundary([observation(101, true)], metadata).status, 'contradicted');
});

test('rejects RPC errors rather than treating an unavailable read as absence', () => {
  assert.throws(() => verifyBoundary([{ error: { code: -32603 } }], metadata), /RPC error/);
});

test('rejects missing or malformed entries instead of confirming expiry', () => {
  for (const result of [
    { latestLedger: 101 },
    { latestLedger: 101, entries: null },
    { latestLedger: 101, entries: {} },
  ]) {
    assert.throws(
      () => verifyBoundary([observation(100, true), { result }], metadata),
      /Malformed getLedgerEntries result/,
    );
  }
});

test('rejects an intervening TTL change', () => {
  assert.throws(() => verifyBoundary([observation(99, true, 200)], metadata), /TTL changed/);
});

test('rejects malformed or unrelated array members instead of confirming expiry', () => {
  for (const candidate of [{}, null, [], 'invalid-entry', { key: 'unrelated-key' }]) {
    assert.throws(
      () =>
        verifyBoundary(
          [observation(100, true), { result: { latestLedger: 101, entries: [candidate] } }],
          metadata,
        ),
      /Malformed single-key getLedgerEntries result/,
    );
  }
});

test('rejects multiple entries in a response to the single-key observation', () => {
  const duplicate = observation(100, true);
  duplicate.result.entries.push({ key: metadata.key, liveUntilLedgerSeq: 200 });
  assert.throws(
    () => verifyBoundary([duplicate, observation(101, false)], metadata),
    /Malformed single-key getLedgerEntries result/,
  );
});

test('rejects conflicting observations for one ledger', () => {
  assert.throws(
    () => verifyBoundary([observation(100, true), observation(100, false)], metadata),
    /Conflicting observations/,
  );
});

test('requires a real ledger number instead of trusting malformed RPC data', () => {
  assert.throws(() => verifyBoundary([observation('100', true)], metadata), /Malformed/);
});
