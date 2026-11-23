/**
 * 0016_jobs_shortfall_stroops.sql on PGlite, after schema.sql through 0008 and 0013.
 * 0015 is not on this branch; 0016 does not read its tables.
 *
 * Test-harness only: the 0008 neon_superuser guard line is removed.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const NEON_LINE = "       OR pg_has_role(r, 'neon_superuser', 'MEMBER')\n";
const s0008 = db('0008_roles_grants.sql');
const s0016 = db('0016_jobs_shortfall_stroops.sql');
const U = '00000000-0000-4000-8000-0000000000a1';
const C = `C${'A'.repeat(55)}`;
const G = `G${'A'.repeat(55)}`;
const JOB = '00000000-0000-4000-8000-0000000000c1';
let pg: PGlite;

const as = async (role: string, sql: string) => {
  await pg.exec(`SET ROLE ${role}`);
  try {
    return await pg.query(sql);
  } finally {
    await pg.exec('RESET ROLE');
  }
};

describe('0016 jobs.shortfall_stroops on PGlite', () => {
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
    if (!s0008.includes(NEON_LINE)) throw new Error('0008 neon_superuser guard line not found');
    await pg.exec(s0008.replace(NEON_LINE, ''));
    const before = await pg.query<{ email: boolean }>(
      `SELECT has_column_privilege('eg_scheduler', 'users', 'email', 'SELECT') AS email`,
    );
    expect(before.rows[0]?.email).toBe(false);
    await pg.exec(db('0013_schema_migrations.sql'));
    await pg.exec(s0016);
    await pg.exec(`INSERT INTO users (id, email) VALUES ('${U}', 'a@example.test')`);
    await pg.exec(
      `INSERT INTO watch_items (user_id, network, contract_id, scope) VALUES ('${U}', 'testnet', '${C}', '{"noDataKeys":true}')`,
    );
    await pg.exec(
      `INSERT INTO jobs (id, user_id, network, contract_id, kind, payer_account, autopilot_window, status, pull_tx_hash, pulled_at, pull_amount)
       VALUES ('${JOB}', '${U}', 'testnet', '${C}', 'autopilot', '${G}', 1, 'pulled', 'pull-tx', now(), 1035000)`,
    );
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  it('adds a nullable stroops column, a non-negative check and a partial index', async () => {
    const { rows } = await pg.query<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_name = 'jobs' AND column_name = 'shortfall_stroops'`,
    );
    expect(rows).toEqual([{ data_type: 'numeric', is_nullable: 'YES' }]);
    const index = await pg.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'jobs_shortfall_pos_idx'`,
    );
    expect(index.rows[0]?.indexdef).toMatch(/shortfall_stroops.* > .*0/);
    const fresh = await pg.query<{ shortfall_stroops: string | null }>(
      `SELECT shortfall_stroops FROM jobs WHERE id = '${JOB}'`,
    );
    expect(fresh.rows[0]?.shortfall_stroops).toBeNull();
  });

  it('lets eg_scheduler record a shortfall and refuses a negative one', async () => {
    await as(
      'eg_scheduler',
      `UPDATE jobs SET shortfall_stroops = 0, updated_at = now() WHERE id = '${JOB}'`,
    );
    await as('eg_scheduler', `UPDATE jobs SET shortfall_stroops = 100 WHERE id = '${JOB}'`);
    const { rows } = await pg.query<{ shortfall_stroops: string }>(
      `SELECT shortfall_stroops FROM jobs WHERE id = '${JOB}'`,
    );
    expect(rows[0]?.shortfall_stroops).toBe('100');
    await expect(
      as('eg_scheduler', `UPDATE jobs SET shortfall_stroops = -1 WHERE id = '${JOB}'`),
    ).rejects.toThrow(/check constraint|domain stroops/i);
  });

  it('does not give eg_scheduler users.email, and eg_api can read the column', async () => {
    const priv = await pg.query<{ email: boolean; write: boolean; read: boolean }>(
      `SELECT has_column_privilege('eg_scheduler', 'users', 'email', 'SELECT') AS email,
              has_column_privilege('eg_scheduler', 'jobs', 'shortfall_stroops', 'UPDATE') AS write,
              has_column_privilege('eg_api', 'jobs', 'shortfall_stroops', 'SELECT') AS read`,
    );
    expect(priv.rows[0]).toEqual({ email: false, write: true, read: true });
    await expect(as('eg_scheduler', 'SELECT email FROM users')).rejects.toThrow(
      /permission denied/,
    );
    await expect(as('eg_scheduler', `DELETE FROM jobs WHERE id = '${JOB}'`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('appends the reconcile rows as eg_scheduler and keeps one pull', async () => {
    await as(
      'eg_scheduler',
      `INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash)
       VALUES ('${JOB}', 'testnet', '${G}', '${C}', 'pull', 1035000, 'pull-tx')`,
    );
    await as(
      'eg_scheduler',
      `INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash)
       VALUES ('${JOB}', 'testnet', '${G}', '${C}', 'network-fee', 8000, 'extend-tx')`,
    );
    await expect(
      as(
        'eg_scheduler',
        `INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash)
         VALUES ('${JOB}', 'testnet', '${G}', '${C}', 'pull', 1, 'other-tx')`,
      ),
    ).rejects.toThrow(/duplicate|unique/);
    const balance = await pg.query<{ unexplained: string }>(
      `SELECT unexplained FROM fee_ledger_job_balance WHERE job_id = '${JOB}'`,
    );
    // network-fee is evidence and is not in the sum. The rent, fee and refund are not written yet.
    expect(balance.rows[0]?.unexplained).toBe('1035000');
  });

  it('is idempotent: applying 0016 again keeps the value and bumps the ledger', async () => {
    await pg.exec(s0016);
    const { rows } = await pg.query<{ shortfall_stroops: string; apply_count: number }>(
      `SELECT j.shortfall_stroops, m.apply_count
       FROM jobs j, schema_migrations m
       WHERE j.id = '${JOB}' AND m.filename = '0016_jobs_shortfall_stroops.sql'`,
    );
    expect(rows[0]?.shortfall_stroops).toBe('100');
    expect(rows[0]?.apply_count).toBe(2);
    const email = await pg.query<{ email: boolean }>(
      `SELECT has_column_privilege('eg_scheduler', 'users', 'email', 'SELECT') AS email`,
    );
    expect(email.rows[0]?.email).toBe(false);
  });
});
