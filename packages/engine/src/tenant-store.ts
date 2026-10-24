import { isEligible, planTenants, spendKey } from './tenants.js';
import type { AutopilotItemRow, TenantNetwork, TenantPlan } from './tenants.js';

/** Read-only source of tenant data. Implementations never write. */
export interface TenantStore {
  /** Watch items with autopilot on and not removed, on this network. */
  listAutopilotItems(network: TenantNetwork): Promise<readonly AutopilotItemRow[]>;
  /**
   * Stroops pulled minus refunded in the last 30 days for one (user, network, contract).
   * `undefined` when undetermined (a pulled job in the window has no pull ledger row); the plan
   * then treats the item as having nothing left.
   */
  spentLast30d(
    userId: string,
    network: TenantNetwork,
    contractId: string,
  ): Promise<bigint | undefined>;
  /**
   * The same sum for every (user, contract) on the network in one read, keyed by spendKey.
   * A key absent from a successful batch means no spend in the window; `null` means undetermined
   * (a pulled job without its pull ledger row).
   */
  spentLast30dBatch(network: TenantNetwork): Promise<ReadonlyMap<string, bigint | null>>;
}

export async function planTenantsFromStore(
  store: TenantStore,
  network: TenantNetwork = 'testnet',
): Promise<TenantPlan[]> {
  const rows = await store.listAutopilotItems(network);
  const batch = await store.spentLast30dBatch(network);
  const spent = new Map<string, bigint>();
  for (const row of rows) {
    if (!isEligible(row, network)) continue;
    const key = spendKey(row.userId, row.network, row.contractId);
    const used = batch.get(key);
    if (used !== null) spent.set(key, used ?? 0n);
  }
  return planTenants(rows, spent, network);
}

export interface MemorySpendEntry {
  readonly userId: string;
  readonly network: string;
  readonly contractId: string;
  /** When the job's pull confirmed; the 30-day window reads this. */
  readonly pulledAt: Date;
  readonly pulled: bigint;
  readonly refunded: bigint;
  /** Whether the pull ledger row exists. Default true; false models a pulled job without one. */
  readonly pullRecorded?: boolean;
}

/** In-memory store for tests and rehearsals. */
export class MemoryTenantStore implements TenantStore {
  readonly #rows: readonly AutopilotItemRow[];
  readonly #spend: readonly MemorySpendEntry[];
  readonly #now: () => Date;

  constructor(
    rows: readonly AutopilotItemRow[],
    spend: readonly MemorySpendEntry[] = [],
    now: () => Date = () => new Date(),
  ) {
    this.#rows = rows;
    this.#spend = spend;
    this.#now = now;
  }

  async listAutopilotItems(network: TenantNetwork): Promise<readonly AutopilotItemRow[]> {
    // Mirrors the SQL JOIN on wallets: only items paid from the item owner's own wallet.
    return this.#rows.filter(
      (r) =>
        r.network === network &&
        r.autopilotEnabled &&
        !r.removed &&
        r.payerOwnerUserId === r.userId,
    );
  }

  async spentLast30d(
    userId: string,
    network: TenantNetwork,
    contractId: string,
  ): Promise<bigint | undefined> {
    const since = this.#now().getTime() - 30 * 24 * 60 * 60 * 1000;
    let total = 0n;
    for (const e of this.#spend)
      if (
        e.userId === userId &&
        e.network === network &&
        e.contractId === contractId &&
        e.pulledAt.getTime() > since
      ) {
        if (e.pullRecorded === false) return undefined;
        total += e.pulled - e.refunded;
      }
    return total;
  }

  async spentLast30dBatch(network: TenantNetwork): Promise<ReadonlyMap<string, bigint | null>> {
    const since = this.#now().getTime() - 30 * 24 * 60 * 60 * 1000;
    const out = new Map<string, bigint | null>();
    for (const e of this.#spend) {
      if (e.network !== network || e.pulledAt.getTime() <= since) continue;
      const key = spendKey(e.userId, e.network, e.contractId);
      const prev = out.get(key);
      if (prev === null) continue;
      out.set(key, e.pullRecorded === false ? null : (prev ?? 0n) + e.pulled - e.refunded);
    }
    return out;
  }
}
