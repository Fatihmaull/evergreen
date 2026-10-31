/**
 * 0010_scheduler_ticks_rpc_ms_ok.sql on PGlite, after schema.sql → 0002 → … → 0006 → 0008 → 0009.
 * (0007 is not needed: neither 0008, 0009 nor 0010 depends on it in this harness; see the 0008 test.)
 *
 * Test-harness only: the 0008 neon_superuser guard line is removed (PGlite has no such role).
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const NEON_LINE = "       OR pg_has_role(r, 'neon_superuser', 'MEMBER')\n";
const s0008 = db('0008_roles_grants.sql');
const s0009 = db('0009_connect_and_scheduler_ticks_select.sql');
const s0010 = db('0010_scheduler_ticks_rpc_ms_ok.sql');
let pg: PGlite;

const as = async (role: string, sql: string) => {
  await pg.exec(`SET ROLE ${role}`);
  try {
    return await pg.query(sql);
  } finally {
    await pg.exec('RESET ROLE');
  }
};

describe('0010 scheduler_ticks rpc_ms / ok on PGlite', () => {
  beforeAll(async () => {
    pg = await PGlite.create({ extensions: { pgcrypto } });
    for (const f of [
      'schema.sql',
      '0002_jobs_daily_limit_per_user.sql',
      '0003_auth_rate_counters_wallet_challenges.sql',
      '0004_users_reactivated_at.sql',
      '0005_scheduler_ticks.sql',
      '0006_jobs_submitted_hashes.sql',
    ])
      await pg.exec(db(f));
    await pg.exec('CREATE ROLE eg_api LOGIN; CREATE ROLE eg_scheduler LOGIN;');
    if (!s0008.includes(NEON_LINE)) throw new Error('0008 neon_superuser guard line not found');
    await pg.exec(s0008.replace(NEON_LINE, ''));
    await pg.exec(s0009);
    // A tick written before 0010.
    await pg.exec('INSERT INTO scheduler_ticks (observed_ledger) VALUES (7)');
    await pg.exec(s0010);
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  it('existing rows read ok = true, rpc_ms NULL', async () => {
    const { rows } = await pg.query<{ ok: boolean; rpc_ms: number | null }>(
      'SELECT ok, rpc_ms FROM scheduler_ticks WHERE observed_ledger = 7',
    );
    expect(rows).toEqual([{ ok: true, rpc_ms: null }]);
  });

  it("today's scheduler INSERT (observed_ledger only) still works and defaults ok = true", async () => {
    await as('eg_scheduler', 'INSERT INTO scheduler_ticks (observed_ledger) VALUES (8)');
    const { rows } = await pg.query<{ ok: boolean }>(
      'SELECT ok FROM scheduler_ticks WHERE observed_ledger = 8',
    );
    expect(rows).toEqual([{ ok: true }]);
  });

  it('eg_scheduler writes a failed tick: NULL observed_ledger, ok = false, rpc_ms', async () => {
    await as(
      'eg_scheduler',
      'INSERT INTO scheduler_ticks (ticked_at, observed_ledger, rpc_ms, ok) VALUES (now(), NULL, 3400, false)',
    );
    const { rows } = await pg.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM scheduler_ticks WHERE observed_ledger IS NULL AND ok = false AND rpc_ms = 3400',
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('eg_scheduler writes a successful tick with rpc_ms', async () => {
    await as(
      'eg_scheduler',
      'INSERT INTO scheduler_ticks (observed_ledger, rpc_ms, ok) VALUES (9, 120, true)',
    );
  });

  it.each([
    ['observed_ledger = 0', 'INSERT INTO scheduler_ticks (observed_ledger) VALUES (0)'],
    ['observed_ledger < 0', 'INSERT INTO scheduler_ticks (observed_ledger) VALUES (-1)'],
    ['rpc_ms < 0', 'INSERT INTO scheduler_ticks (observed_ledger, rpc_ms) VALUES (10, -1)'],
  ])('CHECK refuses %s', async (_n, sql) => {
    await expect(pg.query(sql)).rejects.toThrow(/check constraint/);
  });

  it('ok cannot be NULL', async () => {
    await expect(
      pg.query('INSERT INTO scheduler_ticks (observed_ledger, ok) VALUES (10, NULL)'),
    ).rejects.toThrow(/null value/);
  });

  it('eg_scheduler still has no SELECT, UPDATE or DELETE on scheduler_ticks (K1)', async () => {
    for (const sql of [
      'SELECT * FROM scheduler_ticks',
      'SELECT ok FROM scheduler_ticks',
      'UPDATE scheduler_ticks SET ok = false',
      'DELETE FROM scheduler_ticks',
    ])
      await expect(as('eg_scheduler', sql)).rejects.toThrow(/permission denied/);
  });

  it('eg_scheduler still cannot set id', async () => {
    await expect(
      as('eg_scheduler', 'INSERT INTO scheduler_ticks (id, observed_ledger) VALUES (999, 11)'),
    ).rejects.toThrow(/permission denied|cannot insert/);
  });

  it("eg_api's 0009 SELECT covers the new columns, still read-only", async () => {
    const { rows } = await as(
      'eg_api',
      'SELECT rpc_ms, ok, observed_ledger FROM scheduler_ticks ORDER BY id DESC LIMIT 1',
    );
    expect(rows.length).toBe(1);
    await expect(
      as('eg_api', 'INSERT INTO scheduler_ticks (observed_ledger, ok) VALUES (12, false)'),
    ).rejects.toThrow(/permission denied/);
  });

  it('is idempotent: applying 0010 again keeps rows, columns, CHECK and grants', async () => {
    const before = await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM scheduler_ticks');
    await pg.exec(s0010);
    const after = await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM scheduler_ticks');
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    const { rows } = await pg.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = 'scheduler_ticks'::regclass AND contype = 'c'",
    );
    expect(rows[0]!.n).toBe(2); // observed_ledger_positive + rpc_ms_check
    await expect(
      pg.query('INSERT INTO scheduler_ticks (observed_ledger) VALUES (0)'),
    ).rejects.toThrow(/check constraint/);
    await as(
      'eg_scheduler',
      'INSERT INTO scheduler_ticks (observed_ledger, rpc_ms, ok) VALUES (13, 5, false)',
    );
    await expect(as('eg_scheduler', 'SELECT * FROM scheduler_ticks')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('after a 0008 re-run, the new INSERT columns are gone until 0009 + 0010 are re-run', async () => {
    await pg.exec(s0008.replace(NEON_LINE, ''));
    await expect(
      as('eg_scheduler', 'INSERT INTO scheduler_ticks (observed_ledger, ok) VALUES (14, false)'),
    ).rejects.toThrow(/permission denied/);
    await pg.exec(s0009);
    await pg.exec(s0010);
    await as(
      'eg_scheduler',
      'INSERT INTO scheduler_ticks (observed_ledger, ok) VALUES (14, false)',
    );
  });
});
