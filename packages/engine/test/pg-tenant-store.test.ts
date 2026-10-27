import { describe, expect, it, vi } from 'vitest';
import {
  LIST_AUTOPILOT_ITEMS_SQL,
  PgTenantStore,
  SPENT_LAST_30D_SQL,
  TenantStoreError,
} from '../src/pg-tenant-store.js';
import type { TenantQuery } from '../src/pg-tenant-store.js';
import { C, G, U1 } from './tenant-fixtures.js';

const dbRow = {
  user_id: U1,
  network: 'testnet',
  contract_id: C('A'),
  scope: { noDataKeys: true },
  autopilot_enabled: true,
  removed: false,
  payer_network: 'testnet',
  payer_account: G('A'),
  payer_owner_user_id: U1,
  threshold_ledgers: '1000',
  extend_to_ledgers: '5000',
  budget_per_job_max: '123456789012345678901234567890',
  budget_per_30d_max: '300',
};

describe('PgTenantStore', () => {
  it('maps rows with exact bigint stroops and passes the network as a parameter', async () => {
    const query = vi.fn<TenantQuery>(async () => [dbRow]);
    const rows = await new PgTenantStore(query).listAutopilotItems('testnet');
    expect(query).toHaveBeenCalledWith(LIST_AUTOPILOT_ITEMS_SQL, ['testnet']);
    expect(rows[0]).toMatchObject({
      userId: U1,
      payerAccount: G('A'),
      budgetPerJobMax: 123456789012345678901234567890n,
      thresholdLedgers: 1000n,
    });
  });

  it('only reads: both statements are SELECTs filtered as specified', () => {
    for (const sql of [LIST_AUTOPILOT_ITEMS_SQL, SPENT_LAST_30D_SQL]) {
      expect(sql.trimStart().startsWith('SELECT')).toBe(true);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
    }
    expect(LIST_AUTOPILOT_ITEMS_SQL).toMatch(/i\.autopilot_enabled AND i\.removed_at IS NULL/);
    expect(LIST_AUTOPILOT_ITEMS_SQL).toMatch(
      /JOIN wallets w ON w\.network = i\.payer_network AND w\.account = i\.payer_account AND w\.user_id = i\.user_id/,
    );
    expect(SPENT_LAST_30D_SQL).toMatch(
      /j\.user_id = \$1::uuid AND j\.network = \$2 AND j\.contract_id = \$3/,
    );
    expect(SPENT_LAST_30D_SQL).toMatch(/interval '30 days'/);
  });

  it('reads the net spend for one (user, network, contract)', async () => {
    const query = vi.fn<TenantQuery>(async () => [{ spent: '60', missing_pull: '0' }]);
    expect(await new PgTenantStore(query).spentLast30d(U1, 'testnet', C('A'))).toBe(60n);
    expect(query).toHaveBeenCalledWith(SPENT_LAST_30D_SQL, [U1, 'testnet', C('A')]);
  });

  it('fails closed when a pulled job in the window has no pull ledger row', async () => {
    const store = new PgTenantStore(async () => [{ spent: '0', missing_pull: '1' }]);
    expect(await store.spentLast30d(U1, 'testnet', C('A'))).toBeUndefined();
    await expect(
      new PgTenantStore(async () => [{ spent: '0' }]).spentLast30d(U1, 'testnet', C('A')),
    ).rejects.toBeInstanceOf(TenantStoreError);
    expect(SPENT_LAST_30D_SQL).toMatch(/LEFT JOIN fee_ledger/);
  });

  it.each([
    ['float stroops', { ...dbRow, budget_per_job_max: 1.5 }],
    ['decimal string', { ...dbRow, budget_per_job_max: '1.5' }],
    ['missing user', { ...dbRow, user_id: null }],
    ['string boolean', { ...dbRow, removed: 'false' }],
  ])('rejects a malformed row (%s)', async (_, bad) => {
    const store = new PgTenantStore(async () => [bad as Record<string, unknown>]);
    await expect(store.listAutopilotItems('testnet')).rejects.toBeInstanceOf(TenantStoreError);
  });

  it.each([[[]], [[{ spent: null }]], [[{ spent: '1e3' }]]])(
    'rejects a malformed spend result %j',
    async (result) => {
      const store = new PgTenantStore(async () => result);
      await expect(store.spentLast30d(U1, 'testnet', C('A'))).rejects.toBeInstanceOf(
        TenantStoreError,
      );
    },
  );
});
