/**
 * Watchlist storage behind an interface (`PH2-E2-05`, docs/API.md §6). The
 * real implementation is Postgres on Neon over `watch_items`, `jobs` and
 * `observations` in apps/api/db/schema.sql; tests run the in-memory one.
 *
 * Every method takes the caller's `userId` and can only see or change that
 * user's rows. The route layer passes the session's user, never a value from
 * the request.
 */

/** The "Extend now" window (§7): a rolling 24 hours. */
export const DAY_SECONDS = 86_400;

export type WatchNetwork = 'testnet' | 'mainnet';

export type WatchScope = { readonly dataKeys: readonly string[] } | { readonly noDataKeys: true };

/** The stored autopilot settings. Stroops are decimal strings, never numbers (§2). */
export interface AutopilotSettings {
  /** A G-account the user linked; it holds the allowance. */
  readonly payerWallet: string;
  readonly thresholdLedgers: number;
  readonly extendToLedgers: number;
  readonly perJobMaxStroops: string;
  readonly per30DaysMaxStroops: string;
}

/** One watch item as the store holds it. Times are unix seconds. */
export interface WatchRecord {
  readonly network: WatchNetwork;
  readonly contractId: string;
  readonly label?: string;
  readonly addedAt: number;
  readonly scope: WatchScope;
  /** Present only while autopilot is on. */
  readonly autopilot?: AutopilotSettings;
  /** The caller's "Extend now" uses of this contract in the rolling 24 hours before `now`. */
  readonly extendNow: { readonly usedToday: number; readonly oldestUseAt?: number };
  /** The engine's latest observation of the contract, or null before the first one. */
  readonly lastObservation: {
    readonly observedAtLedger: number;
    readonly observedAt: number;
    /** `ScanResult` as stored, passed through untouched. */
    readonly scan: unknown;
    readonly health: string;
  } | null;
}

export interface NewWatchItem {
  readonly network: WatchNetwork;
  readonly contractId: string;
  readonly label?: string;
  readonly scope: WatchScope;
}

/** `created`: a new row. `restored`: a removed item came back. `existing`: it was already on the list. */
export type AddOutcome = 'created' | 'restored' | 'existing';

export type AutopilotPatch =
  { readonly enabled: false } | ({ readonly enabled: true } & AutopilotSettings);

export interface WatchPatch {
  readonly label?: string;
  readonly scope?: WatchScope;
  readonly autopilot?: AutopilotPatch;
}

/**
 * `payer-not-linked`: the payer wallet is not linked to this user. The real
 * store enforces it in the UPDATE itself, so a route that forgot to check
 * still cannot name another user's wallet.
 *
 * `payer-relink-required`: the wallet is the user's, but was linked at or before
 * the account's last reactivation, so it does not count until the user signs the
 * wallet challenge again (docs/API.md §10, #385 option 2). Only the real store
 * knows reactivation; the in-memory one never returns it.
 */
export type UpdateResult = 'updated' | 'not-found' | 'payer-not-linked' | 'payer-relink-required';

export interface WatchlistStore {
  /** The caller's items that are not removed. */
  list(userId: string, now: number): Promise<readonly WatchRecord[]>;
  /** One of the caller's items that is not removed. */
  get(
    userId: string,
    network: WatchNetwork,
    contractId: string,
    now: number,
  ): Promise<WatchRecord | undefined>;
  /**
   * Idempotent on (user, network, contract). Re-adding a removed item clears
   * `removed_at` and keeps its old label, scope and budget; autopilot stays off
   * (docs/API.md §6, NOTES.md D4). An item already on the list is left as is.
   */
  add(userId: string, item: NewWatchItem, now: number): Promise<AddOutcome>;
  update(
    userId: string,
    network: WatchNetwork,
    contractId: string,
    patch: WatchPatch,
  ): Promise<UpdateResult>;
  /**
   * Soft delete (§6): sets `removed_at`, turns autopilot off, releases the
   * payer wallet, and moves the item's still-`queued` jobs to `cancelled` in
   * one transaction. Jobs that already pulled are left to finish. False if the
   * caller has no such item.
   */
  remove(userId: string, network: WatchNetwork, contractId: string, now: number): Promise<boolean>;
}
