/**
 * Stage 2 store on PGlite with schema.sql → 0008, 0012, 0013 and 0016 applied, every statement run
 * **as `eg_scheduler`** under 0008's grants. Test harness only: 0008's neon_superuser guard line is
 * removed (PGlite has no such role), as the other PGlite tests do.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runHostedJob, type HostedChain } from '@evergreen/engine/dist/money-path.js';
import {
  autopilotWindow,
  enqueueAutopilotJobs,
  loadJob,
  openJobs,
  pgSubmittedStore,
  saveStatements,
  type Query,
  type Transaction,
} from '../src/hosted-store.js';
import {
  parseHostedConfig,
  runHostedStage,
  type HostedConfig,
  type HostedStageDeps,
} from '../src/hosted-run.js';
import { Keypair } from '@stellar/stellar-sdk';

const db = (f: string): string =>
  readFileSync(new URL(`../../api/db/${f}`, import.meta.url), 'utf8');
const NEON_LINE = "       OR pg_has_role(r, 'neon_superuser', 'MEMBER')\n";
const U = '00000000-0000-4000-8000-0000000000f1';
const C = `C${'D'.repeat(55)}`;
const G = `G${'D'.repeat(55)}`;
let pg: PGlite;

const asScheduler: Query = async (sql, params) => {
  await pg.exec('BEGIN; SET LOCAL ROLE eg_scheduler;');
  try {
    const rows = (await pg.query<Record<string, unknown>>(sql, [...params])).rows;
    await pg.exec('COMMIT');
    return rows;
  } catch (error) {
    await pg.exec('ROLLBACK');
    throw error;
  }
};

const txAsScheduler: Transaction = async (statements) => {
  await pg.exec('BEGIN; SET LOCAL ROLE eg_scheduler;');
  try {
    for (const s of statements) await pg.query(s.text, [...s.params]);
    await pg.exec('COMMIT');
  } catch (error) {
    await pg.exec('ROLLBACK');
    throw error;
  }
};

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
  for (const f of [
    '0012_jobs_autopilot_uq_per_user.sql',
    '0013_schema_migrations.sql',
    '0016_jobs_shortfall_stroops.sql',
  ])
    await pg.exec(db(f));
  await pg.exec(`INSERT INTO users (id, email) VALUES ('${U}', 'store@example.invalid')`);
  await pg.exec(
    `INSERT INTO watch_items (user_id, network, contract_id, scope) VALUES ('${U}', 'testnet', '${C}', '{"noDataKeys":true}')`,
  );
}, 60_000);
afterAll(async () => {
  await pg?.close();
});

describe('Stage 2 store as eg_scheduler', () => {
  it('enqueues one job per window and none while one is open', async () => {
    const item = { userId: U, contractId: C, payerAccount: G };
    expect(autopilotWindow(5_652_011)).toBe(31_400n);
    expect(await enqueueAutopilotJobs(asScheduler, [item], 31_400n)).toBe(1);
    expect(await enqueueAutopilotJobs(asScheduler, [item], 31_400n)).toBe(0);
    expect(await enqueueAutopilotJobs(asScheduler, [item], 31_401n)).toBe(0);
    const open = await openJobs(asScheduler, 3);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ status: 'queued', pullTxHash: null, kind: 'autopilot' });
  });

  it('runs a live job end to end: one transaction per save, ledger balanced', async () => {
    const [job] = await openJobs(asScheduler, 1);
    const chain: HostedChain = {
      simulateRent: () => Promise.resolve(1_000_000n),
      allowanceRemaining: () => Promise.resolve(9_000_000n),
      balance: () => Promise.resolve(9_000_000n),
      pull: () =>
        Promise.resolve({
          hash: 'a'.repeat(64),
          feeDeclaredStroops: 200n,
          feeChargedStroops: 150n,
        }),
      extend: () =>
        Promise.resolve({
          hash: 'b'.repeat(64),
          feeDeclaredStroops: 9_000n,
          feeChargedStroops: 8_000n,
          succeeded: true,
          transient: false,
          chargedRentStroops: 990_000n,
        }),
      refund: () =>
        Promise.resolve({
          hash: 'c'.repeat(64),
          feeDeclaredStroops: 100n,
          feeChargedStroops: 100n,
        }),
    };
    const outcome = await runHostedJob({
      mode: 'live',
      retryMarginStroops: 10_000n,
      chain,
      budget: () => 'ok',
      extendNowUsedToday: () => Promise.resolve(0),
      load: () => loadJob(asScheduler, job!.id),
      save: (next, rows) => txAsScheduler(saveStatements(next, rows)),
    });
    expect(outcome).toMatchObject({ status: 'extended', submitted: true, refunded: true });
    const saved = await loadJob(asScheduler, job!.id);
    expect(saved).toMatchObject({
      status: 'extended',
      extendRentChargedStroops: 990_000n,
      shortfallStroops: 0n,
    });
    const balance = await asScheduler(
      'SELECT unexplained FROM fee_ledger_job_balance WHERE job_id = $1::uuid',
      [job!.id],
    );
    expect(String(balance[0]?.['unexplained'])).toBe('0');
    const kinds = await asScheduler(
      'SELECT kind FROM fee_ledger WHERE job_id = $1::uuid ORDER BY id',
      [job!.id],
    );
    expect(kinds.map((r) => r['kind'])).toEqual([
      'pull',
      'network-fee',
      'network-fee',
      'network-fee',
      'rent',
      'evergreen-fee',
      'refund',
    ]);
  });

  it('a failed save writes nothing: the transaction rolls back', async () => {
    await enqueueAutopilotJobs(
      asScheduler,
      [{ userId: U, contractId: C, payerAccount: G }],
      31_402n,
    );
    const [job] = await openJobs(asScheduler, 1);
    const next = {
      ...job!,
      status: 'pulled' as const,
      pullTxHash: 'd'.repeat(64),
      pullAmountStroops: 5n,
    };
    const bad = {
      jobId: job!.id,
      network: 'testnet' as const,
      wallet: G,
      contractId: C,
      kind: 'rent' as const,
      amountStroops: 1n,
      txHash: 'not-allowed',
    };
    await expect(txAsScheduler(saveStatements(next, [bad]))).rejects.toThrow();
    expect((await loadJob(asScheduler, job!.id)).status).toBe('queued');
  });

  it('records, reads and clears a submitted hash', async () => {
    const [job] = await openJobs(asScheduler, 1);
    const store = pgSubmittedStore(asScheduler, job!.id);
    expect(await store.read('pull')).toBeNull();
    await store.record('pull', { hash: 'e'.repeat(64), expiresAt: 1_800_000_000 });
    expect(await store.read('pull')).toEqual({ hash: 'e'.repeat(64), expiresAt: 1_800_000_000 });
    await store.clear('pull');
    expect(await store.read('pull')).toBeNull();
    await store.record('pull', {
      hash: 'f'.repeat(64),
      expiresAt: 1_800_000_000,
      amountStroops: 42n,
    });
    expect(await store.read('pull')).toEqual({
      hash: 'f'.repeat(64),
      expiresAt: 1_800_000_000,
      amountStroops: 42n,
    });
    const amount = await asScheduler('SELECT pull_amount FROM jobs WHERE id = $1::uuid', [job!.id]);
    expect(String(amount[0]?.['pull_amount'])).toBe('42');
  });
});

describe('Stage 2 money step (runHostedStage) as eg_scheduler', () => {
  const C2 = `C${'E'.repeat(55)}`;
  const item = {
    userId: U,
    contractId: C2,
    scope: { noDataKeys: true },
    thresholdLedgers: 17_280n,
    extendToLedgers: 535_680n,
    budget: { perJobMax: 5_000_000n, per30dRemaining: 20_000_000n },
  };
  const plans = [{ network: 'testnet' as const, payerAccount: G, items: [item] }];
  const extendPlan = {
    requests: [
      {
        network: 'testnet' as const,
        payerAccount: G,
        items: [
          {
            userId: U,
            contractId: C2,
            scope: item.scope,
            extendToLedgers: 535_680n,
            perJobMaxStroops: 5_000_000n,
          },
        ],
      },
    ],
    skipped: { 'not-due': 0, expired: 0, undetermined: 0, 'no-budget': 0 },
  };
  const chain: HostedChain = {
    simulateRent: () => Promise.resolve(1_000_000n),
    allowanceRemaining: () => Promise.resolve(9_000_000n),
    balance: () => Promise.resolve(9_000_000n),
    pull: () =>
      Promise.resolve({ hash: '1'.repeat(64), feeDeclaredStroops: 200n, feeChargedStroops: 150n }),
    extend: () =>
      Promise.resolve({
        hash: '2'.repeat(64),
        feeDeclaredStroops: 9_000n,
        feeChargedStroops: 8_000n,
        succeeded: true,
        transient: false,
        chargedRentStroops: 1_000_000n,
      }),
    refund: () =>
      Promise.resolve({ hash: '3'.repeat(64), feeDeclaredStroops: 100n, feeChargedStroops: 100n }),
  };
  const deps = (over: Partial<HostedConfig> = {}): HostedStageDeps => ({
    config: { mode: 'live', retryMarginStroops: 10_000n, maxJobs: 3, deadlineMs: 300_000, ...over },
    query: asScheduler,
    transaction: txAsScheduler,
    chainFor: () => Promise.resolve(chain),
  });

  beforeAll(async () => {
    await pg.exec(
      `INSERT INTO watch_items (user_id, network, contract_id, scope) VALUES ('${U}', 'testnet', '${C2}', '{"noDataKeys":true}')`,
    );
    // Close the earlier test's open job so this one is alone in the queue.
    await pg.exec(
      `UPDATE jobs SET status = 'preflight-failed' WHERE status IN ('queued', 'pulled') AND pull_tx_hash IS NULL`,
    );
  });

  it('dry-run counts the due items and writes nothing', async () => {
    const before = (await pg.query<{ n: string }>('SELECT count(*) AS n FROM jobs')).rows[0]?.n;
    const summary = await runHostedStage(
      { observedLedger: 5_700_000, plans, extendPlan },
      {
        ...deps({ mode: 'dry-run' }),
        chainFor: () => Promise.reject(new Error('no chain in dry-run')),
      },
    );
    expect(summary).toMatchObject({ dryRun: true, due: 1, enqueued: 0, jobs: 0 });
    expect((await pg.query<{ n: string }>('SELECT count(*) AS n FROM jobs')).rows[0]?.n).toBe(
      before,
    );
  });

  it('live: enqueues, pulls, extends and settles one job', async () => {
    const summary = await runHostedStage({ observedLedger: 5_700_000, plans, extendPlan }, deps());
    expect(summary).toMatchObject({
      dryRun: false,
      due: 1,
      enqueued: 1,
      jobs: 1,
      submitted: 1,
      refunded: 1,
      shortfall: 0,
      failed: 0,
    });
    const again = await runHostedStage({ observedLedger: 5_700_000, plans, extendPlan }, deps());
    expect(again).toMatchObject({ dryRun: false, enqueued: 0, jobs: 0 });
  });

  it('a queued job whose item left the plan is closed without the chain', async () => {
    await runHostedStage(
      { observedLedger: 5_700_200, plans, extendPlan },
      {
        ...deps(),
        config: { mode: 'live', retryMarginStroops: 10_000n, maxJobs: 3, deadlineMs: 0 },
      },
    );
    const summary = await runHostedStage(
      { observedLedger: 5_700_200, plans: [], extendPlan: { ...extendPlan, requests: [] } },
      { ...deps(), chainFor: () => Promise.reject(new Error('must not be called')) },
    );
    expect(summary).toMatchObject({ jobs: 0, orphaned: 0 });
    expect(await openJobs(asScheduler, 5)).toEqual([]);
  });

  it('does not close an orphan whose pull was already submitted', async () => {
    await runHostedStage({ observedLedger: 5_701_000, plans, extendPlan }, deps({ deadlineMs: 0 }));
    const [job] = await openJobs(asScheduler, 1);
    await asScheduler(
      `UPDATE jobs SET pull_submitted_hash = $2, pull_submitted_expires_at = now() + interval '1 minute' WHERE id = $1::uuid`,
      [job!.id, 'e'.repeat(64)],
    );
    const summary = await runHostedStage(
      { observedLedger: 5_701_000, plans: [], extendPlan: { ...extendPlan, requests: [] } },
      { ...deps(), chainFor: () => Promise.reject(new Error('must not be called')) },
    );
    expect(summary.orphaned).toBe(1);
    expect((await loadJob(asScheduler, job!.id)).status).toBe('queued');
    expect((await loadJob(asScheduler, job!.id)).pullSubmittedHash).toBe('e'.repeat(64));
    // An open job blocks later windows. Close it so the next test can enqueue.
    await asScheduler(
      `UPDATE jobs SET status = 'preflight-failed', pull_submitted_hash = NULL, pull_submitted_expires_at = NULL WHERE id = $1::uuid`,
      [job!.id],
    );
  });

  it('stops starting jobs at the deadline', async () => {
    const summary = await runHostedStage(
      { observedLedger: 5_700_400, plans, extendPlan },
      deps({ deadlineMs: 0 }),
    );
    expect(summary).toMatchObject({ enqueued: 1, jobs: 0, deadlineHit: true });
  });
});

describe('parseHostedConfig', () => {
  const secret = Keypair.random().secret();
  it('is dry-run unless live is asked for with a valid engine key', () => {
    expect(parseHostedConfig({}).mode).toBe('dry-run');
    expect(parseHostedConfig({ HOSTED_MODE: 'live' }).mode).toBe('dry-run');
    expect(parseHostedConfig({ HOSTED_MODE: 'live', ENGINE_SECRET: 'nope' }).mode).toBe('dry-run');
    expect(parseHostedConfig({ HOSTED_MODE: 'LIVE', ENGINE_SECRET: secret }).mode).toBe('dry-run');
    const live = parseHostedConfig({ HOSTED_MODE: 'live', ENGINE_SECRET: secret });
    expect(live.mode).toBe('live');
    expect(live.retryMarginStroops).toBeUndefined();
  });
  it('reads the margin and the job cap, falling back on anything malformed', () => {
    expect(parseHostedConfig({ ALLOWANCE_RETRY_MARGIN_STROOPS: '10000' }).retryMarginStroops).toBe(
      10_000n,
    );
    expect(
      parseHostedConfig({ ALLOWANCE_RETRY_MARGIN_STROOPS: '-1' }).retryMarginStroops,
    ).toBeUndefined();
    expect(parseHostedConfig({ HOSTED_MAX_JOBS_PER_TICK: '50' }).maxJobs).toBe(3);
    expect(parseHostedConfig({ HOSTED_MAX_JOBS_PER_TICK: '5' }).maxJobs).toBe(5);
  });
});
