/**
 * PH2-E2-05 Postgres WatchlistStore over a fake SqlClient: no driver, no
 * network. The fake records every statement and answers from a queue, so these
 * tests pin the SQL shape (every statement scoped to the user, the ownership
 * check on the payer, the atomic remove) and the mapping back to store types.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PgWatchlistStore,
  type NewWatchItem,
  type SqlClient,
  type SqlQuery,
  type SqlRow,
} from '../src/index.js';

class FakeSql implements SqlClient {
  readonly queries: SqlQuery[] = [];
  readonly transactions: SqlQuery[][] = [];
  readonly answers: SqlRow[][] = [];
  txAnswer: SqlRow[][] | undefined;
  query(text: string, params: readonly unknown[]): Promise<SqlRow[]> {
    this.queries.push({ text, params });
    return Promise.resolve(this.answers.shift() ?? []);
  }
  transaction(queries: readonly SqlQuery[]): Promise<SqlRow[][]> {
    this.transactions.push([...queries]);
    return Promise.resolve(this.txAnswer ?? queries.map(() => []));
  }
}

const UID = '00000000-0000-4000-8000-000000000001';
const C = `C${'A'.repeat(55)}`;
const G = `G${'B'.repeat(55)}`;
const NOW = 1_800_000_000;

let sql: FakeSql;
let store: PgWatchlistStore;
beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is off in tests');
  });
  sql = new FakeSql();
  store = new PgWatchlistStore(sql);
});
afterEach(() => vi.unstubAllGlobals());

const baseRow = (over: SqlRow = {}): SqlRow => ({
  network: 'testnet',
  contract_id: C,
  label: null,
  added_at: '1799999000',
  scope: { noDataKeys: true },
  autopilot_enabled: false,
  payer_account: null,
  threshold_ledgers: null,
  extend_to_ledgers: null,
  budget_per_job_max: null,
  budget_per_30d_max: null,
  used_today: 0,
  oldest_use: null,
  observed_at_ledger: null,
  observed_at: null,
  scan: null,
  health: null,
  ...over,
});

describe('reads', () => {
  it('list is scoped to the user, hides removed items and passes the clock', async () => {
    await store.list(UID, NOW);
    const q = sql.queries[0]!;
    expect(q.text).toContain('w.user_id = $1::uuid AND w.removed_at IS NULL');
    expect(q.params).toEqual([UID, NOW]);
  });

  it('get is scoped to the user as well as the item', async () => {
    await store.get(UID, 'testnet', C, NOW);
    const q = sql.queries[0]!;
    expect(q.text).toContain('w.user_id = $1::uuid');
    expect(q.text).toContain('w.network = $3 AND w.contract_id = $4');
    expect(q.params).toEqual([UID, NOW, 'testnet', C]);
  });

  it('counts only extend-now jobs that pulled funds, in a rolling 24 hours', async () => {
    await store.list(UID, NOW);
    const text = sql.queries[0]!.text;
    expect(text).toContain("j.kind = 'extend-now' AND j.pull_tx_hash IS NOT NULL");
    expect(text).toContain("j.pulled_at > to_timestamp($2) - interval '24 hours'");
    expect(text).toContain('j.user_id = w.user_id');
  });

  it('maps a plain row', async () => {
    sql.answers.push([baseRow({ label: 'vault' })]);
    expect(await store.get(UID, 'testnet', C, NOW)).toEqual({
      network: 'testnet',
      contractId: C,
      label: 'vault',
      addedAt: 1_799_999_000,
      scope: { noDataKeys: true },
      extendNow: { usedToday: 0 },
      lastObservation: null,
    });
  });

  it('maps autopilot, uses and the latest observation; stroops stay strings', async () => {
    sql.answers.push([
      baseRow({
        autopilot_enabled: true,
        payer_account: G,
        threshold_ledgers: '15888',
        extend_to_ledgers: '63552',
        budget_per_job_max: '50000000',
        budget_per_30d_max: '170141183460469231731687303715884105727',
        used_today: 2,
        oldest_use: '1799990000',
        observed_at_ledger: '123',
        observed_at: '1799999900',
        scan: { a: 1 },
        health: 'healthy',
      }),
    ]);
    const [r] = await store.list(UID, NOW);
    expect(r).toMatchObject({
      autopilot: {
        payerWallet: G,
        thresholdLedgers: 15888,
        extendToLedgers: 63552,
        perJobMaxStroops: '50000000',
        per30DaysMaxStroops: '170141183460469231731687303715884105727',
      },
      extendNow: { usedToday: 2, oldestUseAt: 1_799_990_000 },
      lastObservation: {
        observedAtLedger: 123,
        observedAt: 1_799_999_900,
        scan: { a: 1 },
        health: 'healthy',
      },
    });
  });

  it('answers undefined for no row', async () => {
    expect(await store.get(UID, 'testnet', C, NOW)).toBeUndefined();
  });
});

describe('add', () => {
  const item: NewWatchItem = {
    network: 'testnet',
    contractId: C,
    label: 'vault',
    scope: { noDataKeys: true },
  };

  it('is ONE statement, scoped to the user, and never overwrites a live row', async () => {
    sql.answers.push([{ outcome: 'created' }]);
    expect(await store.add(UID, item, NOW)).toBe('created');
    expect(sql.queries).toHaveLength(1);
    const q = sql.queries[0]!;
    expect(q.text).toContain(
      'ON CONFLICT (user_id, network, contract_id) DO UPDATE SET removed_at = NULL',
    );
    expect(q.text).toContain('WHERE watch_items.removed_at IS NOT NULL');
    expect(q.params).toEqual([UID, 'testnet', C, 'vault', '{"noDataKeys":true}', NOW]);
  });

  it.each(['created', 'restored', 'existing'] as const)('maps outcome %s', async (outcome) => {
    sql.answers.push([{ outcome }]);
    expect(await store.add(UID, item, NOW)).toBe(outcome);
  });

  it('fails closed on an unexpected answer', async () => {
    await expect(store.add(UID, item, NOW)).rejects.toThrow(/Unexpected/);
  });

  it('stores no label as NULL', async () => {
    sql.answers.push([{ outcome: 'created' }]);
    await store.add(UID, { network: 'testnet', contractId: C, scope: { noDataKeys: true } }, NOW);
    expect(sql.queries[0]!.params[3]).toBeNull();
  });
});

describe('update', () => {
  const on = {
    enabled: true as const,
    payerWallet: G,
    thresholdLedgers: 15_888,
    extendToLedgers: 63_552,
    perJobMaxStroops: '50000000',
    per30DaysMaxStroops: '200000000',
  };

  it('scopes every UPDATE to the user and to live rows', async () => {
    sql.answers.push([{ ok: 1 }]);
    expect(await store.update(UID, 'testnet', C, { label: 'x' })).toBe('updated');
    const q = sql.queries[0]!;
    expect(q.text).toContain(
      'user_id = $1::uuid AND network = $2 AND contract_id = $3 AND removed_at IS NULL',
    );
    expect(q.text).toContain('SET label = $4');
    expect(q.params).toEqual([UID, 'testnet', C, 'x']);
  });

  it('requires the payer wallet to be this user’s own when turning autopilot on', async () => {
    sql.answers.push([{ ok: 1 }]);
    await store.update(UID, 'testnet', C, { autopilot: on });
    const q = sql.queries[0]!;
    // The wallet must be the caller's own AND count as linked under the reactivation rule
    // (#385 option 2). The rule's behaviour is proven on Postgres in reactivation.pglite.test.ts.
    expect(q.text).toContain("x.network = 'testnet' AND x.account = $4 AND x.user_id = $1::uuid");
    expect(q.text).toContain('(u.reactivated_at IS NULL OR x.linked_at > u.reactivated_at)');
    expect(q.text).toContain("payer_network = 'testnet', payer_account = $4");
    expect(q.params).toEqual([UID, 'testnet', C, G, 15_888, 63_552, '50000000', '200000000']);
  });

  it('tells an unowned payer from a missing item', async () => {
    sql.answers.push([], [{ found: 1 }]);
    expect(await store.update(UID, 'testnet', C, { autopilot: on })).toBe('payer-not-linked');
    sql.answers.push([], []);
    expect(await store.update(UID, 'testnet', C, { autopilot: on })).toBe('not-found');
    expect(sql.queries[1]!.text).toContain('user_id = $1::uuid');
  });

  it('turns autopilot off by releasing the payer', async () => {
    sql.answers.push([{ ok: 1 }]);
    await store.update(UID, 'testnet', C, { autopilot: { enabled: false } });
    expect(sql.queries[0]!.text).toContain(
      'autopilot_enabled = false, payer_network = NULL, payer_account = NULL',
    );
    expect(sql.queries[0]!.text).not.toContain('EXISTS');
  });

  it('writes scope as jsonb', async () => {
    sql.answers.push([{ ok: 1 }]);
    await store.update(UID, 'testnet', C, { scope: { dataKeys: ['k'] } });
    expect(sql.queries[0]!.text).toContain('scope = $4::jsonb');
    expect(sql.queries[0]!.params[3]).toBe('{"dataKeys":["k"]}');
  });

  it('writes nothing for an empty patch', async () => {
    expect(await store.update(UID, 'testnet', C, {})).toBe('updated');
    expect(sql.queries).toHaveLength(0);
  });
});

describe('remove', () => {
  it('cancels queued jobs and marks the item removed in ONE transaction, scoped to the user', async () => {
    sql.txAnswer = [[], [{ ok: 1 }]];
    expect(await store.remove(UID, 'testnet', C, NOW)).toBe(true);
    expect(sql.queries).toHaveLength(0);
    const [jobs, item] = sql.transactions[0]!;
    expect(jobs!.text).toContain("SET status = 'cancelled'");
    expect(jobs!.text).toContain("status = 'queued' AND pull_tx_hash IS NULL");
    expect(jobs!.text).toContain('user_id = $1::uuid');
    expect(item!.text).toContain('removed_at = to_timestamp($4), autopilot_enabled = false');
    expect(item!.text).toContain('user_id = $1::uuid');
    expect(item!.params).toEqual([UID, 'testnet', C, NOW]);
  });

  it('only cancels jobs of an item that is live and the user’s', async () => {
    sql.txAnswer = [[], []];
    await store.remove(UID, 'testnet', C, NOW);
    expect(sql.transactions[0]![0]!.text).toContain(
      'EXISTS (SELECT 1 FROM watch_items WHERE user_id = $1::uuid',
    );
  });

  it('answers false when no row was removed', async () => {
    sql.txAnswer = [[], []];
    expect(await store.remove(UID, 'testnet', C, NOW)).toBe(false);
  });
});
