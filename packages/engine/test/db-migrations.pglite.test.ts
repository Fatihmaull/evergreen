/**
 * apps/api/db applied in order on PGlite: schema.sql → 0002 → 0003 → 0004. Checks 0004's
 * users.reactivated_at shape and that rows from before the migration survive it.
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
});
