/**
 * 0008_roles_grants.sql on PGlite, after schema.sql → 0002 → … → 0006. Checks that each role's
 * allowed queries run under SET ROLE, that what the draft leaves out is refused, and that the
 * fee_ledger append-only triggers refuse UPDATE, DELETE and TRUNCATE even for the owner.
 *
 * Test-harness only: PGlite has no neon_superuser role, so pg_has_role(r, 'neon_superuser', …)
 * raises. The harness removes that one guard line before applying; the shipped file is unchanged.
 * The rest of the guard (missing role, CREATE-flag / superuser flags, pg_*_all_data) runs as shipped.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const NEON_LINE = "       OR pg_has_role(r, 'neon_superuser', 'MEMBER')\n";
const shipped = db('0008_roles_grants.sql');
const forPglite = (): string => {
  if (!shipped.includes(NEON_LINE)) throw new Error('0008 neon_superuser guard line not found');
  return shipped.replace(NEON_LINE, '');
};

const U = '00000000-0000-4000-8000-0000000000b1';
const C = `C${'A'.repeat(55)}`;
const G = `G${'A'.repeat(55)}`;
let pg: PGlite;

/** Run sql as role, always RESET ROLE afterwards, even when it throws. */
const as = async (role: string, sql: string) => {
  await pg.exec(`SET ROLE ${role}`);
  try {
    return await pg.query(sql);
  } finally {
    await pg.exec('RESET ROLE');
  }
};

describe('0008 roles and grants on PGlite', () => {
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
    // What DevOps does first, in SQL (placeholder roles, no password in a test).
    await pg.exec('CREATE ROLE eg_api LOGIN; CREATE ROLE eg_scheduler LOGIN;');
    await pg.exec(`INSERT INTO users (id, email) VALUES ('${U}', 'grants@example.invalid')`);
    await pg.exec(
      `INSERT INTO wallets (network, account, user_id) VALUES ('testnet', '${G}', '${U}')`,
    );
    await pg.exec(`INSERT INTO watch_items (user_id, network, contract_id, scope)
                   VALUES ('${U}', 'testnet', '${C}', '{"noDataKeys":true}')`);
    // Stale grants from before 0008 (e.g. a hand-run console grant): the REVOKE ALL baseline must clear them.
    await pg.exec(`GRANT SELECT ON users, allowance_observations TO PUBLIC; GRANT CREATE ON SCHEMA public TO PUBLIC;
                   GRANT ALL ON sessions TO eg_scheduler; GRANT DELETE ON fee_ledger TO eg_scheduler;`);
    await pg.exec(forPglite());
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  describe('guard', () => {
    it('refuses when a role does not exist', async () => {
      const p = await PGlite.create({ extensions: { pgcrypto } });
      try {
        await p.exec('CREATE ROLE eg_api LOGIN');
        await expect(p.exec(forPglite())).rejects.toThrow(/role eg_scheduler does not exist/);
      } finally {
        await p.close();
      }
    });
    it.each([
      ['CREATEDB', 'ALTER ROLE eg_api CREATEDB', 'ALTER ROLE eg_api NOCREATEDB'],
      ['CREATEROLE', 'ALTER ROLE eg_scheduler CREATEROLE', 'ALTER ROLE eg_scheduler NOCREATEROLE'],
      [
        'pg_write_all_data',
        'GRANT pg_write_all_data TO eg_scheduler',
        'REVOKE pg_write_all_data FROM eg_scheduler',
      ],
      [
        'pg_read_all_data',
        'GRANT pg_read_all_data TO eg_api',
        'REVOKE pg_read_all_data FROM eg_api',
      ],
    ])('refuses a role with %s', async (_n, give, take) => {
      await pg.exec(give);
      try {
        await expect(pg.exec(forPglite())).rejects.toThrow(/broad privileges/);
      } finally {
        await pg.exec(take);
      }
    });
    it('the shipped file keeps the neon_superuser check (stripped only here)', () => {
      expect(shipped).toContain(NEON_LINE);
    });
  });

  describe('eg_api', () => {
    it.each([
      [
        'signin_codes insert/select/delete',
        `INSERT INTO signin_codes (email, code_hash, expires_at) VALUES ('a@example.invalid', '\\x00'::bytea, now() + interval '10 minutes');
        SELECT * FROM signin_codes; DELETE FROM signin_codes WHERE email = 'a@example.invalid'`,
      ],
      [
        'users upsert-style insert and select',
        `INSERT INTO users (email) VALUES ('api@example.invalid'); SELECT id, email FROM users`,
      ],
      [
        'users update deactivated_at/reactivated_at',
        `UPDATE users SET deactivated_at = NULL, reactivated_at = now() WHERE id = '${U}'`,
      ],
      ['wallets update linked_at', `UPDATE wallets SET linked_at = now() WHERE account = '${G}'`],
      ['watch_items update label', `UPDATE watch_items SET label = 'x' WHERE user_id = '${U}'`],
      ['observations select', 'SELECT * FROM observations'],
      ['jobs select', 'SELECT * FROM jobs'],
    ])('allowed: %s', async (_n, sql) => {
      await pg.exec('SET ROLE eg_api');
      try {
        await pg.exec(sql);
      } finally {
        await pg.exec('RESET ROLE');
      }
    });
    it.each([
      ['fee_ledger select', 'SELECT * FROM fee_ledger'],
      ['fee_ledger_job_balance select', 'SELECT * FROM fee_ledger_job_balance'],
      ['allowance_observations select', 'SELECT * FROM allowance_observations'],
      [
        'jobs insert (undetermined, commented out)',
        `INSERT INTO jobs (user_id, network, contract_id, kind, payer_account, idempotency_key, request_hash) VALUES ('${U}', 'testnet', '${C}', 'extend-now', '${G}', gen_random_uuid(), '\\x00'::bytea)`,
      ],
      ['scheduler_ticks insert', 'INSERT INTO scheduler_ticks (observed_ledger) VALUES (1)'],
      ['users.id update', `UPDATE users SET id = id WHERE id = '${U}'`],
      ['create table in public', 'CREATE TABLE api_owned (x int)'],
      ['allowance_observations via a stale PUBLIC grant', 'SELECT * FROM allowance_observations'],
    ])('refused: %s', async (_n, sql) => {
      await expect(as('eg_api', sql)).rejects.toThrow(/permission denied/);
    });
  });

  describe('eg_scheduler', () => {
    it('reads the planner columns', async () => {
      const { rows } = await as(
        'eg_scheduler',
        `SELECT i.contract_id, w.account FROM watch_items i
         JOIN users u ON u.id = i.user_id AND u.deactivated_at IS NULL
           AND (u.reactivated_at IS NULL OR u.reactivated_at < now() + interval '1 day')
         LEFT JOIN wallets w ON w.network = i.network AND w.user_id = i.user_id`,
      );
      expect(rows.length).toBe(1);
    });
    it('inserts a tick, an autopilot job, updates it and appends ledger rows', async () => {
      await as(
        'eg_scheduler',
        'INSERT INTO scheduler_ticks (ticked_at, observed_ledger) VALUES (now(), 42)',
      );
      await pg.exec('SET ROLE eg_scheduler');
      try {
        // id via the column default: the scheduler cannot write jobs.id, so the owner-side test id is
        // looked up afterwards rather than inserted.
        await pg.exec(`INSERT INTO jobs (user_id, network, contract_id, kind, payer_account, autopilot_window)
                       VALUES ('${U}', 'testnet', '${C}', 'autopilot', '${G}', 7)`);
        await pg.exec(`UPDATE jobs SET pull_submitted_hash = 'p', pull_submitted_expires_at = now(),
                         extend_submitted_hash = 'e', refund_submitted_hash = 'r', updated_at = now()
                       WHERE autopilot_window = 7`);
        await pg.exec(`INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash, ledger)
                       SELECT id, 'testnet', '${G}', '${C}', 'pull', 100, 'tx1', 9 FROM jobs WHERE autopilot_window = 7`);
        await pg.exec(`INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount)
                       SELECT id, 'testnet', '${G}', '${C}', 'rent', 100 FROM jobs WHERE autopilot_window = 7`);
        const { rows } = await pg.query<{ unexplained: string }>(
          'SELECT unexplained FROM fee_ledger_job_balance',
        );
        expect(rows.map((r) => Number(r.unexplained))).toEqual([0]);
      } finally {
        await pg.exec('RESET ROLE');
      }
    });
    it.each([
      ['users.email', 'SELECT email FROM users'],
      ['sessions', 'SELECT * FROM sessions'],
      ['signin_codes', 'SELECT * FROM signin_codes'],
      ['watch_items.label', 'SELECT label FROM watch_items'],
      ['create table in public', 'CREATE TABLE sched_owned (x int)'],
      ['users.email via a stale PUBLIC grant', 'SELECT email FROM users'],
      ['sessions via a stale direct grant', 'DELETE FROM sessions'],
      ['scheduler_ticks select (undetermined)', 'SELECT * FROM scheduler_ticks'],
      ['jobs.user_id update', `UPDATE jobs SET user_id = '${U}' WHERE autopilot_window = 7`],
      [
        'jobs.idempotency_key insert',
        `INSERT INTO jobs (user_id, network, contract_id, kind, payer_account, idempotency_key) VALUES ('${U}', 'testnet', '${C}', 'autopilot', '${G}', gen_random_uuid())`,
      ],
      [
        'fee_ledger.recorded_at insert',
        `INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, recorded_at) SELECT id, 'testnet', '${G}', '${C}', 'rent', 1, now() - interval '1 year' FROM jobs WHERE autopilot_window = 7`,
      ],
      [
        'fee_ledger.id insert',
        `INSERT INTO fee_ledger (id, job_id, network, wallet, contract_id, kind, amount) SELECT 999, id, 'testnet', '${G}', '${C}', 'rent', 1 FROM jobs WHERE autopilot_window = 7`,
      ],
      ['fee_ledger update', 'UPDATE fee_ledger SET amount = 0'],
      ['fee_ledger delete', 'DELETE FROM fee_ledger'],
      ['fee_ledger truncate', 'TRUNCATE fee_ledger'],
      ['fee_ledger_id_seq setval', "SELECT setval('fee_ledger_id_seq', 1)"],
      [
        'observations insert (undetermined)',
        `INSERT INTO observations (network, contract_id, observed_at_ledger, observed_at, scan, health) VALUES ('testnet', '${C}', 1, now(), '{}', 'healthy')`,
      ],
    ])('refused: %s', async (_n, sql) => {
      await expect(as('eg_scheduler', sql)).rejects.toThrow(/permission denied/);
    });
  });

  describe('fee_ledger append-only trigger (owner too)', () => {
    it.each([
      ['UPDATE', 'UPDATE fee_ledger SET amount = amount'],
      ['DELETE', 'DELETE FROM fee_ledger'],
      ['TRUNCATE', 'TRUNCATE fee_ledger'],
    ])('owner %s is refused by the trigger', async (op, sql) => {
      await expect(pg.exec(sql)).rejects.toThrow(new RegExp(`append-only \\(${op} refused\\)`));
    });
    it('owner INSERT still works and rows are intact', async () => {
      await pg.exec(`INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash)
                     SELECT id, 'testnet', '${G}', '${C}', 'refund', 0, 'tx2' FROM jobs WHERE autopilot_window = 7`);
      const { rows } = await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM fee_ledger');
      expect(rows[0]!.n).toBe(3);
    });
  });

  it('is idempotent: re-applying 0008 keeps grants and the triggers', async () => {
    await pg.exec(forPglite());
    await as('eg_api', 'SELECT * FROM jobs');
    await expect(as('eg_api', 'SELECT * FROM fee_ledger')).rejects.toThrow(/permission denied/);
    await expect(pg.exec('DELETE FROM fee_ledger')).rejects.toThrow(/append-only/);
  });
});
