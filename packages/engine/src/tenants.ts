/**
 * Multi-tenant planning for the hosted engine (PH2-E4-01, plan §3.3).
 *
 * Pure and read-only: turns watch items into work groups per (network, payer account), with each
 * item's own budget. Nothing here signs, submits or moves money; the money flow is PH2-E4-02.
 * Never assumes a single global payer (ADR-004, superseded by ADR-007; the invariant survives): the same contract watched by two users is two
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
  /**
   * The user's allowance-holding G-account (ADR-007), owned by every item's user. Not the
   * engine's executing account.
   */
  readonly payerAccount: string;
  readonly items: readonly TenantItem[];
}

export type BudgetVerdict = 'ok' | 'over-per-job' | 'over-30d' | 'undetermined';

/** Key for an item's 30-day spend lookup. */
export function spendKey(userId: string, network: string, contractId: string): string {
  return JSON.stringify([userId, network, contractId]);
}

/**
 * Whether a row may run autopilot on this network: testnet, autopilot on, not removed, a payer on
 * this network owned by the item's user, and non-negative budgets present. It does NOT re-check
 * threshold_ledgers > 0 or extend_to_ledgers > threshold_ledgers; those are guarded only by the
 * schema CHECK (TTL comparisons belong to core, see issue #442), so a memory rehearsal can hold
 * rows the database would refuse.
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
 * Per-contract budget check (pure; no run calls it yet). The estimate is the amount one job will
 * pull, in stroops: rent + fee + margin (ADR-007 K2), the same basis as the 30-day spend (pull
 * minus refund). Reaching a cap
 * exactly is allowed (<=). No estimate means `undetermined`, never `ok`.
 */
export function checkBudget(item: TenantItem, estimatedStroops: bigint | undefined): BudgetVerdict {
  if (typeof estimatedStroops !== 'bigint' || estimatedStroops < 0n) return 'undetermined';
  if (estimatedStroops > item.budget.perJobMax) return 'over-per-job';
  if (estimatedStroops > item.budget.per30dRemaining) return 'over-30d';
  return 'ok';
}
