/**
 * Stage 1b with a fake RPC built from a recorded testnet response (core's fixture). No network:
 * every read goes to the injected fetch.
 */
import { readFileSync } from 'node:fs';
import type { TenantItem, TenantPlan } from '@evergreen/engine/dist/tenants.js';
import { describe, expect, it } from 'vitest';
import { countDue, createFetchReader, scanRequest } from '../src/due.js';
import { evaluate } from '../src/evaluate.js';
import type { FetchLike } from '../src/tick.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
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
const INSTANCE_CODE = fixture.result.entries.slice(0, 2);
const minRemaining = Math.min(...INSTANCE_CODE.map((e) => e.liveUntilLedgerSeq - AT));

/** Answers getLedgerEntries from the fixture; records every call. */
function fakeRpc(opts: { latest?: number; fail?: boolean; hang?: boolean } = {}) {
  const calls: { url: string; method: string; signal: boolean }[] = [];
  const fetch: FetchLike = (url, init) => {
    const body = JSON.parse(String(init.body)) as { method: string; params: { keys: string[] } };
    calls.push({ url, method: body.method, signal: init.signal instanceof AbortSignal });
    if (opts.hang)
      return new Promise((_, reject) =>
        init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    if (opts.fail) return Promise.resolve(new Response('no', { status: 503 }));
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
  return { fetch, calls };
}

const item = (threshold: bigint, scope: unknown = { noDataKeys: true }): TenantItem => ({
  userId: 'u',
  contractId: A,
  scope,
  thresholdLedgers: threshold,
  extendToLedgers: threshold + 1000n,
  budget: { perJobMax: 1n, per30dRemaining: 1n },
});
const plan = (...items: TenantItem[]): TenantPlan[] => [
  { network: 'testnet', payerAccount: 'G', items },
];
const reader = (rpc: ReturnType<typeof fakeRpc>, timeoutMs = 1000) =>
  createFetchReader({ rpcUrl: 'https://rpc.example.invalid', fetch: rpc.fetch, timeoutMs });

describe('countDue', () => {
  it('due at the threshold (inclusive), not due one ledger above it', async () => {
    const rpc = fakeRpc();
    expect(
      await countDue(plan(item(BigInt(minRemaining)), item(BigInt(minRemaining - 1))), reader(rpc)),
    ).toEqual({ due: 1, notDue: 1, expired: 0, undetermined: 0 });
    expect(rpc.calls.every((c) => c.method === 'getLedgerEntries' && c.signal)).toBe(true);
  });

  it('an entry whose TTL has ended is expired, not due', async () => {
    const latest = Math.max(...INSTANCE_CODE.map((e) => e.liveUntilLedgerSeq)) + 1;
    expect(await countDue(plan(item(10n ** 9n)), reader(fakeRpc({ latest })))).toEqual({
      due: 0,
      notDue: 0,
      expired: 1,
      undetermined: 0,
    });
  });

  it('a failed read is undetermined, never due or not due', async () => {
    expect(await countDue(plan(item(10n ** 9n)), reader(fakeRpc({ fail: true })))).toEqual({
      due: 0,
      notDue: 0,
      expired: 0,
      undetermined: 1,
    });
  });

  it('a hung read is cut by the per-read timeout and is undetermined', async () => {
    const started = Date.now();
    expect(await countDue(plan(item(1n)), reader(fakeRpc({ hang: true }), 50))).toMatchObject({
      undetermined: 1,
    });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('a scope that is not one of the API shapes is undetermined and is not read', async () => {
    const rpc = fakeRpc();
    expect(await countDue(plan(item(1n, { surprise: 1 })), reader(rpc))).toMatchObject({
      undetermined: 1,
    });
    expect(rpc.calls).toEqual([]);
  });

  it('no planned items means no RPC call', async () => {
    const rpc = fakeRpc();
    expect(await countDue([], reader(rpc))).toEqual({
      due: 0,
      notDue: 0,
      expired: 0,
      undetermined: 0,
    });
    expect(rpc.calls).toEqual([]);
  });
});

describe('scanRequest', () => {
  it.each([
    [{ noDataKeys: true }, { contract: { id: A }, noDataKeys: true }],
    [{ dataKeys: ['k'] }, { contract: { id: A }, dataKeys: ['k'] }],
    [{ noDataKeys: false }, null],
    [{ dataKeys: [1] }, null],
    [{ noDataKeys: true, dataKeys: [] }, null],
    [null, null],
  ])('%j → %j', (scope, expected) => expect(scanRequest(item(1n, scope))).toEqual(expected));
});

describe('evaluate with a reader', () => {
  it('adds due counts to the summary and still issues only SELECTs', async () => {
    const seen: string[] = [];
    const { summary } = await evaluate(async (sql) => {
      seen.push(sql);
      return [];
    }, reader(fakeRpc()));
    expect(summary.due).toEqual({ due: 0, notDue: 0, expired: 0, undetermined: 0 });
    expect(seen.every((s) => /^\s*select/i.test(s))).toBe(true);
  });
});
