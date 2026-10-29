/**
 * The payer-ownership join after account reactivation (#385 option 2, migration 0004), on PGlite.
 * A wallet counts as linked only if the user was never reactivated or the wallet was linked strictly
 * after the last reactivation.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgTenantStore } from '../src/pg-tenant-store.js';
import type { TenantQuery } from '../src/pg-tenant-store.js';
import { C, G } from './tenant-fixtures.js';
import { TENANT_DB_FILES } from './tenant-sql-fixture.js';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const NEVER = '00000000-0000-4000-8000-0000000000b1';
const BEFORE = '00000000-0000-4000-8000-0000000000b2';
const RELINKED = '00000000-0000-4000-8000-0000000000b3';
const EQUAL = '00000000-0000-4000-8000-0000000000b4';
const DEACTIVATED = '00000000-0000-4000-8000-0000000000b5';
const R = '2026-10-20T00:00:00Z';

let pg: PGlite;
const query: TenantQuery = async (sql, params) =>
  (await pg.query<Record<string, unknown>>(sql, [...params])).rows;

describe('PgTenantStore wallet link after reactivation (PGlite)', () => {
  beforeAll(async () => {
    pg = await PGlite.create({ extensions: { pgcrypto } });
    for (const f of TENANT_DB_FILES) await pg.exec(db(f));
    await pg.exec(`
      INSERT INTO users (id, email, reactivated_at) VALUES
        ('${NEVER}', 'never@example.invalid', NULL),
        ('${BEFORE}', 'before@example.invalid', '${R}'),
        ('${RELINKED}', 'relinked@example.invalid', '${R}'),
        ('${EQUAL}', 'equal@example.invalid', '${R}');
      INSERT INTO users (id, email, deactivated_at) VALUES ('${DEACTIVATED}', 'deactivated@example.invalid', '${R}');
      INSERT INTO wallets (network, account, user_id, linked_at) VALUES
        ('testnet', '${G('N')}', '${NEVER}', '2026-01-01T00:00:00Z'),
        ('testnet', '${G('B')}', '${BEFORE}', '2026-10-19T23:59:59Z'),
        ('testnet', '${G('R')}', '${RELINKED}', '2026-10-20T00:00:01Z'),
        ('testnet', '${G('E')}', '${EQUAL}', '${R}'),
        ('testnet', '${G('D')}', '${DEACTIVATED}', '2026-01-01T00:00:00Z');
      INSERT INTO watch_items (user_id, network, contract_id, scope, autopilot_enabled, payer_network, payer_account,
        threshold_ledgers, extend_to_ledgers, budget_per_job_max, budget_per_30d_max) VALUES
        ('${NEVER}', 'testnet', '${C('N')}', '{"noDataKeys":true}', true, 'testnet', '${G('N')}', 1000, 5000, 100, 300),
        ('${BEFORE}', 'testnet', '${C('B')}', '{"noDataKeys":true}', true, 'testnet', '${G('B')}', 1000, 5000, 100, 300),
        ('${RELINKED}', 'testnet', '${C('R')}', '{"noDataKeys":true}', true, 'testnet', '${G('R')}', 1000, 5000, 100, 300),
        ('${EQUAL}', 'testnet', '${C('E')}', '{"noDataKeys":true}', true, 'testnet', '${G('E')}', 1000, 5000, 100, 300),
        ('${DEACTIVATED}', 'testnet', '${C('D')}', '{"noDataKeys":true}', true, 'testnet', '${G('D')}', 1000, 5000, 100, 300);
    `);
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  const listed = async (): Promise<string[]> =>
    (await new PgTenantStore(query).listAutopilotItems('testnet')).map((r) => r.userId).sort();

  it('includes a never-reactivated user’s wallet', async () => {
    expect(await listed()).toContain(NEVER);
  });

  it('excludes a wallet linked before reactivation', async () => {
    expect(await listed()).not.toContain(BEFORE);
  });

  it('includes a wallet re-linked after reactivation', async () => {
    expect(await listed()).toContain(RELINKED);
  });

  it('boundary: linked_at == reactivated_at is excluded (strictly after)', async () => {
    expect(await listed()).not.toContain(EQUAL);
  });

  it('excludes a deactivated user’s wallet even though it was never reactivated', async () => {
    expect(await listed()).not.toContain(DEACTIVATED);
  });

  it('lists exactly the never-reactivated and re-linked items', async () => {
    expect(await listed()).toEqual([NEVER, RELINKED].sort());
  });
});
