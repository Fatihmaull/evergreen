/**
 * 0009_connect_and_scheduler_ticks_select.sql on PGlite, after schema.sql → 0002 → … → 0006 → 0008.
 * (0007 is not needed: neither 0008 nor 0009 depends on it in this harness; see the 0008 test.)
 *
 * CONNECT: PUBLIC holds CONNECT on a new database by default, which would make the check pass
 * without 0009. The harness revokes it from PUBLIC first, as a hardened database would.
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
let pg: PGlite;

const as = async (role: string, sql: string) => {
  await pg.exec(`SET ROLE ${role}`);
  try {
    return await pg.query(sql);
  } finally {
    await pg.exec('RESET ROLE');
  }
};
const canConnect = async (role: string): Promise<boolean> => {
  const { rows } = await pg.query<{ ok: boolean }>(
    `SELECT has_database_privilege('${role}', current_database(), 'CONNECT') AS ok`,
  );
  return rows[0]!.ok;
};

describe('0009 CONNECT and scheduler_ticks SELECT on PGlite', () => {
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
    await pg.exec(
      `DO $$ BEGIN EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', current_database()); END $$;`,
    );
    await pg.exec('INSERT INTO scheduler_ticks (observed_ledger) VALUES (7)');
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  it('before 0009: neither role has CONNECT, eg_api cannot read scheduler_ticks', async () => {
    expect(await canConnect('eg_api')).toBe(false);
    expect(await canConnect('eg_scheduler')).toBe(false);
    await expect(as('eg_api', 'SELECT * FROM scheduler_ticks')).rejects.toThrow(
      /permission denied/,
    );
  });

  describe('after 0009', () => {
    beforeAll(async () => {
      await pg.exec(s0009);
    });

    it('eg_api and eg_scheduler have CONNECT', async () => {
      expect(await canConnect('eg_api')).toBe(true);
      expect(await canConnect('eg_scheduler')).toBe(true);
    });
    it('eg_api reads the newest tick', async () => {
      const { rows } = await as(
        'eg_api',
        'SELECT observed_ledger FROM scheduler_ticks ORDER BY ticked_at DESC LIMIT 1',
      );
      expect(rows.length).toBe(1);
    });
    it.each([
      ['insert', 'INSERT INTO scheduler_ticks (observed_ledger) VALUES (1)'],
      ['update', 'UPDATE scheduler_ticks SET observed_ledger = 1'],
      ['delete', 'DELETE FROM scheduler_ticks'],
      ['truncate', 'TRUNCATE scheduler_ticks'],
    ])('eg_api still cannot %s scheduler_ticks', async (_n, sql) => {
      await expect(as('eg_api', sql)).rejects.toThrow(/permission denied/);
    });
    it('eg_scheduler still has no SELECT on scheduler_ticks (K1) but keeps INSERT', async () => {
      await expect(as('eg_scheduler', 'SELECT * FROM scheduler_ticks')).rejects.toThrow(
        /permission denied/,
      );
      await as(
        'eg_scheduler',
        'INSERT INTO scheduler_ticks (ticked_at, observed_ledger) VALUES (now(), 8)',
      );
    });
    it('is idempotent: applying 0009 again keeps the same grants', async () => {
      await pg.exec(s0009);
      expect(await canConnect('eg_api')).toBe(true);
      expect(await canConnect('eg_scheduler')).toBe(true);
      await as('eg_api', 'SELECT * FROM scheduler_ticks');
      await expect(as('eg_scheduler', 'SELECT * FROM scheduler_ticks')).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});
