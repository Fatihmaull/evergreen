/**
 * PgTenantStore against a real throwaway Postgres 17, with schema.sql → 0002 → 0003 → 0004 applied.
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
import { TENANT_DB_FILES, TENANT_FIXTURE_SQL } from './tenant-sql-fixture.js';

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
    for (const f of TENANT_DB_FILES) psql(`BEGIN;\n${db(f)}\nCOMMIT;`);
    psql(TENANT_FIXTURE_SQL);
  });

  it('nets refunds within 720 hours per (user, network, contract)', async () => {
    const store = new PgTenantStore(query);
    expect(await store.spentLast30d(U1, 'testnet', C('A'))).toBe(60n);
    expect(await store.spentLast30d(U2, 'testnet', C('A'))).toBe(250n);
    expect(await store.spentLast30d(U1, 'testnet', C('B'))).toBe(0n);
    // Pulled job with no pull ledger row: undetermined, never 0.
    expect(await store.spentLast30d(U2, 'testnet', C('D'))).toBeUndefined();
  });

  it('does not list an item paid from another user’s wallet', async () => {
    const rows = await new PgTenantStore(query).listAutopilotItems('testnet');
    expect(rows.map((r) => [r.userId, r.contractId])).not.toContainEqual([U2, C('C')]);
    expect(rows.every((r) => r.payerOwnerUserId === r.userId)).toBe(true);
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
      [
        G('B'),
        [
          [U2, C('A'), 50n],
          [U2, C('D'), 0n],
        ],
      ],
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
