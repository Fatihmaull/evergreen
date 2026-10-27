/**
 * The reactivation rule on a real Postgres engine (PGlite), with the real migrations applied in
 * order: schema.sql → 0002 → 0003 → 0004. docs/API.md §10, ADR-008, #385 option 2.
 *
 * An email session never authorises XLM movement, so a user who comes back by email must (a) have
 * autopilot off on every item (#454) and (b) re-sign a wallet before it can be an autopilot payer
 * again. The rule: a wallet counts only if the account was never reactivated, or the wallet was
 * linked STRICTLY after the last reactivation. Unit tests over fake SQL can pin a statement's
 * shape but not what Postgres does with it; these run the statements.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgAuthStore, type SqlClient } from '../src/auth/pg-store.js';
import { PgWatchlistStore } from '../src/watchlist/pg-store.js';

const db = (f: string): string => readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8');

const G = (c: string): string => `G${c.repeat(55)}`;
const C = (c: string): string => `C${c.repeat(55)}`;
const AUTOPILOT = {
  enabled: true as const,
  thresholdLedgers: 1000,
  extendToLedgers: 5000,
  perJobMaxStroops: '100',
  per30DaysMaxStroops: '300',
} as const;

let pg: PGlite;
let auth: PgAuthStore;
let watch: PgWatchlistStore;

const sql: SqlClient = {
  query: async (text, params) => (await pg.query<Record<string, unknown>>(text, [...params])).rows,
  transaction: async (queries) =>
    pg.transaction(async (tx) => {
      const out: Record<string, unknown>[][] = [];
      for (const q of queries)
        out.push((await tx.query<Record<string, unknown>>(q.text, [...q.params])).rows);
      return out;
    }),
};

const one = async (text: string, params: unknown[] = []): Promise<Record<string, unknown>> =>
  (await pg.query<Record<string, unknown>>(text, params)).rows[0]!;
const epoch = async (col: string, id: string): Promise<number | null> => {
  const r = await one(
    `SELECT extract(epoch from ${col})::float8 AS t FROM users WHERE id = $1::uuid`,
    [id],
  );
  return r['t'] === null ? null : Number(r['t']);
};
const linkedAt = async (account: string): Promise<number> =>
  Number(
    (
      await one(
        `SELECT extract(epoch from linked_at)::float8 AS t FROM wallets WHERE account = $1`,
        [account],
      )
    )['t'],
  );
const autopilotOn = async (userId: string): Promise<boolean[]> =>
  (
    await pg.query<{ on: boolean }>(
      `SELECT autopilot_enabled AS on FROM watch_items WHERE user_id = $1::uuid ORDER BY contract_id`,
      [userId],
    )
  ).rows.map((r) => r.on);

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { pgcrypto } });
  for (const f of [
    'schema.sql',
    '0002_jobs_daily_limit_per_user.sql',
    '0003_auth_rate_counters_wallet_challenges.sql',
    '0004_users_reactivated_at.sql',
  ])
    await pg.exec(db(f));
  auth = new PgAuthStore(sql, () => 0);
  watch = new PgWatchlistStore(sql);
}, 60_000);
afterAll(async () => {
  await pg?.close();
});

async function newUser(email: string): Promise<string> {
  return (await auth.upsertUserByEmail(email, 1_000)).id;
}
const deactivate = (id: string): Promise<unknown> =>
  pg.query(`UPDATE users SET deactivated_at = now() WHERE id = $1::uuid`, [id]);
async function addItem(userId: string, contract: string): Promise<void> {
  await pg.query(
    `INSERT INTO watch_items (user_id, network, contract_id, scope) VALUES ($1::uuid, 'testnet', $2, '{"noDataKeys":true}')`,
    [userId, contract],
  );
}

describe('signing in again stamps users.reactivated_at only on a real reactivation', () => {
  it('🔴 a user who was never deactivated keeps reactivated_at NULL and autopilot untouched', async () => {
    const id = await newUser('plain@example.invalid');
    await auth.linkWallet(id, G('P'), 1_000);
    await addItem(id, C('P'));
    expect(
      await watch.update(id, 'testnet', C('P'), {
        autopilot: { ...AUTOPILOT, payerWallet: G('P') },
      }),
    ).toBe('updated');
    await auth.upsertUserByEmail('plain@example.invalid', 2_000);
    expect(await epoch('reactivated_at', id)).toBeNull();
    expect(await autopilotOn(id)).toEqual([true]);
  });

  it('🔴 a deactivated user is reactivated on the same row, stamped with `now`, and autopilot goes off', async () => {
    const id = await newUser('gone@example.invalid');
    await auth.linkWallet(id, G('G'), 1_000);
    await addItem(id, C('G'));
    await addItem(id, C('H'));
    await watch.update(id, 'testnet', C('G'), { autopilot: { ...AUTOPILOT, payerWallet: G('G') } });
    await watch.update(id, 'testnet', C('H'), { autopilot: { ...AUTOPILOT, payerWallet: G('G') } });
    await deactivate(id);
    const again = await auth.upsertUserByEmail('GONE@example.invalid', 5_000);
    expect(again.id).toBe(id);
    expect(await epoch('reactivated_at', id)).toBe(5_000);
    expect(await epoch('deactivated_at', id)).toBeNull();
    expect(await autopilotOn(id)).toEqual([false, false]);
  });

  it('a second reactivation moves the stamp forward', async () => {
    const id = await newUser('twice@example.invalid');
    await deactivate(id);
    await auth.upsertUserByEmail('twice@example.invalid', 6_000);
    await deactivate(id);
    await auth.upsertUserByEmail('twice@example.invalid', 9_000);
    expect(await epoch('reactivated_at', id)).toBe(9_000);
  });
});

describe('signing a wallet challenge again refreshes linked_at, for the same user only', () => {
  it('🔴 the same user re-signing gets already-linked and a fresh linked_at', async () => {
    const id = await newUser('relink@example.invalid');
    expect(await auth.linkWallet(id, G('R'), 1_000)).toBe('created');
    expect(await auth.linkWallet(id, G('R'), 4_000)).toBe('already-linked');
    expect(await linkedAt(G('R'))).toBe(4_000);
  });

  it('🔴 another user gets linked-elsewhere and the owner’s linked_at is untouched', async () => {
    const owner = await newUser('owner@example.invalid');
    const other = await newUser('other@example.invalid');
    await auth.linkWallet(owner, G('O'), 1_000);
    expect(await auth.linkWallet(other, G('O'), 8_000)).toBe('linked-elsewhere');
    expect(await linkedAt(G('O'))).toBe(1_000);
  });
});

describe('PATCH: a payer counts as linked only if never reactivated or linked after reactivation', () => {
  async function reactivated(
    email: string,
    wallet: string,
    contract: string,
    linkedBefore: number,
    at: number,
  ): Promise<string> {
    const id = await newUser(email);
    await auth.linkWallet(id, wallet, linkedBefore);
    await addItem(id, contract);
    await deactivate(id);
    await auth.upsertUserByEmail(email, at);
    return id;
  }
  const turnOn = (id: string, contract: string, wallet: string) =>
    watch.update(id, 'testnet', contract, { autopilot: { ...AUTOPILOT, payerWallet: wallet } });

  it('🔴 a never-reactivated user can use their wallet', async () => {
    const id = await newUser('never@example.invalid');
    await auth.linkWallet(id, G('N'), 1_000);
    await addItem(id, C('N'));
    expect(await turnOn(id, C('N'), G('N'))).toBe('updated');
  });

  it('🔴 a wallet linked before the reactivation is refused with relink-required, and nothing changes', async () => {
    const id = await reactivated('stale@example.invalid', G('S'), C('S'), 1_000, 5_000);
    expect(await turnOn(id, C('S'), G('S'))).toBe('payer-relink-required');
    expect(await autopilotOn(id)).toEqual([false]);
  });

  it('🔴 re-signing after the reactivation makes the wallet count again', async () => {
    const id = await reactivated('resign@example.invalid', G('T'), C('T'), 1_000, 5_000);
    await auth.linkWallet(id, G('T'), 5_001);
    expect(await turnOn(id, C('T'), G('T'))).toBe('updated');
    expect(await autopilotOn(id)).toEqual([true]);
  });

  it('🔴 the boundary is strict: linked in the same second as the reactivation does not count', async () => {
    const id = await reactivated('equal@example.invalid', G('E'), C('E'), 1_000, 5_000);
    await auth.linkWallet(id, G('E'), 5_000);
    expect(await turnOn(id, C('E'), G('E'))).toBe('payer-relink-required');
  });

  it('🔴 someone else’s wallet is payer-not-linked, not relink-required', async () => {
    const mine = await newUser('mine@example.invalid');
    const theirs = await newUser('theirs@example.invalid');
    await auth.linkWallet(theirs, G('X'), 1_000);
    await addItem(mine, C('X'));
    expect(await turnOn(mine, C('X'), G('X'))).toBe('payer-not-linked');
  });

  it('an item that is not the caller’s is not-found', async () => {
    const id = await newUser('nofind@example.invalid');
    await auth.linkWallet(id, G('F'), 1_000);
    expect(await turnOn(id, C('F'), G('F'))).toBe('not-found');
  });
});
