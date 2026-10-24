/**
 * PgTenantStore against a real throwaway Postgres 17, with schema.sql → 0002 → 0003 applied.
 * Opt-in: set EVERGREEN_PG_PODMAN_CONTAINER to the name of a running, disposable podman container
 * from docker.io/library/postgres:17 (user postgres). The test resets the public schema in it.
 *
 *   podman run -d --rm --name eg-pg -e POSTGRES_PASSWORD=x docker.io/library/postgres:17
 *   EVERGREEN_PG_PODMAN_CONTAINER=eg-pg pnpm exec vitest run --config vitest.integration.config.ts \
 *     packages/engine/test/pg-tenant-store.integration.test.ts
 *
 * The query function shells out to psql: test harness only, never a production driver.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { PgTenantStore } from '../src/pg-tenant-store.js';
import type { TenantQuery } from '../src/pg-tenant-store.js';
import { planTenantsFromStore } from '../src/tenant-store.js';
import { C, G, U1, U2 } from './tenant-fixtures.js';

const container = process.env.EVERGREEN_PG_PODMAN_CONTAINER;
const db = (f: string) =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

function psql(sql: string): string {
  return execFileSync(
    'podman',
    ['exec', '-i', container!, 'psql', '-U', 'postgres', '-At', '-q', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' },
  );
}

function literal(v: unknown): string {
  if (typeof v !== 'string') throw new Error('test harness only binds strings');
  return `'${v.replace(/'/g, "''")}'`;
}

const query: TenantQuery = async (sql, params) => {
  const bound = sql.replace(/\$(\d+)/g, (_, n: string) => literal(params[Number(n) - 1]));
  const out = psql(`SELECT coalesce(json_agg(t), '[]'::json) FROM (${bound}) t;`);
  return JSON.parse(out.trim()) as Record<string, unknown>[];
};

describe.skipIf(!container)('PgTenantStore on Postgres 17', () => {
  beforeAll(() => {
    psql('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const f of [
      'schema.sql',
      '0002_jobs_daily_limit_per_user.sql',
      '0003_auth_rate_counters_wallet_challenges.sql',
    ])
      psql(`BEGIN;\n${db(f)}\nCOMMIT;`);
    psql(`
      INSERT INTO users (id, email) VALUES ('${U1}', 'u1@example.invalid'), ('${U2}', 'u2@example.invalid');
      INSERT INTO wallets (network, account, user_id) VALUES ('testnet', '${G('A')}', '${U1}'), ('testnet', '${G('B')}', '${U2}');
      INSERT INTO watch_items (user_id, network, contract_id, scope, autopilot_enabled, payer_network, payer_account,
        threshold_ledgers, extend_to_ledgers, budget_per_job_max, budget_per_30d_max) VALUES
        ('${U1}', 'testnet', '${C('A')}', '{"noDataKeys":true}', true, 'testnet', '${G('A')}', 1000, 5000, 100, 300),
        ('${U2}', 'testnet', '${C('A')}', '{"noDataKeys":true}', true, 'testnet', '${G('B')}', 1000, 5000, 100, 300),
        ('${U1}', 'testnet', '${C('B')}', '{"noDataKeys":true}', true, 'testnet', '${G('A')}', 1000, 5000, 100, 300);
      INSERT INTO watch_items (user_id, network, contract_id, scope, removed_at) VALUES
        ('${U1}', 'testnet', '${C('Z')}', '{"noDataKeys":true}', now());
      INSERT INTO jobs (id, user_id, network, contract_id, kind, payer_account, status, autopilot_window, pull_tx_hash, pulled_at, pull_amount) VALUES
        ('10000000-0000-4000-8000-000000000001', '${U1}', 'testnet', '${C('A')}', 'autopilot', '${G('A')}', 'refunded', 1, 'p1', now() - interval '1 day', 100),
        ('10000000-0000-4000-8000-000000000002', '${U1}', 'testnet', '${C('A')}', 'autopilot', '${G('A')}', 'extended', 2, 'p2', now() - interval '31 days', 100),
        ('10000000-0000-4000-8000-000000000003', '${U2}', 'testnet', '${C('A')}', 'autopilot', '${G('B')}', 'extended', 3, 'p3', now() - interval '1 day', 250);
      INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash) VALUES
        ('10000000-0000-4000-8000-000000000001', 'testnet', '${G('A')}', '${C('A')}', 'pull', 100, 'p1'),
        ('10000000-0000-4000-8000-000000000001', 'testnet', '${G('A')}', '${C('A')}', 'refund', 40, 'r1'),
        ('10000000-0000-4000-8000-000000000001', 'testnet', '${G('A')}', '${C('A')}', 'rent', 50, NULL),
        ('10000000-0000-4000-8000-000000000002', 'testnet', '${G('A')}', '${C('A')}', 'pull', 100, 'p2'),
        ('10000000-0000-4000-8000-000000000003', 'testnet', '${G('B')}', '${C('A')}', 'pull', 250, 'p3');
    `);
  });

  it('nets refunds within 30 days per (user, network, contract)', async () => {
    const store = new PgTenantStore(query);
    expect(await store.spentLast30d(U1, 'testnet', C('A'))).toBe(60n);
    expect(await store.spentLast30d(U2, 'testnet', C('A'))).toBe(250n);
    expect(await store.spentLast30d(U1, 'testnet', C('B'))).toBe(0n);
  });

  it('plans per payer from the real tables, excluding removed items', async () => {
    const plan = await planTenantsFromStore(new PgTenantStore(query));
    expect(
      plan.map((p) => [
        p.payerAccount,
        p.items.map((i) => [i.userId, i.contractId, i.budget.per30dRemaining]),
      ]),
    ).toEqual([
      [
        G('A'),
        [
          [U1, C('A'), 240n],
          [U1, C('B'), 300n],
        ],
      ],
      [G('B'), [[U2, C('A'), 50n]]],
    ]);
  });

  it('wrote nothing: row counts unchanged after planning', async () => {
    const counts = () =>
      psql(
        `SELECT (SELECT count(*) FROM jobs) || ',' || (SELECT count(*) FROM fee_ledger) || ',' || (SELECT count(*) FROM watch_items);`,
      ).trim();
    const before = counts();
    await planTenantsFromStore(new PgTenantStore(query));
    expect(counts()).toBe(before);
  });
});
