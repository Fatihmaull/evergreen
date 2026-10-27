/**
 * Postgres `WatchlistStore` over apps/api/db/schema.sql (`watch_items`, `jobs`,
 * `observations`), through the same `SqlClient` the auth store uses, so tests
 * swap in a fake with no network.
 *
 * Every statement filters on `user_id`: a user cannot read or change another
 * user's item, whatever the caller passes.
 *
 * Schema facts relied on: `scope` is jsonb; stroops are numeric(39,0), read
 * back as text; a removed item must have autopilot off (CHECK); an enabled
 * item needs a testnet payer, threshold, extend-to and both budgets (CHECK);
 * the payer FK to `wallets` does not say whose wallet it is, so the UPDATE
 * checks that itself.
 */
import type { SqlClient, SqlQuery, SqlRow } from '../auth/pg-store.js';
import type {
  AddOutcome,
  AutopilotSettings,
  NewWatchItem,
  UpdateResult,
  WatchNetwork,
  WatchPatch,
  WatchRecord,
  WatchScope,
  WatchlistStore,
} from './store.js';

const num = (v: unknown): number => Number(v);

const SELECT_ITEMS = `SELECT w.network::text AS network, w.contract_id::text AS contract_id, w.label,
  extract(epoch from w.added_at)::int8 AS added_at, w.scope, w.autopilot_enabled,
  w.payer_account::text AS payer_account, w.threshold_ledgers::text AS threshold_ledgers,
  w.extend_to_ledgers::text AS extend_to_ledgers, w.budget_per_job_max::text AS budget_per_job_max,
  w.budget_per_30d_max::text AS budget_per_30d_max,
  u.used_today, u.oldest_use,
  o.observed_at_ledger::text AS observed_at_ledger, extract(epoch from o.observed_at)::int8 AS observed_at,
  o.scan, o.health
FROM watch_items w
LEFT JOIN LATERAL (
  SELECT count(*)::int AS used_today, extract(epoch from min(j.pulled_at))::int8 AS oldest_use
  FROM jobs j
  WHERE j.user_id = w.user_id AND j.network = w.network AND j.contract_id = w.contract_id
    AND j.kind = 'extend-now' AND j.pull_tx_hash IS NOT NULL
    AND j.pulled_at > to_timestamp($2) - interval '24 hours'
) u ON true
LEFT JOIN LATERAL (
  SELECT observed_at_ledger, observed_at, scan, health FROM observations ob
  WHERE ob.network = w.network AND ob.contract_id = w.contract_id
  ORDER BY ob.observed_at_ledger DESC LIMIT 1
) o ON true
WHERE w.user_id = $1::uuid AND w.removed_at IS NULL`;

function recordFromRow(r: SqlRow): WatchRecord {
  const used = num(r['used_today']);
  const label = r['label'];
  const autopilot: AutopilotSettings | undefined =
    r['autopilot_enabled'] === true
      ? {
          payerWallet: String(r['payer_account']),
          thresholdLedgers: num(r['threshold_ledgers']),
          extendToLedgers: num(r['extend_to_ledgers']),
          perJobMaxStroops: String(r['budget_per_job_max']),
          per30DaysMaxStroops: String(r['budget_per_30d_max']),
        }
      : undefined;
  return {
    network: String(r['network']) as WatchNetwork,
    contractId: String(r['contract_id']),
    ...(typeof label === 'string' ? { label } : {}),
    addedAt: num(r['added_at']),
    scope: r['scope'] as WatchScope,
    ...(autopilot === undefined ? {} : { autopilot }),
    extendNow: {
      usedToday: used,
      ...(used === 0 || r['oldest_use'] === null ? {} : { oldestUseAt: num(r['oldest_use']) }),
    },
    lastObservation:
      r['observed_at_ledger'] === null || r['observed_at_ledger'] === undefined
        ? null
        : {
            observedAtLedger: num(r['observed_at_ledger']),
            observedAt: num(r['observed_at']),
            scan: r['scan'],
            health: String(r['health']),
          },
  };
}

export class PgWatchlistStore implements WatchlistStore {
  constructor(private readonly sql: SqlClient) {}

  async list(userId: string, now: number): Promise<readonly WatchRecord[]> {
    const rows = await this.sql.query(`${SELECT_ITEMS} ORDER BY w.added_at, w.contract_id`, [
      userId,
      now,
    ]);
    return rows.map(recordFromRow);
  }

  async get(
    userId: string,
    network: WatchNetwork,
    contractId: string,
    now: number,
  ): Promise<WatchRecord | undefined> {
    const rows = await this.sql.query(`${SELECT_ITEMS} AND w.network = $3 AND w.contract_id = $4`, [
      userId,
      now,
      network,
      contractId,
    ]);
    return rows[0] === undefined ? undefined : recordFromRow(rows[0]);
  }

  /**
   * One statement. A new row is inserted; a removed row is restored with
   * `removed_at = NULL` and nothing else changed (label, scope and budget stay,
   * autopilot is already off); a live row is left untouched.
   */
  async add(userId: string, item: NewWatchItem, now: number): Promise<AddOutcome> {
    const rows = await this.sql.query(
      `WITH prior AS (
  SELECT removed_at IS NOT NULL AS was_removed FROM watch_items
  WHERE user_id = $1::uuid AND network = $2 AND contract_id = $3
), ins AS (
  INSERT INTO watch_items (user_id, network, contract_id, label, scope, added_at)
  VALUES ($1::uuid, $2, $3, $4, $5::jsonb, to_timestamp($6))
  ON CONFLICT (user_id, network, contract_id) DO UPDATE SET removed_at = NULL
    WHERE watch_items.removed_at IS NOT NULL
  RETURNING 1
)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM prior) THEN 'created'
  WHEN (SELECT was_removed FROM prior) THEN 'restored' ELSE 'existing' END AS outcome`,
      [userId, item.network, item.contractId, item.label ?? null, JSON.stringify(item.scope), now],
    );
    const outcome = rows[0]?.['outcome'];
    if (outcome === 'created' || outcome === 'restored' || outcome === 'existing') return outcome;
    throw new Error('Unexpected answer to the watch item insert.');
  }

  /**
   * One UPDATE built from the fields present. When autopilot is turned on, the
   * WHERE clause also requires that the payer wallet is one of this user's own
   * (`wallets.user_id`): the FK alone would accept anyone's. Turning it off
   * clears the payer, so the wallet can be unlinked again, and keeps the
   * threshold and budget as stored.
   */
  async update(
    userId: string,
    network: WatchNetwork,
    contractId: string,
    patch: WatchPatch,
  ): Promise<UpdateResult> {
    const params: unknown[] = [userId, network, contractId];
    const p = (value: unknown): string => `$${params.push(value)}`;
    const set: string[] = [];
    const where = ['user_id = $1::uuid', 'network = $2', 'contract_id = $3', 'removed_at IS NULL'];
    if (patch.label !== undefined) set.push(`label = ${p(patch.label)}`);
    if (patch.scope !== undefined) set.push(`scope = ${p(JSON.stringify(patch.scope))}::jsonb`);
    const autopilot = patch.autopilot;
    if (autopilot?.enabled === true) {
      const payer = p(autopilot.payerWallet);
      set.push(
        'autopilot_enabled = true',
        `payer_network = 'testnet'`,
        `payer_account = ${payer}`,
        `threshold_ledgers = ${p(autopilot.thresholdLedgers)}`,
        `extend_to_ledgers = ${p(autopilot.extendToLedgers)}`,
        `budget_per_job_max = ${p(autopilot.perJobMaxStroops)}::stroops`,
        `budget_per_30d_max = ${p(autopilot.per30DaysMaxStroops)}::stroops`,
      );
      where.push(
        `EXISTS (SELECT 1 FROM wallets x WHERE x.network = 'testnet' AND x.account = ${payer} AND x.user_id = $1::uuid)`,
      );
    } else if (autopilot?.enabled === false) {
      set.push('autopilot_enabled = false', 'payer_network = NULL', 'payer_account = NULL');
    }
    if (set.length === 0) return 'updated'; // nothing to write; the route refuses an empty patch
    const rows = await this.sql.query(
      `UPDATE watch_items SET ${set.join(', ')} WHERE ${where.join(' AND ')} RETURNING 1 AS ok`,
      params,
    );
    if (rows.length > 0) return 'updated';
    // No row: the item is not this user's (or is removed), or the payer is not
    // this user's wallet. One more read tells them apart.
    const found = await this.sql.query(
      `SELECT 1 AS found FROM watch_items WHERE user_id = $1::uuid AND network = $2 AND contract_id = $3 AND removed_at IS NULL`,
      [userId, network, contractId],
    );
    return found.length > 0 ? 'payer-not-linked' : 'not-found';
  }

  /** Atomic: cancel the still-queued jobs, then mark the item removed. */
  async remove(
    userId: string,
    network: WatchNetwork,
    contractId: string,
    now: number,
  ): Promise<boolean> {
    const key = [userId, network, contractId, now];
    const queries: SqlQuery[] = [
      {
        text: `UPDATE jobs SET status = 'cancelled', updated_at = to_timestamp($4)
WHERE user_id = $1::uuid AND network = $2 AND contract_id = $3 AND status = 'queued' AND pull_tx_hash IS NULL
  AND EXISTS (SELECT 1 FROM watch_items WHERE user_id = $1::uuid AND network = $2 AND contract_id = $3 AND removed_at IS NULL)`,
        params: key,
      },
      {
        text: `UPDATE watch_items SET removed_at = to_timestamp($4), autopilot_enabled = false, payer_network = NULL, payer_account = NULL
WHERE user_id = $1::uuid AND network = $2 AND contract_id = $3 AND removed_at IS NULL RETURNING 1 AS ok`,
        params: key,
      },
    ];
    const results = await this.sql.transaction(queries);
    return (results[1]?.length ?? 0) > 0;
  }
}
