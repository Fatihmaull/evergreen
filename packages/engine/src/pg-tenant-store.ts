import type { AutopilotItemRow, TenantNetwork } from './tenants.js';
import type { TenantStore } from './tenant-store.js';

/**
 * Injected query function: the caller owns the driver (e.g. Neon serverless) and the connection.
 * Must run parameterised SQL ($1, $2, …) and resolve to the result rows.
 */
export type TenantQuery = (
  sql: string,
  params: readonly unknown[],
) => Promise<readonly Record<string, unknown>[]>;

export class TenantStoreError extends Error {
  readonly code = 'TENANT_STORE_ROW';
  constructor(message: string) {
    super(message);
    this.name = 'TenantStoreError';
  }
}

/**
 * Read-only. Numeric columns are cast to text so stroops never pass through a float.
 * A payer wallet counts as linked only if the user was never reactivated or the wallet was linked
 * strictly after the last reactivation (#385 option 2, migration 0004). A wallet linked at or before
 * reactivation drops the item from the plan (fails closed) until the wallet is re-linked. A
 * deactivated user (users.deactivated_at set) has no linked wallets at all.
 */
export const LIST_AUTOPILOT_ITEMS_SQL = `SELECT i.user_id::text AS user_id, i.network, i.contract_id, i.scope,
  i.autopilot_enabled, (i.removed_at IS NOT NULL) AS removed, i.payer_network, i.payer_account,
  w.user_id::text AS payer_owner_user_id,
  i.threshold_ledgers::text AS threshold_ledgers, i.extend_to_ledgers::text AS extend_to_ledgers,
  i.budget_per_job_max::text AS budget_per_job_max, i.budget_per_30d_max::text AS budget_per_30d_max
FROM watch_items i
JOIN wallets w ON w.network = i.payer_network AND w.account = i.payer_account AND w.user_id = i.user_id
JOIN users u ON u.id = i.user_id AND u.deactivated_at IS NULL
  AND (u.reactivated_at IS NULL OR w.linked_at > u.reactivated_at)
WHERE i.network = $1 AND i.autopilot_enabled AND i.removed_at IS NULL
ORDER BY i.payer_account, i.contract_id, i.user_id`;

/**
 * Pulled minus refunded, for jobs of this (user, network, contract) that pulled in the last 30
 * days. `missing_pull` counts jobs with `pulled_at` set in the window but no `pull` ledger row:
 * their spend is unknown, so the caller must not read the sum as complete.
 */
export const SPENT_LAST_30D_SQL = `SELECT coalesce(sum(s.net), 0)::text AS spent,
  count(*) FILTER (WHERE NOT s.has_pull)::text AS missing_pull
FROM (
  SELECT j.id,
    coalesce(sum(CASE WHEN f.kind = 'pull' THEN f.amount WHEN f.kind = 'refund' THEN -f.amount END), 0) AS net,
    coalesce(bool_or(f.kind = 'pull'), false) AS has_pull
  FROM jobs j LEFT JOIN fee_ledger f ON f.job_id = j.id AND f.kind IN ('pull', 'refund')
  WHERE j.user_id = $1::uuid AND j.network = $2 AND j.contract_id = $3
    AND j.pulled_at > now() - interval '720 hours'
  GROUP BY j.id
) s`;

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (typeof v !== 'string' || v === '')
    throw new TenantStoreError(`Malformed tenant row: ${key}.`);
  return v;
}
function optStr(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  if (v === null || v === undefined) return null;
  return str(row, key);
}
function optInt(row: Record<string, unknown>, key: string): bigint | null {
  const v = optStr(row, key);
  if (v === null) return null;
  if (!/^-?\d+$/.test(v)) throw new TenantStoreError(`Malformed tenant row: ${key}.`);
  return BigInt(v);
}
function bool(row: Record<string, unknown>, key: string): boolean {
  const v = row[key];
  if (typeof v !== 'boolean') throw new TenantStoreError(`Malformed tenant row: ${key}.`);
  return v;
}

export class PgTenantStore implements TenantStore {
  readonly #query: TenantQuery;
  constructor(query: TenantQuery) {
    this.#query = query;
  }

  async listAutopilotItems(network: TenantNetwork): Promise<readonly AutopilotItemRow[]> {
    const rows = await this.#query(LIST_AUTOPILOT_ITEMS_SQL, [network]);
    return rows.map((row) => ({
      userId: str(row, 'user_id'),
      network: str(row, 'network'),
      contractId: str(row, 'contract_id'),
      scope: row.scope,
      autopilotEnabled: bool(row, 'autopilot_enabled'),
      removed: bool(row, 'removed'),
      payerNetwork: optStr(row, 'payer_network'),
      payerAccount: optStr(row, 'payer_account'),
      payerOwnerUserId: optStr(row, 'payer_owner_user_id'),
      thresholdLedgers: optInt(row, 'threshold_ledgers'),
      extendToLedgers: optInt(row, 'extend_to_ledgers'),
      budgetPerJobMax: optInt(row, 'budget_per_job_max'),
      budgetPer30dMax: optInt(row, 'budget_per_30d_max'),
    }));
  }

  async spentLast30d(
    userId: string,
    network: TenantNetwork,
    contractId: string,
  ): Promise<bigint | undefined> {
    const rows = await this.#query(SPENT_LAST_30D_SQL, [userId, network, contractId]);
    if (rows.length !== 1) throw new TenantStoreError('Malformed tenant spend result.');
    const v = optInt(rows[0]!, 'spent');
    const missing = optInt(rows[0]!, 'missing_pull');
    if (v === null || missing === null)
      throw new TenantStoreError('Malformed tenant spend result.');
    // Fail closed: a pulled job without its pull row would otherwise read as spend 0.
    return missing === 0n ? v : undefined;
  }
}
