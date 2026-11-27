/**
 * Engine observations with a fake RPC built from core's recorded testnet response. No network.
 */
import { readFileSync } from 'node:fs';
import type { ScanResult } from '@evergreen-stellar/shared-types';
import { describe, expect, it } from 'vitest';
import { createFetchReader } from '../src/due.js';
import {
  INSERT_OBSERVATION_SQL,
  WATCHED_SQL,
  observationOf,
  recordObservations,
  sliceScan,
} from '../src/observe.js';
import type { Query } from '../src/hosted-store.js';
import type { FetchLike } from '../src/tick.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const B = `C${'B'.repeat(55)}`;
const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/core/test/fixtures/getLedgerEntries-guinea-pig-a.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  result: {
    latestLedger: number;
    entries: { key: string; xdr: string; liveUntilLedgerSeq: number }[];
  };
};
const AT = fixture.result.latestLedger;

function fakeRpc(opts: { latest?: number; fail?: boolean } = {}) {
  let calls = 0;
  const fetch: FetchLike = (_url, init) => {
    calls += 1;
    if (opts.fail) return Promise.resolve(new Response('no', { status: 503 }));
    const body = JSON.parse(String(init.body)) as { params: { keys: string[] } };
    const entries = fixture.result.entries.filter((e) => body.params.keys.includes(e.key));
    return Promise.resolve(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { latestLedger: opts.latest ?? AT, entries },
        }),
        { status: 200 },
      ),
    );
  };
  return { fetch, calls: () => calls };
}
const reader = (rpc: ReturnType<typeof fakeRpc>) =>
  createFetchReader({ rpcUrl: 'https://rpc.example.invalid', fetch: rpc.fetch, timeoutMs: 1000 });

/** A fake database: answers WATCHED_SQL with `rows`, records every INSERT. */
function fakeDb(rows: Record<string, unknown>[]) {
  const inserts: unknown[][] = [];
  const query: Query = (text, params) => {
    if (text === WATCHED_SQL) return Promise.resolve(rows);
    if (text === INSERT_OBSERVATION_SQL) {
      inserts.push([...params]);
      return Promise.resolve([]);
    }
    return Promise.reject(new Error(`unexpected SQL: ${text}`));
  };
  return { query, inserts };
}

describe('recordObservations', () => {
  it('🔴 appends one row per watched contract, even when several users watch it', async () => {
    const db = fakeDb([
      { contract_id: A, scope: { noDataKeys: true } },
      { contract_id: A, scope: { noDataKeys: true } },
    ]);
    const rpc = fakeRpc();
    const summary = await recordObservations(db.query, reader(rpc));
    expect(summary).toEqual({ contracts: 1, written: 1, skipped: 0 });
    // Same reads as one watcher: core merges requests for one contract.
    const single = fakeRpc();
    await recordObservations(
      fakeDb([{ contract_id: A, scope: { noDataKeys: true } }]).query,
      reader(single),
    );
    expect(rpc.calls()).toBe(single.calls());
    const [contract, ledger, scanJson, health] = db.inserts[0] as [string, number, string, string];
    expect(contract).toBe(A);
    expect(ledger).toBe(AT);
    const scan = JSON.parse(scanJson) as ScanResult;
    expect(scan.contracts).toEqual([{ id: A }]);
    expect(Object.keys(scan.entries).length).toBeGreaterThan(0);
    expect(['healthy', 'warning', 'critical']).toContain(health);
  });

  it('🔴 a failed read writes no row: nothing was observed, the previous row stays', async () => {
    const db = fakeDb([{ contract_id: A, scope: { noDataKeys: true } }]);
    const summary = await recordObservations(db.query, reader(fakeRpc({ fail: true })));
    expect(summary).toEqual({ contracts: 1, written: 0, skipped: 1 });
    expect(db.inserts).toEqual([]);
  });

  it('an unreadable scope is skipped without a read', async () => {
    const db = fakeDb([{ contract_id: A, scope: { something: 'else' } }]);
    const rpc = fakeRpc();
    expect(await recordObservations(db.query, reader(rpc))).toEqual({
      contracts: 1,
      written: 0,
      skipped: 1,
    });
    expect(rpc.calls()).toBe(0);
  });

  it('no watched contracts: no read, no write', async () => {
    const db = fakeDb([]);
    const rpc = fakeRpc();
    expect(await recordObservations(db.query, reader(rpc))).toEqual({
      contracts: 0,
      written: 0,
      skipped: 0,
    });
    expect(rpc.calls()).toBe(0);
  });
});

describe('observationOf', () => {
  const entry = (contracts: string[], remainingLedgers: number) => ({
    kind: 'instance' as const,
    endBehavior: 'archived' as const,
    contracts,
    observedAtLedger: 1000,
    ttl: { status: 'known' as const, endsAtLedger: 1000 + remainingLedgers, remainingLedgers },
  });
  const scan = (remaining: number, issues: ScanResult['issues'] = []): ScanResult => ({
    network: 'testnet',
    contracts: [{ id: A }, { id: B }],
    entries: { ka: entry([A], remaining), kb: entry([B], 5) },
    issues,
    coverage: {
      mode: 'known-keys',
      dataKeysSuppliedByContract: { [A]: 0, [B]: 0 },
      noDataKeysDeclaredByContract: { [A]: true, [B]: true },
    },
  });

  it('slices to the one contract, with its coverage only', () => {
    const s = sliceScan(scan(3_000_000), A);
    expect(Object.keys(s.entries)).toEqual(['ka']);
    expect(s.contracts).toEqual([{ id: A }]);
    expect(s.coverage).toEqual({
      mode: 'known-keys',
      dataKeysSuppliedByContract: { [A]: 0 },
      noDataKeysDeclaredByContract: { [A]: true },
    });
  });

  it.each([
    [3_000_000, 'healthy'],
    [100_000, 'warning'],
    [17_280, 'critical'],
  ])('%i ledgers left grades %s on the default tiers', (remaining, health) => {
    expect(observationOf(sliceScan(scan(remaining), A), A)?.health).toBe(health);
  });

  it('another contract in the same scan does not change this one', () => {
    expect(observationOf(sliceScan(scan(3_000_000), A), A)?.health).toBe('healthy');
    expect(observationOf(sliceScan(scan(3_000_000), B), B)?.health).toBe('critical');
  });

  it('🔴 a failed read on the contract is unknown, never healthy', () => {
    const s = scan(3_000_000, [{ kind: 'rpc-error', contracts: [A], message: 'x' }]);
    expect(observationOf(sliceScan(s, A), A)?.health).toBe('unknown');
  });

  it('a coverage caveat alone does not make it unknown', () => {
    const s = scan(3_000_000, [{ kind: 'sharing-undetermined', contracts: [A], message: 'x' }]);
    expect(observationOf(sliceScan(s, A), A)?.health).toBe('healthy');
  });

  it('observed at the latest ledger any of its entries was read at', () => {
    expect(observationOf(sliceScan(scan(3_000_000), A), A)?.observedAtLedger).toBe(1000);
  });
});
