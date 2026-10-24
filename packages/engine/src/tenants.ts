/**
 * Multi-tenant planning for the hosted engine (PH2-E4-01, plan §3.3).
 *
 * Pure and read-only: turns watch items into work groups per (network, payer account), with each
 * item's own budget. Nothing here signs, submits or moves money; the money flow is PH2-E4-02.
 * Never assumes a single global payer (ADR-004): the same contract watched by two users is two
 * independent items, each with its own payer and budget.
 */

/** Writes stay testnet-only until DoD-2 (PH2-E5-02). */
export type TenantNetwork = 'testnet';

export interface AutopilotItemRow {
  readonly userId: string;
  readonly network: string;
  readonly contractId: string;
  readonly scope: unknown;
  readonly autopilotEnabled: boolean;
  readonly removed: boolean;
  readonly payerNetwork: string | null;
  readonly payerAccount: string | null;
  /** Owner (`wallets.user_id`) of the payer wallet; null when unknown. Must equal `userId`. */
  readonly payerOwnerUserId: string | null;
  readonly thresholdLedgers: bigint | null;
  readonly extendToLedgers: bigint | null;
  /** Stroops. */
  readonly budgetPerJobMax: bigint | null;
  /** Stroops. */
  readonly budgetPer30dMax: bigint | null;
}

export interface TenantItem {
  readonly userId: string;
  readonly contractId: string;
  readonly scope: unknown;
  readonly thresholdLedgers: bigint;
  readonly extendToLedgers: bigint;
  readonly budget: {
    /** Stroops; one job may pull at most this. */
    readonly perJobMax: bigint;
    /** Stroops; 30-day cap minus spend net of refunds, never below 0. */
    readonly per30dRemaining: bigint;
  };
}

export interface TenantPlan {
  readonly network: TenantNetwork;
  readonly payerAccount: string;
  readonly items: readonly TenantItem[];
}

export type BudgetVerdict = 'ok' | 'over-per-job' | 'over-30d' | 'undetermined';

/** Key for an item's 30-day spend lookup. */
export function spendKey(userId: string, network: string, contractId: string): string {
  return JSON.stringify([userId, network, contractId]);
}

/**
 * Whether a row may run autopilot on this network. Mirrors the schema CHECK for network, flags,
 * payer and budgets. Ledger threshold ordering is left to the schema CHECK: TTL comparisons
 * belong to core's needsAction() (docs/CONVENTIONS.md § One home for a policy).
 */
export function isEligible(row: AutopilotItemRow, network: TenantNetwork): boolean {
  return (
    network === 'testnet' &&
    row.network === network &&
    row.autopilotEnabled === true &&
    row.removed === false &&
    row.payerNetwork === network &&
    typeof row.payerAccount === 'string' &&
    row.payerAccount !== '' &&
    row.payerOwnerUserId === row.userId &&
    typeof row.thresholdLedgers === 'bigint' &&
    typeof row.extendToLedgers === 'bigint' &&
    typeof row.budgetPerJobMax === 'bigint' &&
    typeof row.budgetPer30dMax === 'bigint' &&
    row.budgetPerJobMax >= 0n &&
    row.budgetPer30dMax >= 0n
  );
}

/**
 * Groups eligible rows by payer account. `spent` maps spendKey → 30-day spend net of refunds
 * (stroops). A missing spend is treated as the whole cap spent (remaining 0), never as 0 spent.
 * Output order is deterministic: payer account, then contract id, then user id.
 */
export function planTenants(
  rows: readonly AutopilotItemRow[],
  spent: ReadonlyMap<string, bigint>,
  network: TenantNetwork = 'testnet',
): TenantPlan[] {
  const groups = new Map<string, TenantItem[]>();
  for (const row of rows) {
    if (!isEligible(row, network)) continue;
    const used = spent.get(spendKey(row.userId, row.network, row.contractId));
    const cap = row.budgetPer30dMax as bigint;
    const budgetLeft = used === undefined ? 0n : cap - (used < 0n ? 0n : used);
    const item: TenantItem = {
      userId: row.userId,
      contractId: row.contractId,
      scope: row.scope,
      thresholdLedgers: row.thresholdLedgers as bigint,
      extendToLedgers: row.extendToLedgers as bigint,
      budget: {
        perJobMax: row.budgetPerJobMax as bigint,
        per30dRemaining: budgetLeft < 0n ? 0n : budgetLeft,
      },
    };
    const payer = row.payerAccount as string;
    const list = groups.get(payer) ?? [];
    list.push(item);
    groups.set(payer, list);
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...groups.keys()].sort(cmp).map((payerAccount) => ({
    network,
    payerAccount,
    items: groups
      .get(payerAccount)!
      .sort((a, b) => cmp(a.contractId, b.contractId) || cmp(a.userId, b.userId)),
  }));
}

/**
 * Per-contract budget gate. The estimate is rent + fee in stroops for one job. Reaching a cap
 * exactly is allowed (<=). No estimate means `undetermined`, never `ok`.
 */
export function checkBudget(item: TenantItem, estimatedStroops: bigint | undefined): BudgetVerdict {
  if (typeof estimatedStroops !== 'bigint' || estimatedStroops < 0n) return 'undetermined';
  if (estimatedStroops > item.budget.perJobMax) return 'over-per-job';
  if (estimatedStroops > item.budget.per30dRemaining) return 'over-30d';
  return 'ok';
}
