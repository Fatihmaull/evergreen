/**
 * 0019 on PGlite: the scheduler appends observations as `eg_scheduler` holding 0008 + 0019's
 * grants, and the API reads them back as `eg_api` through its own watchlist query.
 *
 * Test-harness only: 0008's neon_superuser guard line is removed (PGlite has no such role).
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INSERT_OBSERVATION_SQL, WATCHED_SQL } from '../src/observe.js';

const db = (f: string): string =>
  readFileSync(new URL(`../../api/db/${f}`, import.meta.url), 'utf8');
const NEON_LINE = "       OR pg_has_role(r, 'neon_superuser', 'MEMBER')\n";
const U = '00000000-0000-4000-8000-0000000000e2';
const C = `C${'A'.repeat(55)}`;
let pg: PGlite;

async function as<T>(role: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await pg.exec(`BEGIN; SET LOCAL ROLE ${role};`);
  try {
    const rows = (await pg.query<T>(sql, params)).rows;
    await pg.exec('COMMIT');
    return rows;
  } catch (error) {
    await pg.exec('ROLLBACK');
    throw error;
  }
}

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { pgcrypto } });
  for (const f of [
    'schema.sql',
    '0002_jobs_daily_limit_per_user.sql',
    '0003_auth_rate_counters_wallet_challenges.sql',
    '0004_users_reactivated_at.sql',
    '0005_scheduler_ticks.sql',
    '0006_jobs_submitted_hashes.sql',
    '0007_fee_ledger_network_fee_evidence.sql',
  ])
    await pg.exec(db(f));
  await pg.exec('CREATE ROLE eg_api LOGIN; CREATE ROLE eg_scheduler LOGIN;');
  const grants = db('0008_roles_grants.sql');
  if (!grants.includes(NEON_LINE)) throw new Error('0008 neon_superuser guard line not found');
  await pg.exec(grants.replace(NEON_LINE, ''));
  await pg.exec(db('0013_schema_migrations.sql'));
  await pg.exec(`INSERT INTO users (id, email) VALUES ('${U}', 'obs@example.invalid')`);
  await pg.exec(`INSERT INTO watch_items (user_id, network, contract_id, scope)
                 VALUES ('${U}', 'testnet', '${C}', '{"noDataKeys":true}')`);
}, 60_000);
afterAll(async () => {
  await pg?.close();
});

describe('observations under 0008 + 0019', () => {
  const insert = () =>
    as('eg_scheduler', INSERT_OBSERVATION_SQL, [
      C,
      1234,
      JSON.stringify({ network: 'testnet' }),
      'healthy',
    ]);

  it('🔴 before 0019, eg_scheduler cannot append an observation', async () => {
    await expect(insert()).rejects.toThrow(/permission denied/i);
  });

  it('eg_scheduler reads the watched contracts with 0008 alone', async () => {
    const rows = await as<{ contract_id: string }>('eg_scheduler', WATCHED_SQL);
    expect(rows.map((r) => r.contract_id)).toEqual([C]);
  });

  it('🔴 after 0019 it appends, and eg_api reads it back as the latest observation', async () => {
    await pg.exec(db('0019_scheduler_observations_insert.sql'));
    await insert();
    const rows = await as<{ observed_at_ledger: unknown; health: string }>(
      'eg_api',
      `SELECT observed_at_ledger, health FROM observations WHERE contract_id = '${C}'
       ORDER BY observed_at_ledger DESC LIMIT 1`,
    );
    expect(rows.map((r) => [Number(r.observed_at_ledger), r.health])).toEqual([[1234, 'healthy']]);
  });

  it.each([
    ['read observations back', 'SELECT * FROM observations'],
    ['rewrite history', "UPDATE observations SET health = 'critical'"],
    ['delete history', 'DELETE FROM observations'],
  ])('🔴 eg_scheduler still cannot %s', async (_, sql) => {
    await expect(as('eg_scheduler', sql)).rejects.toThrow(/permission denied/i);
  });

  it('0019 is idempotent and records itself in the ledger', async () => {
    await pg.exec(db('0019_scheduler_observations_insert.sql'));
    const { rows } = await pg.query<{ apply_count: number }>(
      "SELECT apply_count FROM schema_migrations WHERE filename = '0019_scheduler_observations_insert.sql'",
    );
    expect(rows[0]?.apply_count).toBe(2);
  });
});
