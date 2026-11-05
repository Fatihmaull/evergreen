/**
 * PH2-E2-05 pre-launch list (Rakha, 2026-11-02): the budget order check, the
 * rejected "0", and the per-user cap of 50 live watch items. The budget rules
 * are unit tests of `parseAutopilot`; the cap runs on the in-memory store and on
 * a real Postgres engine (PGlite) with the real `PgWatchlistStore.add` SQL.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { StrKey } from '@stellar/stellar-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgAuthStore, type SqlClient } from '../src/auth/pg-store.js';
import { MemoryWatchlistStore } from '../src/watchlist/memory-store.js';
import { PgWatchlistStore } from '../src/watchlist/pg-store.js';
import {
  WATCH_ITEMS_PER_USER_MAX,
  WatchItemCapReached,
  type WatchlistStore,
} from '../src/watchlist/store.js';
import { parseAutopilot } from '../src/watchlist/validate.js';

const G = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const contract = (n: number): string => StrKey.encodeContract(Buffer.alloc(32, n));
const NO_KEYS = { noDataKeys: true } as const;

const body = (perJob: unknown, per30: unknown) => ({
  enabled: true,
  payerWallet: G,
  thresholdLedgers: 1000,
  extendToLedgers: 5000,
  budget: { perJobMaxStroops: perJob, per30DaysMaxStroops: per30 },
});

describe('parseAutopilot budget rules', () => {
  it('accepts perJob equal to per30 (the boundary)', () => {
    expect(parseAutopilot(body('5', '5')).ok).toBe(true);
  });
  it('accepts perJob below per30', () => {
    const r = parseAutopilot(body('1', '5'));
    expect(r).toMatchObject({
      ok: true,
      value: { perJobMaxStroops: '1', per30DaysMaxStroops: '5' },
    });
  });
  it('compares as integers, not strings ("9" < "10")', () => {
    expect(parseAutopilot(body('9', '10')).ok).toBe(true);
  });
  it('refuses perJob one stroop above per30, naming perJobMaxStroops', () => {
    expect(parseAutopilot(body('6', '5'))).toEqual({
      ok: false,
      field: 'autopilot.budget.perJobMaxStroops',
      message: 'perJobMaxStroops must not be above per30DaysMaxStroops.',
    });
  });
  it('refuses a "0" per-job budget', () => {
    expect(parseAutopilot(body('0', '5'))).toMatchObject({
      ok: false,
      field: 'autopilot.budget.perJobMaxStroops',
    });
  });
  it('refuses a "0" 30-day budget', () => {
    expect(parseAutopilot(body('1', '0'))).toMatchObject({
      ok: false,
      field: 'autopilot.budget.per30DaysMaxStroops',
    });
  });
  it('turning autopilot off needs no budget, so "0" never arises there', () => {
    expect(parseAutopilot({ enabled: false })).toEqual({ ok: true, value: { enabled: false } });
  });
});

async function fill(store: WatchlistStore, userId: string, n: number): Promise<void> {
  for (let i = 1; i <= n; i++) {
    await store.add(userId, { network: 'testnet', contractId: contract(i), scope: NO_KEYS }, 1);
  }
}
const addN = (store: WatchlistStore, userId: string, n: number) =>
  store.add(userId, { network: 'testnet', contractId: contract(n), scope: NO_KEYS }, 2);

function capSuite(
  name: string,
  make: () => Promise<{ store: WatchlistStore; user: () => Promise<string> }>,
) {
  describe(`the per-user cap of 50 (${name})`, () => {
    let store: WatchlistStore;
    let user: () => Promise<string>;
    beforeAll(async () => {
      ({ store, user } = await make());
    }, 60_000);

    it('is 50', () => expect(WATCH_ITEMS_PER_USER_MAX).toBe(50));

    it('49 live items: the 50th is created', async () => {
      const u = await user();
      await fill(store, u, 49);
      expect(await addN(store, u, 50)).toBe('created');
    });

    it('50 live items: the 51st throws and nothing is stored; re-adding a live one is still existing', async () => {
      const u = await user();
      await fill(store, u, 50);
      await expect(addN(store, u, 51)).rejects.toBeInstanceOf(WatchItemCapReached);
      expect(await store.list(u, 3)).toHaveLength(50);
      expect(await addN(store, u, 50)).toBe('existing');
    });

    it('restoring a removed item counts against the cap', async () => {
      const u = await user();
      await fill(store, u, 50);
      expect(await store.remove(u, 'testnet', contract(1), 3)).toBe(true);
      expect(await addN(store, u, 51)).toBe('created');
      await expect(addN(store, u, 1)).rejects.toBeInstanceOf(WatchItemCapReached);
      expect(await store.list(u, 4)).toHaveLength(50);
    });

    it('counts per user: another user is unaffected', async () => {
      const a = await user();
      const b = await user();
      await fill(store, a, 50);
      expect(await addN(store, b, 1)).toBe('created');
    });
  });
}

let memN = 0;
capSuite('memory store', () =>
  Promise.resolve({ store: new MemoryWatchlistStore(), user: () => Promise.resolve(`u${++memN}`) }),
);

let pg: PGlite;
afterAll(async () => {
  await pg?.close();
});
let pgN = 0;
capSuite('Postgres, PGlite', async () => {
  pg = await PGlite.create({ extensions: { pgcrypto } });
  const db = (f: string): string => readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8');
  for (const f of [
    'schema.sql',
    '0002_jobs_daily_limit_per_user.sql',
    '0003_auth_rate_counters_wallet_challenges.sql',
    '0004_users_reactivated_at.sql',
  ])
    await pg.exec(db(f));
  const sql: SqlClient = {
    query: async (text, params) =>
      (await pg.query<Record<string, unknown>>(text, [...params])).rows,
    transaction: async (queries) =>
      pg.transaction(async (tx) => {
        const out: Record<string, unknown>[][] = [];
        for (const q of queries)
          out.push((await tx.query<Record<string, unknown>>(q.text, [...q.params])).rows);
        return out;
      }),
  };
  const auth = new PgAuthStore(sql, () => 0);
  return {
    store: new PgWatchlistStore(sql),
    user: async () => (await auth.upsertUserByEmail(`cap${++pgN}@example.invalid`, 1)).id,
  };
});
