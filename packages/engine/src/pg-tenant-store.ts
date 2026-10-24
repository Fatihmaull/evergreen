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

/** Read-only. Numeric columns are cast to text so stroops never pass through a float. */
export const LIST_AUTOPILOT_ITEMS_SQL = `SELECT user_id::text AS user_id, network, contract_id, scope,
  autopilot_enabled, (removed_at IS NOT NULL) AS removed, payer_network, payer_account,
  threshold_ledgers::text AS threshold_ledgers, extend_to_ledgers::text AS extend_to_ledgers,
  budget_per_job_max::text AS budget_per_job_max, budget_per_30d_max::text AS budget_per_30d_max
FROM watch_items
WHERE network = $1 AND autopilot_enabled AND removed_at IS NULL
ORDER BY payer_account, contract_id, user_id`;

/** Pulled minus refunded, for jobs of this (user, network, contract) that pulled in the last 30 days. */
export const SPENT_LAST_30D_SQL = `SELECT coalesce(sum(CASE WHEN f.kind = 'pull' THEN f.amount ELSE -f.amount END), 0)::text AS spent
FROM fee_ledger f JOIN jobs j ON j.id = f.job_id
WHERE j.user_id = $1::uuid AND j.network = $2 AND j.contract_id = $3
  AND j.pulled_at > now() - interval '30 days'
  AND f.kind IN ('pull', 'refund')`;

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
      thresholdLedgers: optInt(row, 'threshold_ledgers'),
      extendToLedgers: optInt(row, 'extend_to_ledgers'),
      budgetPerJobMax: optInt(row, 'budget_per_job_max'),
      budgetPer30dMax: optInt(row, 'budget_per_30d_max'),
    }));
  }

  async spentLast30d(userId: string, network: TenantNetwork, contractId: string): Promise<bigint> {
    const rows = await this.#query(SPENT_LAST_30D_SQL, [userId, network, contractId]);
    if (rows.length !== 1) throw new TenantStoreError('Malformed tenant spend result.');
    const v = optInt(rows[0]!, 'spent');
    if (v === null) throw new TenantStoreError('Malformed tenant spend result.');
    return v;
  }
}
