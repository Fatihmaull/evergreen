/**
 * 0014_prune_auth_tables.sql on PGlite, after schema.sql → 0002 … 0006 → 0008 → 0014 (#421).
 *
 * Test-harness only: the 0008 neon_superuser guard line is removed (PGlite has no such role).
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const NEON_LINE = "       OR pg_has_role(r, 'neon_superuser', 'MEMBER')\n";
const s0008 = db('0008_roles_grants.sql');
const s0014 = db('0014_prune_auth_tables.sql');
let pg: PGlite;

const as = async (role: string, sql: string) => {
  await pg.exec(`SET ROLE ${role}`);
  try {
    return await pg.query(sql);
  } finally {
    await pg.exec('RESET ROLE');
  }
};
const SESSION = "decode('aa','hex')";
const nowEpoch = async (): Promise<number> =>
  Number((await pg.query<{ n: string }>('SELECT extract(epoch from now())::int8 AS n')).rows[0]!.n);
const prune = async (role = 'eg_scheduler', arg = '') =>
  (await as(role, `SELECT * FROM prune_auth_tables(${arg})`)).rows[0] as {
    challenges_deleted: string;
    counters_deleted: string;
  };
const keys = async (): Promise<string[]> =>
  (await pg.query<{ key: string }>('SELECT key FROM auth_rate_counters ORDER BY key')).rows.map(
    (r) => r.key,
  );
const challenges = async (): Promise<string[]> =>
  (await pg.query<{ id: string }>('SELECT id FROM wallet_challenges ORDER BY id')).rows.map(
    (r) => r.id,
  );

describe('0014 prune_auth_tables on PGlite', () => {
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
    await pg.exec(
      'CREATE ROLE eg_api LOGIN; CREATE ROLE eg_scheduler LOGIN; CREATE ROLE other_role;',
    );
    if (!s0008.includes(NEON_LINE)) throw new Error('0008 neon_superuser guard line not found');
    await pg.exec(s0008.replace(NEON_LINE, ''));
    await pg.exec('GRANT USAGE ON SCHEMA public TO other_role'); // reach the schema, so only EXECUTE is tested
    await pg.exec(s0014);
    await pg.exec(s0014); // idempotent
    await pg.exec(`INSERT INTO users (email) VALUES ('a@example.com')`);
    await pg.exec(`INSERT INTO sessions (id_hash, user_id, csrf_token, idle_expires_at, absolute_expires_at)
      SELECT ${SESSION}, id, 'c', now() + interval '1 day', now() + interval '1 day' FROM users`);
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  beforeEach(async () => {
    await pg.exec('DELETE FROM wallet_challenges; DELETE FROM auth_rate_counters;');
  });

  it('deletes expired challenges and keeps live ones', async () => {
    await pg.exec(`INSERT INTO wallet_challenges VALUES
      ('expired', ${SESSION}, now() - interval '1 second'),
      ('live', ${SESSION}, now() + interval '1 minute')`);
    const r = await prune();
    expect(Number(r.challenges_deleted)).toBe(1);
    expect(await challenges()).toEqual(['live']);
  });

  it('deletes counters older than 1 day, keeps newer and malformed keys', async () => {
    const n = await nowEpoch();
    const day = 86_400;
    await pg.exec(`INSERT INTO auth_rate_counters (key, count) VALUES
      ('email:a@x:${n - day - 1}', 1),
      ('ip:::1:${n - day - 3600}', 1),
      ('email:a@x:${n - day + 2}', 1),
      ('email:a@x:${n - 60}', 1),
      ('nocolon', 1),
      ('nocolon${n - day - 10}', 1),
      ('email:a@x:', 1),
      ('email:a@x:12ab', 1),
      ('email:a@x:1234567890123456', 1),
      ('email:a@x:999999999999999', 1)`);
    const r = await prune();
    expect(Number(r.counters_deleted)).toBe(2);
    expect((await keys()).sort()).toEqual(
      [
        `email:a@x:${n - day + 2}`,
        `email:a@x:${n - 60}`,
        'nocolon',
        `nocolon${n - day - 10}`,
        'email:a@x:',
        'email:a@x:12ab',
        'email:a@x:1234567890123456',
        'email:a@x:999999999999999',
      ].sort(),
    );
  });

  it('boundary: a counter exactly `retention` old is kept, one microsecond older is deleted', async () => {
    // now() is fixed inside one transaction, so the age can be made exactly equal to retention.
    const res = await pg.transaction(async (tx) => {
      await tx.exec(`INSERT INTO auth_rate_counters (key, count)
        VALUES ('edge:x:' || (floor(extract(epoch from now()))::int8 - 86400), 1)`);
      await tx.exec('SET LOCAL ROLE eg_scheduler');
      const exact = await tx.query<{ counters_deleted: string }>(
        `SELECT counters_deleted FROM prune_auth_tables(interval '1 day' + (now() - to_timestamp(floor(extract(epoch from now())))))`,
      );
      const older = await tx.query<{ counters_deleted: string }>(
        `SELECT counters_deleted FROM prune_auth_tables(interval '1 day' + (now() - to_timestamp(floor(extract(epoch from now())))) - interval '1 microsecond')`,
      );
      return [Number(exact.rows[0]!.counters_deleted), Number(older.rows[0]!.counters_deleted)];
    });
    expect(res).toEqual([0, 1]);
  });

  it('boundary: a challenge expiring exactly now() is kept', async () => {
    const res = await pg.transaction(async (tx) => {
      await tx.exec(`INSERT INTO wallet_challenges VALUES ('edge', ${SESSION}, now())`);
      await tx.exec('SET LOCAL ROLE eg_scheduler');
      const r = await tx.query<{ challenges_deleted: string }>(
        'SELECT challenges_deleted FROM prune_auth_tables()',
      );
      return Number(r.rows[0]!.challenges_deleted);
    });
    expect(res).toBe(0);
  });

  it('defaults retention to 1 day and honours an explicit retention', async () => {
    const n = await nowEpoch();
    await pg.exec(`INSERT INTO auth_rate_counters (key, count) VALUES
      ('s:x:${n - 86_400 - 3600}', 1), ('s:y:${n - 2 * 86_400 - 3600}', 1)`);
    expect(Number((await prune('eg_scheduler', "interval '2 days'")).counters_deleted)).toBe(1);
    expect(await keys()).toEqual([`s:x:${n - 86_400 - 3600}`]);
    expect(Number((await prune()).counters_deleted)).toBe(1);
    expect(await keys()).toEqual([]);
  });

  it('refuses NULL, negative and sub-day retention; a live counter survives the attempt', async () => {
    const n = await nowEpoch();
    await pg.exec(`INSERT INTO auth_rate_counters (key, count) VALUES ('email:a@x:${n - 60}', 1)`);
    for (const arg of ['NULL', "interval '-1 hour'", "interval '0'", "interval '1 hour'",
      "interval '1 day' - interval '1 microsecond'"]) {
      await expect(prune('eg_scheduler', arg)).rejects.toThrow(/at least 1 day/);
    }
    expect(await keys()).toEqual([`email:a@x:${n - 60}`]);
  });

  it('never deletes sessions, expired ones included', async () => {
    await pg.exec(`INSERT INTO sessions (id_hash, user_id, csrf_token, idle_expires_at, absolute_expires_at)
      SELECT decode('bb','hex'), id, 'c', now() - interval '2 days', now() - interval '1 day' FROM users`);
    await prune();
    const { rows } = await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM sessions');
    expect(rows[0]!.n).toBe(2);
    await pg.exec(`DELETE FROM sessions WHERE id_hash = decode('bb','hex')`);
  });

  it('eg_scheduler can EXECUTE but has no access to auth tables', async () => {
    await expect(prune()).resolves.toBeDefined();
    for (const t of ['wallet_challenges', 'auth_rate_counters', 'sessions']) {
      await expect(as('eg_scheduler', `SELECT 1 FROM ${t}`)).rejects.toThrow(/permission denied/);
      await expect(as('eg_scheduler', `DELETE FROM ${t}`)).rejects.toThrow(/permission denied/);
    }
  });

  it('PUBLIC and eg_api cannot EXECUTE', async () => {
    await expect(prune('eg_api')).rejects.toThrow(/permission denied/);
    await expect(prune('other_role')).rejects.toThrow(/permission denied/);
    const { rows } = await pg.query<{ ok: boolean }>(
      `SELECT has_function_privilege('public', 'prune_auth_tables(interval)', 'EXECUTE') AS ok`,
    );
    expect(rows[0]!.ok).toBe(false);
  });

  it('is SECURITY DEFINER with search_path pinned', async () => {
    const { rows } = await pg.query<{ secdef: boolean; cfg: string[] }>(
      `SELECT prosecdef AS secdef, proconfig AS cfg FROM pg_proc WHERE proname = 'prune_auth_tables'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.secdef).toBe(true);
    expect(rows[0]!.cfg).toEqual(['search_path=pg_catalog, pg_temp']);
  });

  it('creates the session_hash index', async () => {
    const { rows } = await pg.query<{ def: string }>(
      `SELECT indexdef AS def FROM pg_indexes WHERE indexname = 'wallet_challenges_session_hash_idx'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.def).toMatch(/ON public\.wallet_challenges USING btree \(session_hash\)/);
  });
});
