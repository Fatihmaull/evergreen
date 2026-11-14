/**
 * 0013_schema_migrations.sql on PGlite, after schema.sql → 0002 → … → 0006 → 0008 → 0009.
 * (0007 is not needed here; see the 0008 test.)
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
const s0013 = db('0013_schema_migrations.sql');
let pg: PGlite;

const as = async (role: string, sql: string) => {
  await pg.exec(`SET ROLE ${role}`);
  try {
    return await pg.query(sql);
  } finally {
    await pg.exec('RESET ROLE');
  }
};
type Row = { filename: string; source: string; apply_count: number; later: boolean };
const rows = async (): Promise<Row[]> =>
  (
    await pg.query<Row>(
      `SELECT filename, source, apply_count, last_applied_at > first_applied_at AS later
         FROM schema_migrations ORDER BY filename`,
    )
  ).rows;

describe('0013 migration ledger on PGlite', () => {
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
    await pg.exec(db('0009_connect_and_scheduler_ticks_select.sql'));
    await pg.exec(s0013);
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  it('records itself, and only itself, as applied', async () => {
    expect(await rows()).toEqual([
      { filename: '0013_schema_migrations.sql', source: 'applied', apply_count: 1, later: false },
    ]);
  });

  it('a re-run bumps apply_count instead of failing', async () => {
    await pg.exec(s0013);
    const [r] = await rows();
    expect(r!.apply_count).toBe(2);
    expect(r!.later).toBe(true);
  });

  it('a failed file in one transaction records nothing', async () => {
    await expect(
      pg.exec(`BEGIN;
        INSERT INTO schema_migrations (filename, source) VALUES ('0099_broken.sql', 'applied');
        SELECT no_such_function();
        COMMIT;`),
    ).rejects.toThrow();
    await pg.exec('ROLLBACK');
    expect((await rows()).map((r) => r.filename)).toEqual(['0013_schema_migrations.sql']);
  });

  it('accepts a backfill row for a file that ran before the ledger', async () => {
    await pg.exec(
      `INSERT INTO schema_migrations (filename, source) VALUES ('schema.sql', 'backfill'),
         ('0002_jobs_daily_limit_per_user.sql', 'backfill')`,
    );
    expect((await rows()).map((r) => [r.filename, r.source])).toEqual([
      ['0002_jobs_daily_limit_per_user.sql', 'backfill'],
      ['0013_schema_migrations.sql', 'applied'],
      ['schema.sql', 'backfill'],
    ]);
  });

  it.each([
    ['a path, not a filename', "('apps/api/db/0014_x.sql', 'applied')"],
    ['no .sql suffix', "('0014_x', 'applied')"],
    ['a three-digit number', "('014_x.sql', 'applied')"],
    ['an unknown source', "('0014_x.sql', 'manual')"],
  ])('refuses %s', async (_n, values) => {
    await expect(
      pg.exec(`INSERT INTO schema_migrations (filename, source) VALUES ${values}`),
    ).rejects.toThrow(/check constraint/);
  });

  it('refuses apply_count 0', async () => {
    await expect(
      pg.exec(
        `INSERT INTO schema_migrations (filename, source, apply_count) VALUES ('0014_x.sql', 'applied', 0)`,
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it.each(['eg_api', 'eg_scheduler'])('%s can neither read nor write the ledger', async (role) => {
    for (const sql of [
      'SELECT * FROM schema_migrations',
      "INSERT INTO schema_migrations (filename, source) VALUES ('0014_x.sql', 'applied')",
      'UPDATE schema_migrations SET apply_count = 1',
      'DELETE FROM schema_migrations',
    ])
      await expect(as(role, sql)).rejects.toThrow(/permission denied/);
  });
});
