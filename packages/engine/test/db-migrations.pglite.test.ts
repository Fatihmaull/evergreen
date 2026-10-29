/**
 * apps/api/db applied in order on PGlite: schema.sql → 0002 → 0003 → 0004 → 0006 (0005 is independent
 * of 0006 and not chained here). Checks 0004's users.reactivated_at, 0006's submitted-hash and expiry columns,
 * and that rows from before a migration survive it.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const U = '00000000-0000-4000-8000-0000000000a1';
const C = `C${'A'.repeat(55)}`;
const G = `G${'A'.repeat(55)}`;
const JOB_OLD = '20000000-0000-4000-8000-000000000001';
const job = (id: string, cols: string, vals: string): string =>
  `INSERT INTO jobs (id, user_id, network, contract_id, kind, payer_account, autopilot_window${cols})
   VALUES ('${id}', '${U}', 'testnet', '${C}', 'autopilot', '${G}', ${parseInt(id.slice(-2), 16)}${vals})`;
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
    await pg.exec(`INSERT INTO watch_items (user_id, network, contract_id, scope)
      VALUES ('${U}', 'testnet', '${C}', '{"noDataKeys":true}')`);
    await pg.exec(
      job(JOB_OLD, ', pull_tx_hash, pulled_at, pull_amount', ", 'confirmed-old', now(), 10"),
    );
    await pg.exec(db('0006_jobs_submitted_hashes.sql'));
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

  describe('0006 submitted hashes on jobs', () => {
    const HASHES = ['pull_submitted_hash', 'extend_submitted_hash', 'refund_submitted_hash'];
    const EXPIRIES = ['pull_submitted_expires_at', 'extend_submitted_expires_at', 'refund_submitted_expires_at'];

    it('adds three nullable text columns with no default', async () => {
      const { rows } = await pg.query<Record<string, unknown>>(
        `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
         WHERE table_name = 'jobs' AND column_name LIKE '%_submitted_hash' ORDER BY column_name`,
      );
      expect(rows).toEqual(
        [...HASHES].sort().map((column_name) => ({
          column_name,
          data_type: 'text',
          is_nullable: 'YES',
          column_default: null,
        })),
      );
    });

    it('adds three nullable timestamptz expiry columns with no default', async () => {
      const { rows } = await pg.query<Record<string, unknown>>(
        `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
         WHERE table_name = 'jobs' AND column_name LIKE '%_submitted_expires_at' ORDER BY column_name`,
      );
      expect(rows).toEqual(
        [...EXPIRIES].sort().map((column_name) => ({
          column_name,
          data_type: 'timestamp with time zone',
          is_nullable: 'YES',
          column_default: null,
        })),
      );
    });

    it('a job from before 0006 survives, confirmed hash intact, submitted hashes NULL', async () => {
      const { rows } = await pg.query<Record<string, unknown>>(
        `SELECT pull_tx_hash, ${HASHES.join(', ')}, ${EXPIRIES.join(', ')} FROM jobs WHERE id = '${JOB_OLD}'`,
      );
      expect(rows).toEqual([
        {
          pull_tx_hash: 'confirmed-old',
          pull_submitted_hash: null,
          extend_submitted_hash: null,
          refund_submitted_hash: null,
          pull_submitted_expires_at: null,
          extend_submitted_expires_at: null,
          refund_submitted_expires_at: null,
        },
      ]);
    });

    it('allows a submitted-but-unconfirmed pull (submitted hash set, pull_tx_hash and pulled_at NULL)', async () => {
      await pg.exec(
        job('20000000-0000-4000-8000-000000000002', ', pull_submitted_hash', ", 'submitted-1'"),
      );
      await pg.exec(
        job(
          '20000000-0000-4000-8000-000000000003',
          ', extend_submitted_hash, refund_submitted_hash',
          ", 'ext-1', 'ref-1'",
        ),
      );
      const { rows } = await pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM jobs WHERE pull_tx_hash IS NULL AND pulled_at IS NULL
         AND (pull_submitted_hash IS NOT NULL OR extend_submitted_hash IS NOT NULL)`,
      );
      expect(rows[0]!.n).toBe(2);
    });

    it.each([
      ['pull_tx_hash without pulled_at', ', pull_tx_hash', ", 'h-no-time'"],
      ['pulled_at without pull_tx_hash', ', pulled_at', ', now()'],
      ['submitted hash does not relax it', ', pull_submitted_hash, pull_tx_hash', ", 's', 'h2'"],
    ])('the old CHECK still rejects %s', async (_n, cols, vals) => {
      await expect(
        pg.exec(job('20000000-0000-4000-8000-0000000000f1', cols, vals)),
      ).rejects.toThrow(/check constraint/);
    });

    it('is idempotent: re-applying 0006 keeps submitted hashes', async () => {
      await pg.exec(db('0006_jobs_submitted_hashes.sql'));
      const { rows } = await pg.query<{ pull_submitted_hash: string }>(
        `SELECT pull_submitted_hash FROM jobs WHERE id = '20000000-0000-4000-8000-000000000002'`,
      );
      expect(rows).toEqual([{ pull_submitted_hash: 'submitted-1' }]);
    });
  });
});
