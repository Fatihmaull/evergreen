/**
 * apps/api/db applied in order on PGlite: schema.sql → 0002 → 0003 → 0004 → 0005 → 0007. Checks 0004's
 * users.reactivated_at shape, 0005's scheduler_ticks, 0007's fee-ledger views, and that rows from before a
 * migration survive it. 0006 (#466) is not on main; 0007 uses none of its columns.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const U = '00000000-0000-4000-8000-0000000000a1';
const F7 = '0007_fee_ledger_network_fee_evidence.sql';
const C = `C${'A'.repeat(55)}`;
const G = `G${'A'.repeat(55)}`;
const J = {
  balanced: '00000000-0000-4000-8000-0000000000b1',
  subsidy: '00000000-0000-4000-8000-0000000000b2',
  refunded: '00000000-0000-4000-8000-0000000000b3',
  breakEven: '00000000-0000-4000-8000-0000000000b4',
};
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
    await pg.exec(db(F7));
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

  describe('0007 fee-ledger views (network-fee is evidence only, #414)', () => {
    // kind, amount; stored kinds get a tx hash, derived kinds (rent, evergreen-fee, difference) don't.
    const rows: Record<keyof typeof J, [string, number][]> = {
      balanced: [
        ['pull', 1000],
        ['rent', 690],
        ['evergreen-fee', 300],
        ['difference', 10],
        ['network-fee', 200],
      ],
      subsidy: [
        ['pull', 1000],
        ['rent', 900],
        ['evergreen-fee', 100],
        ['network-fee', 300],
      ],
      refunded: [
        ['pull', 1000],
        ['refund', 1000],
        ['network-fee', 300],
      ],
      breakEven: [
        ['pull', 500],
        ['rent', 250],
        ['evergreen-fee', 250],
        ['network-fee', 250],
      ],
    };
    beforeAll(async () => {
      await pg.exec(
        `INSERT INTO watch_items (user_id, network, contract_id, scope) VALUES ('${U}', 'testnet', '${C}', '{"noDataKeys":true}')`,
      );
      for (const [name, id] of Object.entries(J)) {
        await pg.exec(
          `INSERT INTO jobs (id, user_id, network, contract_id, kind, payer_account, idempotency_key)
           VALUES ('${id}', '${U}', 'testnet', '${C}', 'extend-now', '${G}', gen_random_uuid())`,
        );
        for (const [i, [kind, amount]] of rows[name as keyof typeof J].entries()) {
          const derived = ['rent', 'evergreen-fee', 'difference'].includes(kind);
          await pg.exec(
            `INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash)
             VALUES ('${id}', 'testnet', '${G}', '${C}', '${kind}', ${amount}, ${derived ? 'NULL' : `'${name}-${i}'`})`,
          );
        }
      }
    });

    it('keeps fee_ledger_job_balance columns, order and types', async () => {
      const { rows: cols } = await pg.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = 'fee_ledger_job_balance' ORDER BY ordinal_position`,
      );
      expect(cols).toEqual([
        { column_name: 'job_id', data_type: 'uuid' },
        { column_name: 'unexplained', data_type: 'numeric' },
      ]);
    });

    it('unexplained is 0 for every reconciled job; network-fee rows no longer count', async () => {
      const { rows: r } = await pg.query<{ job_id: string; unexplained: string }>(
        'SELECT job_id, unexplained::text AS unexplained FROM fee_ledger_job_balance ORDER BY job_id',
      );
      expect(r).toEqual(Object.values(J).map((job_id) => ({ job_id, unexplained: '0' })));
    });

    it('a real gap still shows: an unsplit pull remainder is unexplained', async () => {
      const id = '00000000-0000-4000-8000-0000000000b9';
      await pg.exec(
        `INSERT INTO jobs (id, user_id, network, contract_id, kind, payer_account, idempotency_key)
         VALUES ('${id}', '${U}', 'testnet', '${C}', 'extend-now', '${G}', gen_random_uuid());
         INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash) VALUES
           ('${id}', 'testnet', '${G}', '${C}', 'pull', 1000, 'gap-0'),
           ('${id}', 'testnet', '${G}', '${C}', 'rent', 600, NULL),
           ('${id}', 'testnet', '${G}', '${C}', 'network-fee', 400, 'gap-1')`,
      );
      const { rows: r } = await pg.query<{ u: string }>(
        `SELECT unexplained::text AS u FROM fee_ledger_job_balance WHERE job_id = '${id}'`,
      );
      expect(r).toEqual([{ u: '400' }]);
      await pg.exec(
        `DELETE FROM fee_ledger WHERE job_id = '${id}'; DELETE FROM jobs WHERE id = '${id}'`,
      );
    });

    it('fee_ledger_job_subsidy: margin = evergreen-fee - network-fee, subsidy flagged, full refund flagged apart', async () => {
      const { rows: r } = await pg.query(
        `SELECT job_id, evergreen_fee::text AS ef, network_fee::text AS nf, margin::text AS margin,
                fully_refunded, subsidised
         FROM fee_ledger_job_subsidy ORDER BY job_id`,
      );
      expect(r).toEqual([
        {
          job_id: J.balanced,
          ef: '300',
          nf: '200',
          margin: '100',
          fully_refunded: false,
          subsidised: false,
        },
        {
          job_id: J.subsidy,
          ef: '100',
          nf: '300',
          margin: '-200',
          fully_refunded: false,
          subsidised: true,
        },
        {
          job_id: J.refunded,
          ef: '0',
          nf: '300',
          margin: '-300',
          fully_refunded: true,
          subsidised: false,
        },
        {
          job_id: J.breakEven,
          ef: '250',
          nf: '250',
          margin: '0',
          fully_refunded: false,
          subsidised: false,
        },
      ]);
    });

    it('is idempotent: re-applying 0007 keeps both views and their results', async () => {
      await pg.exec(db(F7));
      const { rows: r } = await pg.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM fee_ledger_job_subsidy WHERE subsidised',
      );
      expect(r).toEqual([{ n: 1 }]);
    });
  });
});
