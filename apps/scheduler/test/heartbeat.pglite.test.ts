/**
 * The heartbeat on a real Postgres engine (PGlite), with the real migrations applied in order
 * (schema.sql → 0002 → 0003 → 0004 → 0005 → 0010), run **as a role holding the least the tick
 * needs on `scheduler_ticks`**: after 0010, `INSERT (observed_ledger, rpc_ms, ok)` and nothing
 * else. 0008 granted `ticked_at` too; 0010 revokes it (K1), so the Worker cannot choose its own
 * heartbeat time, and this test applies the real 0010 over 0008's grant to prove it. Least
 * privilege is only worth claiming if the code works under it, and one natural way to write the
 * insert (`RETURNING id`) does not.
 *
 * A failed tick writes a row (`ok = false`); a row that is not a heartbeat must not be read as one,
 * so what the DoD-2 check reads here is `WHERE ok`.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import {
  lowestPassingActionWindowLedgers,
  schedulerGapCheck,
  tickGapsLedgers,
  worstGapLedgers,
} from '@evergreen-stellar/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INSERT_TICK_SQL, TickError, runTick, type FetchLike, type TickDeps } from '../src/tick.js';

const db = (f: string): string =>
  readFileSync(new URL(`../../api/db/${f}`, import.meta.url), 'utf8');
const TESTNET = 'Test SDF Network ; September 2015';
const ROLE = 'eg_scheduler';

let pg: PGlite;

/** Runs `fn` with the session role switched to the scheduler's, then back to the owner. */
async function asScheduler<T>(fn: () => Promise<T>): Promise<T> {
  await pg.exec(`SET ROLE ${ROLE}`);
  try {
    return await fn();
  } finally {
    await pg.exec('RESET ROLE');
  }
}

const schedulerQuery: TickDeps['query'] = (text, params) =>
  asScheduler(() => pg.query(text, [...params]));

/** An RPC that reports the testnet and a given latest ledger. */
function rpcAt(sequence: number): FetchLike {
  return (_url, init) => {
    const { method } = JSON.parse(String(init.body)) as { method: string };
    const result = method === 'getNetwork' ? { passphrase: TESTNET } : { sequence };
    return Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 }),
    );
  };
}

const tickAt = (sequence: number) =>
  runTick({
    rpcUrl: 'https://rpc.example.invalid',
    expectedPassphrase: TESTNET,
    fetch: rpcAt(sequence),
    query: schedulerQuery,
  });

/** The ledgers of the successful ticks, in order: what the gap and DoD-2 checks read. */
const ledgers = async (): Promise<number[]> =>
  (
    await pg.query<{ observed_ledger: string }>(
      'SELECT observed_ledger FROM scheduler_ticks WHERE ok ORDER BY id',
    )
  ).rows.map((r) => Number(r.observed_ledger));

type TickRow = { observed_ledger: number | null; rpc_ms: number | null; ok: boolean };
const rowsOf = async (): Promise<TickRow[]> =>
  (
    await pg.query<{ observed_ledger: string | null; rpc_ms: number | null; ok: boolean }>(
      'SELECT observed_ledger, rpc_ms, ok FROM scheduler_ticks ORDER BY id',
    )
  ).rows.map((r) => ({
    observed_ledger: r.observed_ledger === null ? null : Number(r.observed_ledger),
    rpc_ms: r.rpc_ms,
    ok: r.ok,
  }));

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { pgcrypto } });
  for (const f of [
    'schema.sql',
    '0002_jobs_daily_limit_per_user.sql',
    '0003_auth_rate_counters_wallet_challenges.sql',
    '0004_users_reactivated_at.sql',
    '0005_scheduler_ticks.sql',
  ])
    await pg.exec(db(f));
  await pg.exec(`
    CREATE ROLE ${ROLE};
    GRANT USAGE ON SCHEMA public TO ${ROLE};
    -- What 0008 granted (the K1 hole), so the real 0010 below has something to revoke.
    GRANT INSERT (ticked_at, observed_ledger) ON scheduler_ticks TO ${ROLE};
  `);
  await pg.exec(db('0010_scheduler_ticks_rpc_ms_ok.sql'));
}, 60_000);
afterAll(async () => {
  await pg?.close();
});

describe('the heartbeat under the scheduler role', () => {
  it('🔴 records a tick with only the grants the matrix gives the scheduler', async () => {
    expect(await tickAt(65_143_700)).toMatchObject({ observedLedger: 65_143_700 });
    expect(await ledgers()).toEqual([65_143_700]);
    expect(await rowsOf()).toEqual([
      { observed_ledger: 65_143_700, rpc_ms: expect.any(Number), ok: true },
    ]);
  });

  it('🔴 ticked_at is the database clock, set by its default and not by the Worker', async () => {
    const { rows } = await pg.query<{ fresh: boolean; present: boolean }>(
      `SELECT ticked_at > now() - interval '1 minute' AS fresh, ticked_at IS NOT NULL AS present FROM scheduler_ticks`,
    );
    expect(rows[0]).toEqual({ fresh: true, present: true });
  });

  it('🔴 the Worker cannot supply ticked_at: a compromised scheduler cannot forge when it ticked', async () => {
    await expect(
      asScheduler(() =>
        pg.query(
          `INSERT INTO scheduler_ticks (ticked_at, observed_ledger) VALUES ('2020-01-01', 5)`,
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('🔴 INSERT … RETURNING id is DENIED under that role: this is why the tick never uses RETURNING', async () => {
    await expect(
      asScheduler(() => pg.query(`${INSERT_TICK_SQL} RETURNING id`, [65_143_800, 250, true])),
    ).rejects.toThrow(/permission denied/i);
    // And the plain statement the tick actually uses is allowed.
    await expect(
      asScheduler(() => pg.query(INSERT_TICK_SQL, [65_143_800, 250, true])),
    ).resolves.toBeDefined();
    expect(await ledgers()).toEqual([65_143_700, 65_143_800]);
  });

  it.each([
    ['read the table', 'SELECT observed_ledger FROM scheduler_ticks'],
    ['update a tick', 'UPDATE scheduler_ticks SET observed_ledger = 1'],
    ['delete a tick', 'DELETE FROM scheduler_ticks'],
    ['read a user', 'SELECT email FROM users'],
    ['write the money ledger', `INSERT INTO fee_ledger (job_id) VALUES (gen_random_uuid())`],
  ])('🔴 the role cannot %s', async (_, statement) => {
    await expect(asScheduler(() => pg.query(statement))).rejects.toThrow(/permission denied/i);
  });

  it('🔴 the id cannot be written at all: it is GENERATED ALWAYS, which Postgres checks before privileges', async () => {
    await expect(
      asScheduler(() =>
        pg.query('INSERT INTO scheduler_ticks (id, observed_ledger) VALUES (999, 5)'),
      ),
    ).rejects.toThrow(/cannot insert a non-DEFAULT value/i);
  });

  it('🔴 without its grant a tick fails as DB_FAILED and leaks nothing from the driver', async () => {
    await pg.exec(`REVOKE INSERT (observed_ledger, rpc_ms, ok) ON scheduler_ticks FROM ${ROLE}`);
    try {
      const error = await tickAt(65_143_900).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TickError);
      expect((error as TickError).code).toBe('DB_FAILED');
      expect(String(error)).not.toMatch(/permission|scheduler_ticks/i);
      expect(await ledgers()).toEqual([65_143_700, 65_143_800]);
      // Not even a failed row can be written without the grant, and that is not what the error says.
      expect(await rowsOf()).toHaveLength(2);
    } finally {
      await pg.exec(`GRANT INSERT (observed_ledger, rpc_ms, ok) ON scheduler_ticks TO ${ROLE}`);
    }
  });

  it('🔴 a tick whose RPC failed writes a failed row, which the heartbeat and gap reads do not see', async () => {
    const before = await ledgers();
    const rowsBefore = (await rowsOf()).length;
    await expect(
      runTick({
        rpcUrl: 'https://rpc.example.invalid',
        expectedPassphrase: TESTNET,
        fetch: () => Promise.reject(new TypeError('Network connection lost')),
        query: schedulerQuery,
      }),
    ).rejects.toMatchObject({ code: 'RPC_UNREACHABLE', recorded: true });
    // A heartbeat means the tick reached the chain: the ok-only reads are unchanged ...
    expect(await ledgers()).toEqual(before);
    // ... and the failure is on record: ok false, no ledger, no rpc_ms (the RPC never returned).
    const rows = await rowsOf();
    expect(rows).toHaveLength(rowsBefore + 1);
    expect(rows.at(-1)).toEqual({ observed_ledger: null, rpc_ms: null, ok: false });
    const { rows: newest } = await pg.query<{ id: string }>(
      'SELECT id FROM scheduler_ticks WHERE ok ORDER BY ticked_at DESC, id DESC LIMIT 1',
    );
    expect(Number(newest[0]!.id)).toBeLessThan(
      Number(
        (await pg.query<{ m: string }>('SELECT max(id) AS m FROM scheduler_ticks')).rows[0]!.m,
      ),
    );
  });

  it('🔴 the database refuses a good row with no ledger: the scheduler cannot fake an ok tick', async () => {
    await expect(asScheduler(() => pg.query(INSERT_TICK_SQL, [null, 100, true]))).rejects.toThrow(
      /scheduler_ticks_ok_has_ledger/,
    );
    await expect(
      asScheduler(() => pg.query('INSERT INTO scheduler_ticks (rpc_ms) VALUES (100)')),
    ).rejects.toThrow(/scheduler_ticks_ok_has_ledger/);
  });
});

describe('from heartbeats to the DoD-2 check, end to end', () => {
  it('🔴 ticks written by the Worker give the gaps, the worst gap and the check', async () => {
    await pg.exec('TRUNCATE scheduler_ticks');
    // 15-minute ticks are about 180 ledgers apart; one tick was late by three intervals.
    // A failed tick in the middle is on record but is not a measurement of the chain.
    for (const sequence of [1_000_000, 1_000_180, 1_000_360]) await tickAt(sequence);
    await expect(
      runTick({
        rpcUrl: 'https://rpc.example.invalid',
        expectedPassphrase: TESTNET,
        fetch: () => Promise.reject(new TypeError('Network connection lost')),
        query: schedulerQuery,
      }),
    ).rejects.toMatchObject({ recorded: true });
    for (const sequence of [1_000_900, 1_001_080]) await tickAt(sequence);

    const observed = await ledgers();
    expect(observed).toEqual([1_000_000, 1_000_180, 1_000_360, 1_000_900, 1_001_080]);
    const gaps = tickGapsLedgers(observed);
    expect(gaps).toEqual([180, 180, 540, 180]);
    expect(worstGapLedgers(gaps)).toBe(540);

    // 4 × 540 = 2,160, strictly below the 17,280 default: passes. And it is the floor to publish.
    expect(schedulerGapCheck(540, 17_280)).toEqual({ passes: true, marginLedgers: 2_160 });
    expect(lowestPassingActionWindowLedgers(540)).toBe(2_161);
  });

  it('a single tick is undetermined, not a perfect score', async () => {
    await pg.exec('TRUNCATE scheduler_ticks');
    await tickAt(2_000_000);
    expect(worstGapLedgers(tickGapsLedgers(await ledgers()))).toBeUndefined();
  });

  it('🔴 a testnet reset (the ledger goes down) is refused, not averaged across', async () => {
    await pg.exec('TRUNCATE scheduler_ticks');
    await tickAt(3_000_000);
    await tickAt(40);
    const observed = await ledgers();
    expect(observed).toEqual([3_000_000, 40]);
    expect(() => tickGapsLedgers(observed)).toThrow(/not in ledger order/);
  });
});
