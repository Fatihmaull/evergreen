/**
 * `PgJobsStore` on a real Postgres engine (PGlite) with the shipped migrations,
 * reading **as `eg_api`** (0008 + 0017), so a missing grant fails here rather
 * than on preview. PH2-E2-08, docs/API.md §7.
 *
 * What it pins: a user sees only their own jobs and ledger rows (even rows paid
 * by a wallet that is now linked to someone else), newest first, and keyset
 * pages neither skip nor repeat rows that share a timestamp.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SqlClient } from '../src/auth/pg-store.js';
import { PgJobsStore } from '../src/jobs/pg-store.js';

const db = (f: string): string => readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8');
const NEON_LINE = "       OR pg_has_role(r, 'neon_superuser', 'MEMBER')\n";

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';
const CA = `C${'A'.repeat(55)}`;
const CB = `C${'B'.repeat(55)}`;
const GA = `G${'A'.repeat(55)}`;
const GB = `G${'B'.repeat(55)}`;
const J1 = '10000000-0000-4000-8000-000000000001';
const J2 = '20000000-0000-4000-8000-000000000002';
const J3 = '30000000-0000-4000-8000-000000000003';
const JB = '40000000-0000-4000-8000-000000000004';

let pg: PGlite;

/** Every read runs as eg_api, the API Worker's production role. */
const asApi: SqlClient = {
  query: async (text, params) => {
    await pg.exec('SET ROLE eg_api');
    try {
      return (await pg.query<Record<string, unknown>>(text, [...params])).rows;
    } finally {
      await pg.exec('RESET ROLE');
    }
  },
  transaction: () => Promise.reject(new Error('reads only')),
};
const store = new PgJobsStore(asApi);

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
    '0017_api_fee_ledger_select.sql',
  ])
    await pg.exec(db(f));

  await pg.exec(
    `INSERT INTO users (id, email) VALUES ('${A}', 'a@example.invalid'), ('${B}', 'b@example.invalid')`,
  );
  await pg.exec(
    `INSERT INTO wallets (network, account, user_id) VALUES ('testnet', '${GA}', '${A}'), ('testnet', '${GB}', '${B}')`,
  );
  await pg.exec(`INSERT INTO watch_items (user_id, network, contract_id, scope) VALUES
    ('${A}', 'testnet', '${CA}', '{"noDataKeys":true}'),
    ('${A}', 'testnet', '${CB}', '{"noDataKeys":true}'),
    ('${B}', 'testnet', '${CA}', '{"noDataKeys":true}')`);
  // J1 oldest and finished (pull, extend, refund of the margin); J2 and J3 share one
  // created_at; JB is user B's job, paid by a wallet that is later moved to A.
  await pg.exec(`INSERT INTO jobs (id, user_id, network, contract_id, kind, payer_account, status,
      created_at, autopilot_window, preflight, pull_tx_hash, pulled_at, pull_amount,
      extend_tx_hash, extend_rent_charged, refund_tx_hash, refund_amount) VALUES
    ('${J1}', '${A}', 'testnet', '${CA}', 'autopilot', '${GA}', 'extended',
      '2026-11-24 03:30:00.000001+00', 1,
      '{"ok":true,"rentStroops":"141960"}'::jsonb || jsonb_build_object('at', '2026-11-24 03:30:01+00'::timestamptz),
      'pullhash', '2026-11-24 03:30:05+00', 288405, 'extendhash', 141960, 'refundhash', 121445)`);
  await pg.exec(`INSERT INTO jobs (id, user_id, network, contract_id, kind, payer_account, status,
      created_at, autopilot_window, preflight) VALUES
    ('${J2}', '${A}', 'testnet', '${CB}', 'autopilot', '${GA}', 'preflight-failed',
      '2026-11-24 04:00:00.123456+00', 2, '{"ok":false,"reason":"allowance-missing","at":"2026-11-24T04:00:01Z"}'),
    ('${J3}', '${A}', 'testnet', '${CA}', 'autopilot', '${GA}', 'queued',
      '2026-11-24 04:00:00.123456+00', 3, NULL),
    ('${JB}', '${B}', 'testnet', '${CA}', 'autopilot', '${GB}', 'queued',
      '2026-11-24 05:00:00+00', 4, NULL)`);
  await pg.exec(`INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash, ledger, recorded_at) VALUES
    ('${J1}', 'testnet', '${GA}', '${CA}', 'pull', 288405, 'pullhash', 100, '2026-11-24 03:30:05+00'),
    ('${J1}', 'testnet', '${GA}', '${CA}', 'rent', 141960, NULL, NULL, '2026-11-24 03:30:09+00'),
    ('${J1}', 'testnet', '${GA}', '${CA}', 'evergreen-fee', 25000, NULL, NULL, '2026-11-24 03:30:09+00'),
    ('${J1}', 'testnet', '${GA}', '${CA}', 'refund', 121445, 'refundhash', 104, '2026-11-24 03:30:12+00'),
    ('${JB}', 'testnet', '${GB}', '${CA}', 'pull', 5, 'bpull', 200, '2026-11-24 05:00:05+00')`);
  // B's wallet is re-linked to A: its old rows must stay B's.
  await pg.exec(`UPDATE wallets SET user_id = '${A}' WHERE account = '${GB}'`);
}, 60_000);
afterAll(async () => {
  await pg?.close();
});

describe('PgJobsStore as eg_api', () => {
  it('🔴 lists only the caller’s jobs, newest first, ties broken by id', async () => {
    const page = await store.listJobs(A, { limit: 50 });
    expect(page.items.map((j) => j.id)).toEqual([J3, J2, J1]);
    expect(page.next).toBeNull();
    const b = await store.listJobs(B, { limit: 50 });
    expect(b.items.map((j) => j.id)).toEqual([JB]);
  });

  it('🔴 pages through rows that share a timestamp without skipping or repeating', async () => {
    const seen: string[] = [];
    let after;
    for (let i = 0; i < 5; i += 1) {
      const page = await store.listJobs(A, { limit: 1, ...(after ? { after } : {}) });
      seen.push(...page.items.map((j) => j.id));
      if (page.next === null) break;
      after = page.next;
    }
    expect(seen).toEqual([J3, J2, J1]);
  });

  it('filters by contract', async () => {
    const page = await store.listJobs(A, { limit: 50, contractId: CB });
    expect(page.items.map((j) => j.id)).toEqual([J2]);
  });

  it('maps a finished job’s steps from its columns, stroops as strings', async () => {
    const job = await store.getJob(A, J1);
    expect(job).toEqual({
      id: J1,
      network: 'testnet',
      contractId: CA,
      kind: 'autopilot',
      payerWallet: GA,
      createdAt: '2026-11-24T03:30:00.000Z',
      updatedAt: expect.any(String),
      status: 'extended',
      steps: {
        preflight: { at: '2026-11-24T03:30:01.000Z', ok: true, rentStroops: '141960' },
        pull: { at: '2026-11-24T03:30:05.000Z', txHash: 'pullhash', amountStroops: '288405' },
        extendTx: { txHash: 'extendhash', rentChargedStroops: '141960' },
        refund: { at: '2026-11-24T03:30:12.000Z', txHash: 'refundhash', amountStroops: '121445' },
      },
    });
  });

  it('shows a failed preflight with its reason and no money steps', async () => {
    const job = await store.getJob(A, J2);
    expect(job?.steps).toEqual({
      preflight: { at: '2026-11-24T04:00:01.000Z', ok: false, reason: 'allowance-missing' },
    });
  });

  it('🔴 another user’s job reads as no job', async () => {
    expect(await store.getJob(A, JB)).toBeUndefined();
    expect(await store.getJob(B, J1)).toBeUndefined();
  });

  it('🔴 ledger rows follow the job’s owner, not the wallet’s current owner', async () => {
    const a = await store.listLedger(A, { limit: 50 });
    expect(a.items.map((r) => r.jobId)).toEqual([J1, J1, J1, J1]);
    expect(a.items.map((r) => r.kind)).toEqual(['refund', 'evergreen-fee', 'rent', 'pull']);
    // A now holds GB, but B's old row stays B's.
    expect((await store.listLedger(A, { limit: 50, wallet: GB })).items).toEqual([]);
    const b = await store.listLedger(B, { limit: 50 });
    expect(b.items).toEqual([
      {
        id: expect.any(String),
        jobId: JB,
        network: 'testnet',
        wallet: GB,
        contractId: CA,
        kind: 'pull',
        amountStroops: '5',
        txHash: 'bpull',
        ledger: 200,
        recordedAt: '2026-11-24T05:00:05.000Z',
      },
    ]);
  });

  it('pages the ledger across rows recorded at the same instant', async () => {
    const seen: string[] = [];
    let after;
    for (let i = 0; i < 6; i += 1) {
      const page = await store.listLedger(A, { limit: 1, jobId: J1, ...(after ? { after } : {}) });
      seen.push(...page.items.map((r) => r.kind));
      if (page.next === null) break;
      after = page.next;
    }
    expect(seen).toEqual(['refund', 'evergreen-fee', 'rent', 'pull']);
  });

  it('eg_api still cannot write the fee ledger', async () => {
    await expect(
      asApi.query(
        `INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash) VALUES ($1::uuid, 'testnet', $2, $3, 'pull', 1, 'x')`,
        [J3, GA, CA],
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
