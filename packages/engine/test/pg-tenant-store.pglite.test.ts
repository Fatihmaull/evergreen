/**
 * The tenant store SQL against PGlite (Postgres compiled to WASM, in-process): no container, so it
 * runs in plain `pnpm test` and in CI. schema.sql → 0002 → 0003 are applied as in the opt-in
 * podman test, with the same fixture rows. Test harness only; production uses an injected driver.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgTenantStore } from '../src/pg-tenant-store.js';
import type { TenantQuery } from '../src/pg-tenant-store.js';
import { planTenantsFromStore } from '../src/tenant-store.js';
import { C, G, U1, U2 } from './tenant-fixtures.js';
import { TENANT_DB_FILES, TENANT_FIXTURE_SQL } from './tenant-sql-fixture.js';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

let pg: PGlite;
const query: TenantQuery = async (sql, params) =>
  (await pg.query<Record<string, unknown>>(sql, [...params])).rows;

describe('PgTenantStore SQL on PGlite', () => {
  beforeAll(async () => {
    pg = await PGlite.create({ extensions: { pgcrypto } });
    for (const f of TENANT_DB_FILES) await pg.exec(db(f));
    await pg.exec(TENANT_FIXTURE_SQL);
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  it('nets refunds (pull minus refund), ignores other ledger kinds and jobs older than 30 days', async () => {
    const store = new PgTenantStore(query);
    // job 1: pull 100, refund 40, rent 50 → 60; job 2 is 31 days old.
    expect(await store.spentLast30d(U1, 'testnet', C('A'))).toBe(60n);
    expect(await store.spentLast30d(U2, 'testnet', C('A'))).toBe(250n);
    expect(await store.spentLast30d(U1, 'testnet', C('B'))).toBe(0n);
  });

  it('a pulled job without a pull ledger row is undetermined, never 0', async () => {
    expect(await new PgTenantStore(query).spentLast30d(U2, 'testnet', C('D'))).toBeUndefined();
  });

  it('lists only items paid from the owner’s own wallet', async () => {
    const rows = await new PgTenantStore(query).listAutopilotItems('testnet');
    expect(rows.map((r) => [r.userId, r.contractId])).toEqual([
      [U1, C('A')],
      [U1, C('B')],
      [U2, C('A')],
      [U2, C('D')],
    ]);
  });

  it('plans per payer with the netted budgets', async () => {
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

  it('the window edge is 30 days: an hour inside counts, an hour outside does not', async () => {
    // C('E') is a manual (autopilot off) item, so the list and plan above are unaffected.
    await pg.exec(`
      INSERT INTO watch_items (user_id, network, contract_id, scope) VALUES ('${U1}', 'testnet', '${C('E')}', '{"noDataKeys":true}');
      INSERT INTO jobs (id, user_id, network, contract_id, kind, payer_account, status, autopilot_window, pull_tx_hash, pulled_at, pull_amount) VALUES
        ('10000000-0000-4000-8000-000000000005', '${U1}', 'testnet', '${C('E')}', 'autopilot', '${G('A')}', 'extended', 5, 'p5', now() - interval '30 days' + interval '1 hour', 5),
        ('10000000-0000-4000-8000-000000000006', '${U1}', 'testnet', '${C('E')}', 'autopilot', '${G('A')}', 'extended', 6, 'p6', now() - interval '30 days' - interval '1 hour', 7);
      INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash) VALUES
        ('10000000-0000-4000-8000-000000000005', 'testnet', '${G('A')}', '${C('E')}', 'pull', 5, 'p5'),
        ('10000000-0000-4000-8000-000000000006', 'testnet', '${G('A')}', '${C('E')}', 'pull', 7, 'p6');
    `);
    expect(await new PgTenantStore(query).spentLast30d(U1, 'testnet', C('E'))).toBe(5n);
  });
});
