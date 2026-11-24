/**
 * Read-only storage for jobs and the fee ledger (`PH2-E2-08`, docs/API.md §7).
 * The real implementation is Postgres on Neon over `jobs` and `fee_ledger`;
 * tests run the in-memory one.
 *
 * Every method takes the caller's `userId` and returns only that user's rows.
 * The route layer passes the session's user, never a value from the request.
 *
 * **Nothing here writes.** `POST /jobs` (the "Extend now" queue) is not built:
 * its design is still to be agreed with Fatih (2026-11-24). Jobs are created
 * and moved only by the hosted engine.
 */

export type JobStatus =
  'queued' | 'preflight-failed' | 'cancelled' | 'pulled' | 'extended' | 'refunded' | 'failed';

export type LedgerKind =
  'pull' | 'rent' | 'network-fee' | 'evergreen-fee' | 'refund' | 'difference';

/** Stroops are decimal strings, never numbers (§2). Times are ISO 8601 UTC. */
export interface JobSteps {
  readonly preflight?: {
    readonly at: string;
    readonly ok: boolean;
    readonly reason?: string;
    readonly rentStroops?: string;
  };
  readonly pull?: { readonly at: string; readonly txHash: string; readonly amountStroops?: string };
  /** The engine's own `BumpRecord[]`, passed through untouched. Absent until it writes them. */
  readonly extend?: readonly unknown[];
  /**
   * The extend transaction as the engine stored it. `rentChargedStroops` is
   * null when the extend did not confirm; `status` says whether the job
   * succeeded. Additive to §7: the engine records this before `extend` exists.
   */
  readonly extendTx?: { readonly txHash: string; readonly rentChargedStroops: string | null };
  readonly reconcile?: {
    readonly at: string;
    readonly rentPulledStroops: string;
    readonly rentChargedStroops: string;
    readonly differenceStroops: string;
  };
  /** `at` is the refund's fee-ledger row time; absent when that row is not there yet. */
  readonly refund?: {
    readonly at?: string;
    readonly txHash: string;
    readonly amountStroops?: string;
  };
}

/** The §7 `Job`, plus `payerWallet` and `updatedAt` (additive). */
export interface Job {
  readonly id: string;
  readonly network: 'testnet';
  readonly contractId: string;
  readonly kind: 'extend-now' | 'autopilot';
  readonly payerWallet: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: JobStatus;
  readonly steps: JobSteps;
}

/** The §7 `LedgerRow`. */
export interface LedgerRow {
  readonly id: string;
  readonly jobId: string;
  readonly network: 'testnet';
  readonly wallet: string;
  readonly contractId: string;
  readonly kind: LedgerKind;
  readonly amountStroops: string;
  readonly txHash: string | null;
  readonly ledger: number | null;
  readonly recordedAt: string;
}

/**
 * Where a page starts: strictly older than this row. `t` is the row's time in
 * whole microseconds since the epoch, as a decimal string (Postgres keeps
 * microseconds; a JS millisecond would skip or repeat rows that share one).
 */
export interface PageKey {
  readonly t: string;
  readonly id: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  /** The last item's key when more rows may follow, else null. */
  readonly next: PageKey | null;
}

export interface JobQuery {
  readonly contractId?: string;
  readonly limit: number;
  readonly after?: PageKey;
}

export interface LedgerQuery {
  readonly wallet?: string;
  readonly contractId?: string;
  readonly jobId?: string;
  readonly limit: number;
  readonly after?: PageKey;
}

export interface JobsStore {
  /** The caller's jobs, newest first (`created_at DESC, id DESC`). */
  listJobs(userId: string, query: JobQuery): Promise<Page<Job>>;
  /** One of the caller's jobs; undefined for another user's job or no job. */
  getJob(userId: string, jobId: string): Promise<Job | undefined>;
  /**
   * Fee-ledger rows of the caller's own jobs, newest first
   * (`recorded_at DESC, id DESC`). Ownership is the job's `user_id`, not the
   * wallet's current owner: a wallet can be re-linked to another account
   * (`wallets` is keyed on (network, account)), and its old rows must not
   * follow it there.
   */
  listLedger(userId: string, query: LedgerQuery): Promise<Page<LedgerRow>>;
}
