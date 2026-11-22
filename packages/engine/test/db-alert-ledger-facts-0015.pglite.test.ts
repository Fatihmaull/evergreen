/**
 * 0015_alert_ledger_facts.sql on PGlite, after schema.sql → 0002 … 0006 → 0008 → 0013 → 0015.
 *
 * Test-harness only: the 0008 neon_superuser guard line is removed (PGlite has no such role).
 * No network. Does not call dispatchUserAlert.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const NEON_LINE = "       OR pg_has_role(r, 'neon_superuser', 'MEMBER')\n";
const s0008 = db('0008_roles_grants.sql');
const s0015 = db('0015_alert_ledger_facts.sql');
let pg: PGlite;
let emailBefore = true;
let emailAfter = true;

const as = async (role: string, sql: string) => {
  await pg.exec(`SET ROLE ${role}`);
  try {
    return await pg.query(sql);
  } finally {
    await pg.exec('RESET ROLE');
  }
};

const emailSelect = async (): Promise<boolean> => {
  const { rows } = await pg.query<{ ok: boolean }>(
    `SELECT has_column_privilege('eg_scheduler', 'users', 'email', 'SELECT') AS ok`,
  );
  return rows[0]!.ok;
};

describe('0015 alert ledger facts on PGlite', () => {
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
    await pg.exec(db('0013_schema_migrations.sql'));
    emailBefore = await emailSelect();
    await pg.exec(s0015);
    emailAfter = await emailSelect();
    await pg.exec(s0015);
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  it('eg_scheduler still cannot read users.email, before and after 0015', () => {
    expect(emailBefore).toBe(false);
    expect(emailAfter).toBe(false);
  });

  it('records itself once, and a re-run bumps apply_count to 2', async () => {
    const { rows } = await pg.query<{
      filename: string;
      source: string;
      apply_count: number;
    }>(
      `SELECT filename, source, apply_count FROM schema_migrations
        WHERE filename = '0015_alert_ledger_facts.sql'`,
    );
    expect(rows).toEqual([
      { filename: '0015_alert_ledger_facts.sql', source: 'applied', apply_count: 2 },
    ]);
  });

  it('the entry primary key rejects a second row', async () => {
    await pg.exec(`INSERT INTO entry_ttl_facts
      (network, contract_id, entry_key, entry_kind, end_behavior, observed_ledger, live_until_ledger, remaining_ledgers)
      VALUES ('testnet', 'C-pk', 'k', 'persistent', 'archived', 10, 100, 90)`);
    await expect(
      pg.exec(`INSERT INTO entry_ttl_facts
        (network, contract_id, entry_key, entry_kind, end_behavior, observed_ledger, live_until_ledger, remaining_ledgers)
        VALUES ('testnet', 'C-pk', 'k', 'code', 'archived', 11, 100, 89)`),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('the allowance primary key rejects a second row', async () => {
    await pg.exec(`INSERT INTO allowance_expiry_facts
      (network, account, spender, observed_ledger, live_until_ledger)
      VALUES ('testnet', 'G1', 'G2', 10, 100)`);
    await expect(
      pg.exec(`INSERT INTO allowance_expiry_facts
        (network, account, spender, observed_ledger, live_until_ledger)
        VALUES ('testnet', 'G1', 'G2', 11, 100)`),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('ON CONFLICT DO UPDATE moves observed_ledger and leaves the other columns', async () => {
    await pg.exec(`INSERT INTO entry_ttl_facts
      (network, contract_id, entry_key, entry_kind, end_behavior, observed_ledger, live_until_ledger, remaining_ledgers)
      VALUES ('testnet', 'C-up', 'k', 'persistent', 'archived', 10, 100, 90)`);
    await as(
      'eg_scheduler',
      `INSERT INTO entry_ttl_facts
        (network, contract_id, entry_key, entry_kind, end_behavior, observed_ledger, live_until_ledger, remaining_ledgers)
        VALUES ('testnet', 'C-up', 'k', 'temporary', 'deleted', 20, 200, 0)
       ON CONFLICT (network, contract_id, entry_key) DO UPDATE
         SET observed_ledger = EXCLUDED.observed_ledger`,
    );
    const { rows } = await pg.query<{
      entry_kind: string;
      end_behavior: string;
      observed_ledger: string;
      live_until_ledger: string;
      remaining_ledgers: string;
    }>(
      `SELECT entry_kind, end_behavior, observed_ledger::text, live_until_ledger::text, remaining_ledgers::text
         FROM entry_ttl_facts WHERE contract_id = 'C-up' AND entry_key = 'k'`,
    );
    expect(rows).toEqual([
      {
        entry_kind: 'persistent',
        end_behavior: 'archived',
        observed_ledger: '20',
        live_until_ledger: '100',
        remaining_ledgers: '90',
      },
    ]);
  });

  it('remaining 0 is kept, a negative observed ledger is refused, mainnet is refused', async () => {
    await pg.exec(`INSERT INTO entry_ttl_facts
      (network, contract_id, entry_key, entry_kind, end_behavior, observed_ledger, live_until_ledger, remaining_ledgers)
      VALUES ('testnet', 'C0', 'zero', 'persistent', 'archived', 5, 5, 0)`);
    const { rows } = await pg.query<{ remaining_ledgers: string }>(
      `SELECT remaining_ledgers::text FROM entry_ttl_facts WHERE entry_key = 'zero'`,
    );
    expect(rows[0]!.remaining_ledgers).toBe('0');
    await expect(
      pg.exec(`INSERT INTO entry_ttl_facts
        (network, contract_id, entry_key, entry_kind, end_behavior, observed_ledger, live_until_ledger, remaining_ledgers)
        VALUES ('testnet', 'C0', 'neg', 'persistent', 'archived', -1, 5, 6)`),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      pg.exec(`INSERT INTO allowance_expiry_facts
        (network, account, spender, observed_ledger, live_until_ledger)
        VALUES ('mainnet', 'G1', 'G2', 10, 100)`),
    ).rejects.toThrow(/check constraint/i);
  });

  it('eg_api can SELECT and cannot INSERT; eg_scheduler can upsert and cannot DELETE', async () => {
    await as('eg_api', 'SELECT 1 FROM entry_ttl_facts');
    await as('eg_api', 'SELECT 1 FROM allowance_expiry_facts');
    await expect(
      as(
        'eg_api',
        `INSERT INTO entry_ttl_facts
          (network, contract_id, entry_key, entry_kind, end_behavior, observed_ledger, live_until_ledger, remaining_ledgers)
          VALUES ('testnet', 'C9', 'nope', 'persistent', 'archived', 1, 2, 1)`,
      ),
    ).rejects.toThrow(/permission denied/);
    await as(
      'eg_scheduler',
      `INSERT INTO allowance_expiry_facts
        (network, account, spender, observed_ledger, live_until_ledger)
        VALUES ('testnet', 'G9', 'G8', 3, 4)
       ON CONFLICT (network, account, spender) DO UPDATE
         SET observed_ledger = EXCLUDED.observed_ledger`,
    );
    await expect(as('eg_scheduler', 'DELETE FROM entry_ttl_facts')).rejects.toThrow(
      /permission denied/,
    );
    await expect(as('eg_scheduler', 'DELETE FROM allowance_expiry_facts')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('the two lookup indexes exist', async () => {
    const { rows } = await pg.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE indexname IN ('entry_ttl_facts_contract_idx', 'allowance_expiry_facts_account_idx')
        ORDER BY indexname`,
    );
    expect(rows.map((r) => r.indexname)).toEqual([
      'allowance_expiry_facts_account_idx',
      'entry_ttl_facts_contract_idx',
    ]);
  });
});
