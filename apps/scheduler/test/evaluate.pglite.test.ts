/**
 * Stage 1 evaluation on a real Postgres engine (PGlite) with every migration applied in order,
 * schema.sql → 0002 → … → 0008, run **as `eg_scheduler` holding exactly 0008's grants**.
 * Least privilege is only worth claiming if the code works under it.
 *
 * Test-harness only: PGlite has no neon_superuser role, so 0008's one `pg_has_role(…,
 * 'neon_superuser', …)` guard line is removed before applying (as packages/engine's 0008 test does).
 * No network: the database is in-process and nothing here calls an RPC.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EvaluationError, evaluate, readOnlyQuery } from '../src/evaluate.js';

const db = (f: string): string =>
  readFileSync(new URL(`../../api/db/${f}`, import.meta.url), 'utf8');
const NEON_LINE = "       OR pg_has_role(r, 'neon_superuser', 'MEMBER')\n";

const U = '00000000-0000-4000-8000-0000000000e1';
const C1 = `C${'A'.repeat(55)}`;
const C2 = `C${'B'.repeat(55)}`;
const G = `G${'A'.repeat(55)}`;
let pg: PGlite;

type Q = (sql: string, params: readonly unknown[]) => Promise<readonly Record<string, unknown>[]>;

/**
 * Each statement as eg_scheduler, inside a READ ONLY transaction that is always rolled back.
 * Records every statement it was handed.
 */
function schedulerQuery(seen: string[] = []): Q {
  return async (sql, params) => {
    seen.push(sql);
    await pg.exec('BEGIN READ ONLY; SET LOCAL ROLE eg_scheduler;');
    try {
      return (await pg.query<Record<string, unknown>>(sql, [...params])).rows;
    } finally {
      await pg.exec('ROLLBACK');
    }
  };
}

/** As eg_scheduler, in a normal (writable) transaction, rolled back: what the grants alone allow. */
async function asSchedulerWritable(sql: string): Promise<void> {
  await pg.exec('BEGIN; SET LOCAL ROLE eg_scheduler;');
  try {
    await pg.query(sql);
  } finally {
    await pg.exec('ROLLBACK');
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

  await pg.exec(`INSERT INTO users (id, email) VALUES ('${U}', 'eval@example.invalid')`);
  await pg.exec(
    `INSERT INTO wallets (network, account, user_id) VALUES ('testnet', '${G}', '${U}')`,
  );
  for (const c of [C1, C2])
    await pg.exec(`INSERT INTO watch_items (user_id, network, contract_id, scope, autopilot_enabled,
                     payer_network, payer_account, threshold_ledgers, extend_to_ledgers,
                     budget_per_job_max, budget_per_30d_max)
                   VALUES ('${U}', 'testnet', '${c}', '{"noDataKeys":true}', true,
                     'testnet', '${G}', 17280, 535680, 5000000, ${c === C1 ? 20000000 : 0})`);
}, 60_000);
afterAll(async () => {
  await pg?.close();
});

describe('Stage 1 evaluation under the 0008 eg_scheduler grants', () => {
  it('🔴 reads the plan as eg_scheduler, in a READ ONLY transaction, and reports counts only', async () => {
    const seen: string[] = [];
    const { plans, summary } = await evaluate(schedulerQuery(seen));
    expect(summary).toEqual({ dryRun: true, payers: 1, items: 2, itemsWithoutBudget: 1 });
    expect(plans[0]?.payerAccount).toBe(G);
    expect(plans[0]?.items.map((i) => i.contractId)).toEqual([C1, C2]);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('🔴 writes nothing: the tables it reads are unchanged', async () => {
    const count = async () =>
      (
        await pg.query<{ n: string }>(
          `SELECT (SELECT count(*) FROM jobs) + (SELECT count(*) FROM fee_ledger) + (SELECT count(*) FROM scheduler_ticks) AS n`,
        )
      ).rows[0]?.n;
    const before = await count();
    await evaluate(schedulerQuery());
    expect(await count()).toBe(before);
  });

  it('🔴 a column 0008 does not grant (users.email) is refused to the same role', async () => {
    await expect(schedulerQuery()('SELECT email FROM users', [])).rejects.toThrow(
      /permission denied/i,
    );
  });

  it.each([
    ['update a watch item', `UPDATE watch_items SET autopilot_enabled = false`],
    ['update a wallet', `UPDATE wallets SET linked_at = now()`],
    ['update a user', `UPDATE users SET deactivated_at = now()`],
  ])('🔴 the database refuses eg_scheduler to %s', async (_, sql) => {
    await expect(asSchedulerWritable(sql)).rejects.toThrow(/permission denied/i);
  });

  // Guard-removal test. 0008 lets eg_scheduler INSERT into jobs (for Stage 2), so the database
  // alone does NOT stop an evaluation that wrote there. This pair fails if readOnlyQuery is
  // removed or weakened: the first proves the grant exists, the second that the wrapper stops it.
  const JOB_INSERT = `INSERT INTO jobs (user_id, network, contract_id, kind, payer_account, autopilot_window)
    VALUES ('${U}', 'testnet', '${C1}', 'autopilot', '${G}', 1)`;

  it('🔴 without the guard, the grants alone would let the evaluation insert a job', async () => {
    await expect(asSchedulerWritable(JOB_INSERT)).resolves.toBeUndefined();
  });

  it('🔴 with the guard, that same write never reaches the database', async () => {
    const seen: string[] = [];
    const guarded = readOnlyQuery(schedulerQuery(seen));
    const error = await guarded(JOB_INSERT, []).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EvaluationError);
    expect((error as EvaluationError).code).toBe('EVAL_WRITE_REFUSED');
    expect(seen).toEqual([]);
  });
});
