/**
 * 0012_jobs_autopilot_uq_per_user.sql on PGlite, after schema.sql → 0002 → … → 0006.
 * (0007–0009 touch views and grants only; 0012 depends on none of them.)
 *
 * Before 0012 the autopilot key is cross-user; after it, two users on the same contract and
 * window can both insert, the same user is still deduped, and re-applying 0012 is a no-op.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const U1 = '00000000-0000-4000-8000-0000000012a1';
const U2 = '00000000-0000-4000-8000-0000000012a2';
const C = `C${'B'.repeat(55)}`;
const C2 = `C${'D'.repeat(55)}`;
const G = `G${'A'.repeat(55)}`;
const s0012 = db('0012_jobs_autopilot_uq_per_user.sql');
let pg: PGlite;

const insert = (user: string, window: number, contract = C) =>
  pg.exec(`INSERT INTO jobs (user_id, network, contract_id, kind, payer_account, autopilot_window)
    VALUES ('${user}', 'testnet', '${contract}', 'autopilot', '${G}', ${window})`);
const indexDef = async (): Promise<string[]> => {
  const { rows } = await pg.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE tablename = 'jobs' AND indexname = 'jobs_autopilot_uq'`,
  );
  return rows.map((r) => r.indexdef);
};

describe('0012 per-user autopilot dedupe on PGlite', () => {
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
    await pg.exec(`INSERT INTO users (id, email) VALUES
      ('${U1}', 'u1@example.invalid'), ('${U2}', 'u2@example.invalid')`);
    await pg.exec(`INSERT INTO watch_items (user_id, network, contract_id, scope) VALUES
      ('${U1}', 'testnet', '${C}', '{"noDataKeys":true}'),
      ('${U2}', 'testnet', '${C}', '{"noDataKeys":true}'),
      ('${U1}', 'testnet', '${C2}', '{"noDataKeys":true}')`);
    await insert(U1, 1); // a row from before 0012 must survive it
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  it('before 0012: a second user on the same contract and window collides', async () => {
    await expect(insert(U2, 1)).rejects.toThrow(/jobs_autopilot_uq/);
  });

  describe('after 0012', () => {
    beforeAll(async () => {
      await pg.exec(s0012);
    });

    it('the index is unique on (user_id, network, contract_id, autopilot_window) for autopilot only', async () => {
      const defs = await indexDef();
      expect(defs.length).toBe(1);
      expect(defs[0]).toMatch(/^CREATE UNIQUE INDEX/);
      expect(defs[0]).toMatch(/\(user_id, network, contract_id, autopilot_window\)/);
      expect(defs[0]).toMatch(/WHERE \(kind = 'autopilot'::text\)/);
    });
    it('the pre-0012 row survives', async () => {
      const { rows } = await pg.query(`SELECT 1 FROM jobs WHERE user_id = '${U1}'`);
      expect(rows.length).toBe(1);
    });
    it('two users on the same contract in the same window can both insert', async () => {
      await insert(U2, 1);
      const { rows } = await pg.query(
        `SELECT DISTINCT user_id FROM jobs WHERE contract_id = '${C}' AND autopilot_window = 1`,
      );
      expect(rows.length).toBe(2);
    });
    it('the same user on the same contract and window is still deduped', async () => {
      await expect(insert(U1, 1)).rejects.toThrow(/jobs_autopilot_uq/);
      await expect(insert(U2, 1)).rejects.toThrow(/jobs_autopilot_uq/);
    });
    it('the same user is not deduped across windows or contracts', async () => {
      await insert(U1, 2);
      await insert(U1, 1, C2);
    });
    it('is idempotent: applying 0012 again keeps one identical index and the rows', async () => {
      const before = await indexDef();
      await pg.exec(s0012);
      expect(await indexDef()).toEqual(before);
      await expect(insert(U1, 1)).rejects.toThrow(/jobs_autopilot_uq/);
      const { rows } = await pg.query(`SELECT 1 FROM jobs WHERE kind = 'autopilot'`);
      expect(rows.length).toBe(4);
    });
  });
});
