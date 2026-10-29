/**
 * apps/api/db applied in order on PGlite: schema.sql → 0002 → 0003 → 0004 → 0005. Checks 0004's
 * users.reactivated_at shape, 0005's scheduler_ticks, and that rows from before a migration survive it.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const U = '00000000-0000-4000-8000-0000000000a1';
let pg: PGlite;

describe('apps/api/db migrations on PGlite', () => {
  beforeAll(async () => {
    pg = await PGlite.create({ extensions: { pgcrypto } });
    for (const f of [
      'schema.sql',
      '0002_jobs_daily_limit_per_user.sql',
      '0003_auth_rate_counters_wallet_challenges.sql',
    ])
      await pg.exec(db(f));
    await pg.exec(`INSERT INTO users (id, email) VALUES ('${U}', 'before@example.invalid')`);
    await pg.exec(db('0004_users_reactivated_at.sql'));
    await pg.exec(db('0005_scheduler_ticks.sql'));
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  it('0004 adds users.reactivated_at as nullable timestamptz with no default', async () => {
    const { rows } = await pg.query<{
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'reactivated_at'`,
    );
    expect(rows).toEqual([
      { data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null },
    ]);
  });

  it('a row from before 0004 survives with reactivated_at NULL, and a new row defaults to NULL', async () => {
    await pg.exec(`INSERT INTO users (email) VALUES ('after@example.invalid')`);
    const { rows } = await pg.query<{ email: string; reactivated_at: Date | null }>(
      'SELECT email, reactivated_at FROM users ORDER BY email',
    );
    expect(rows).toEqual([
      { email: 'after@example.invalid', reactivated_at: null },
      { email: 'before@example.invalid', reactivated_at: null },
    ]);
  });

  it('0004 is idempotent: re-applying keeps existing values', async () => {
    await pg.exec(`UPDATE users SET reactivated_at = '2026-10-27T00:00:00Z' WHERE id = '${U}'`);
    await pg.exec(db('0004_users_reactivated_at.sql'));
    const { rows } = await pg.query<{ reactivated_at: Date }>(
      `SELECT reactivated_at FROM users WHERE id = '${U}'`,
    );
    expect(rows[0]!.reactivated_at.toISOString()).toBe('2026-10-27T00:00:00.000Z');
  });

  describe('0005 scheduler_ticks', () => {
    it('has exactly id, ticked_at, observed_ledger with the expected types and nullability', async () => {
      const { rows } = await pg.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_name = 'scheduler_ticks' ORDER BY ordinal_position`,
      );
      expect(rows).toEqual([
        { column_name: 'id', data_type: 'bigint', is_nullable: 'NO' },
        { column_name: 'ticked_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
        { column_name: 'observed_ledger', data_type: 'bigint', is_nullable: 'NO' },
      ]);
    });

    it('records a tick with ticked_at defaulting to now() and an identity id', async () => {
      const { rows } = await pg.query<{ id: number; fresh: boolean }>(
        `INSERT INTO scheduler_ticks (observed_ledger) VALUES (123456)
         RETURNING id, ticked_at > now() - interval '1 minute' AS fresh`,
      );
      expect(rows[0]!.fresh).toBe(true);
      expect(Number(rows[0]!.id)).toBeGreaterThan(0);
    });

    it.each([
      ['observed_ledger missing', 'INSERT INTO scheduler_ticks (ticked_at) VALUES (now())'],
      ['observed_ledger 0', 'INSERT INTO scheduler_ticks (observed_ledger) VALUES (0)'],
      ['observed_ledger negative', 'INSERT INTO scheduler_ticks (observed_ledger) VALUES (-1)'],
      [
        'ticked_at NULL',
        'INSERT INTO scheduler_ticks (ticked_at, observed_ledger) VALUES (NULL, 5)',
      ],
      ['a hand-written id', 'INSERT INTO scheduler_ticks (id, observed_ledger) VALUES (999, 5)'],
    ])('rejects %s', async (_n, sql) => {
      await expect(pg.exec(sql)).rejects.toThrow();
    });

    it('is idempotent: re-applying 0005 keeps existing ticks', async () => {
      const before = (
        await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM scheduler_ticks')
      ).rows[0]!.n;
      await pg.exec(db('0005_scheduler_ticks.sql'));
      const after = (
        await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM scheduler_ticks')
      ).rows[0]!.n;
      expect(after).toBe(before);
      expect(after).toBeGreaterThan(0);
    });
  });
});
