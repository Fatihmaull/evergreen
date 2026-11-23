/**
 * The hosted money path (PH2-E4-02): preflight, one pull, extend, reconcile, refund.
 *
 * `mode: 'dry-run'` is the default the scheduler ships. It may read (simulate,
 * allowance, balance) and it never calls `pull`, `extend` or `refund`.
 * `mode: 'live'` submits. The chain port must treat `jobId` as the idempotency
 * key: a second `pull` or `refund` for the same id sends nothing new.
 *
 * No secret, no payer, and no treasury address are logged or stored here.
 * `eg_scheduler` writes jobs and the fee ledger; it does not read `users.email`
 * and it does not write `alert_outbox` (0011). Notices are kinds only. Sending
 * them is a later `eg_api` step.
 */
import {
  HOSTED_EXTEND_TRANSIENT_RETRIES,
  hostedFeeStroops,
  ledgerUnexplained,
  preflightHostedJob,
  pullAmountStroops,
  settleHostedJob,
  type BudgetAnswer,
  type HostedKind,
  type LedgerKind,
  type PreflightReason,
  type SettleLedgerRow,
} from '@evergreen-stellar/core';

export interface ConfirmedMove {
  readonly hash: string;
  readonly feeDeclaredStroops: bigint;
  readonly feeChargedStroops: bigint;
}

export interface ExtendMove extends ConfirmedMove {
  readonly succeeded: boolean;
  /** True only when another attempt is allowed. A false failure is final. */
  readonly transient: boolean;
  readonly chargedRentStroops: bigint;
}

/**
 * Chain effects. `simulateRent` returns undefined when simulation fails.
 * `pull`, `extend` and `refund` are idempotent on `jobId`. SEP-41 has no such key, so an
 * implementation records `jobs.<step>_submitted_hash` and `_submitted_expires_at` (0006)
 * **before** sending, and on a later call first asks the chain about that hash: SUCCESS is
 * returned as the confirmed move, NOT_FOUND after the expiry may be rebuilt, NOT_FOUND before
 * it throws. A throw means the outcome is uncertain: the caller must not send a replacement.
 */
export interface HostedChain {
  simulateRent(): Promise<bigint | undefined>;
  allowanceRemaining(): Promise<bigint>;
  balance(): Promise<bigint>;
  pull(amountStroops: bigint, jobId: string): Promise<ConfirmedMove>;
  extend(attempt: number, jobId: string): Promise<ExtendMove>;
  refund(amountStroops: bigint, jobId: string): Promise<ConfirmedMove>;
}

export type HostedJobStatus =
  'queued' | 'preflight-failed' | 'pulled' | 'extended' | 'refunded' | 'failed';

export interface HostedJobSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly network: string;
  readonly contractId: string;
  readonly kind: HostedKind;
  readonly payerAccount: string;
  readonly status: HostedJobStatus;
  readonly pullTxHash: string | null;
  readonly pullAmountStroops: bigint | null;
  readonly extendTxHash: string | null;
  /**
   * Charged rent of the confirmed extend (`jobs.extend_rent_charged`). Set together with
   * `extendTxHash`: non-null means the extend succeeded, null with a hash means it finally
   * failed. Persisted before any refund, so a resumed job settles from it and never extends
   * again (review of #630, P1).
   */
  readonly extendRentChargedStroops: bigint | null;
  readonly refundTxHash: string | null;
  readonly shortfallStroops: bigint | null;
}

export interface LedgerWrite {
  readonly jobId: string;
  readonly network: 'testnet';
  readonly wallet: string;
  readonly contractId: string;
  readonly kind: LedgerKind;
  readonly amountStroops: bigint;
  readonly txHash: string | null;
}

export interface HostedJobPorts {
  readonly mode: 'dry-run' | 'live';
  /** Undefined until the retry margin is measured. Live then refuses to pull. */
  readonly retryMarginStroops: bigint | undefined;
  readonly chain: HostedChain;
  readonly budget: (estimateStroops: bigint | undefined) => BudgetAnswer;
  readonly extendNowUsedToday: () => Promise<number>;
  readonly load: () => Promise<HostedJobSnapshot>;
  /**
   * Writes the snapshot and the ledger rows **in one transaction**. A crash can never leave a
   * `pulled` job without its `pull` row, or half a settle (review of #630, P2.2 and P2.3).
   * Never called in dry-run.
   */
  readonly save: (next: HostedJobSnapshot, rows: readonly LedgerWrite[]) => Promise<void>;
}

export type HostedStopCode = 'PULL_FAILED' | 'EXTEND_UNCERTAIN' | 'REFUND_FAILED' | 'INTERNAL';

export interface HostedJobOutcome {
  readonly jobId: string;
  readonly mode: 'dry-run' | 'live';
  readonly status: HostedJobStatus | 'dry-run';
  /** A pull confirmed during this call. */
  readonly submitted: boolean;
  readonly refunded: boolean;
  readonly shortfallStroops: bigint;
  readonly preflightReason?: PreflightReason;
  readonly code?: HostedStopCode;
  readonly userNotice: 'preflight_failed' | 'extend_failed_refund' | null;
  readonly operatorAlert: 'shortfall-p1' | null;
}

export interface HostedJobCounts {
  readonly dryRun: boolean;
  readonly jobs: number;
  readonly submitted: number;
  readonly refunded: number;
  readonly shortfall: number;
  readonly preflightFailed: number;
  readonly failed: number;
}

/** Counts only. No job id, payer, user or contract. */
export function hostedJobCounts(outcomes: readonly HostedJobOutcome[]): HostedJobCounts {
  let submitted = 0;
  let refunded = 0;
  let shortfall = 0;
  let preflightFailed = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    if (outcome.submitted) submitted += 1;
    if (outcome.refunded) refunded += 1;
    if (outcome.shortfallStroops > 0n) shortfall += 1;
    if (outcome.status === 'preflight-failed') preflightFailed += 1;
    if (outcome.code !== undefined || outcome.status === 'failed') failed += 1;
  }
  return {
    dryRun: outcomes.every((outcome) => outcome.mode === 'dry-run'),
    jobs: outcomes.length,
    submitted,
    refunded,
    shortfall,
    preflightFailed,
    failed,
  };
}

function stopped(
  job: HostedJobSnapshot,
  mode: 'dry-run' | 'live',
  code: HostedStopCode,
  status: HostedJobStatus,
): HostedJobOutcome {
  return {
    jobId: job.id,
    mode,
    status,
    submitted: false,
    refunded: false,
    shortfallStroops: 0n,
    code,
    userNotice: null,
    operatorAlert: null,
  };
}

function ledgerWrite(
  job: HostedJobSnapshot,
  row: Pick<SettleLedgerRow, 'kind' | 'amountStroops' | 'txHash'>,
): LedgerWrite {
  return {
    jobId: job.id,
    network: 'testnet',
    wallet: job.payerAccount,
    contractId: job.contractId,
    kind: row.kind,
    amountStroops: row.amountStroops,
    txHash: row.txHash,
  };
}

/** `network-fee` evidence for one confirmed transaction, or nothing for a zero fee. */
function evidence(job: HostedJobSnapshot, move: ConfirmedMove): LedgerWrite[] {
  if (move.feeChargedStroops <= 0n) return [];
  return [
    ledgerWrite(job, {
      kind: 'network-fee',
      amountStroops: move.feeChargedStroops,
      txHash: move.hash,
    }),
  ];
}

function finished(
  job: HostedJobSnapshot,
  mode: 'dry-run' | 'live',
  submitted: boolean,
): HostedJobOutcome {
  return {
    jobId: job.id,
    mode,
    status: job.status,
    submitted,
    refunded: job.refundTxHash !== null,
    shortfallStroops: job.shortfallStroops ?? 0n,
    userNotice: null,
    operatorAlert:
      job.shortfallStroops !== null && job.shortfallStroops > 0n ? 'shortfall-p1' : null,
  };
}

/**
 * Reconcile a job whose extend outcome is persisted (`extendTxHash` set). Refunds the excess,
 * then writes the settle rows and the final status in one save. Network fees were already
 * written as each transaction confirmed, so only the refund's own evidence is added here.
 */
async function settle(
  ports: HostedJobPorts,
  job: HostedJobSnapshot,
  submitted: boolean,
): Promise<HostedJobOutcome> {
  const pull = job.pullAmountStroops;
  if (pull === null || job.pullTxHash === null || job.extendTxHash === null) {
    return { ...stopped(job, 'live', 'INTERNAL', job.status), submitted };
  }
  const succeeded = job.extendRentChargedStroops !== null;
  const charged = job.extendRentChargedStroops ?? 0n;
  const excess = succeeded ? pull - (charged + hostedFeeStroops(charged)) : pull;
  let refundTx: string | null = job.refundTxHash;
  const rows: LedgerWrite[] = [];
  if (excess > 0n && refundTx === null) {
    let refunded: ConfirmedMove;
    try {
      refunded = await ports.chain.refund(excess, job.id);
    } catch {
      // The extend outcome is already persisted, so the next tick resumes here and only
      // retries the refund. It never extends again.
      return { ...stopped(job, 'live', 'REFUND_FAILED', 'pulled'), submitted };
    }
    refundTx = refunded.hash;
    rows.push(...evidence(job, refunded));
  }
  const settled = settleHostedJob({
    pullStroops: pull,
    extendSucceeded: succeeded,
    chargedRentStroops: charged,
    networkFees: [],
    refundTxHash: refundTx,
  });
  if (ledgerUnexplained(pull, settled.rows) !== -settled.shortfallStroops) {
    throw new Error('LEDGER_IDENTITY');
  }
  rows.push(...settled.rows.map((row) => ledgerWrite(job, row)));
  const next: HostedJobSnapshot = {
    ...job,
    status: settled.status,
    refundTxHash: refundTx,
    shortfallStroops: settled.shortfallStroops,
  };
  await ports.save(next, rows);
  return {
    jobId: job.id,
    mode: 'live',
    status: settled.status,
    submitted,
    refunded: settled.refundStroops > 0n,
    shortfallStroops: settled.shortfallStroops,
    userNotice: settled.userNotice,
    operatorAlert: settled.operatorAlert,
  };
}

/**
 * Run one job. A finished job (`extended`, `refunded`, `preflight-failed`) is returned as
 * stored and nothing is submitted. A job that already has a pull hash is not pulled again, and
 * a job that already has an extend outcome is not extended again.
 *
 * Dry-run reads (simulate, allowance, balance) and writes nothing, not even a failed preflight.
 */
export async function runHostedJob(ports: HostedJobPorts): Promise<HostedJobOutcome> {
  let job = await ports.load();
  if (job.status === 'extended' || job.status === 'refunded' || job.status === 'preflight-failed') {
    return finished(job, ports.mode, false);
  }
  if (job.network !== 'testnet') {
    if (ports.mode === 'live' && job.pullTxHash === null) {
      await ports.save({ ...job, status: 'preflight-failed' }, []);
    }
    return {
      jobId: job.id,
      mode: ports.mode,
      status: 'preflight-failed',
      submitted: false,
      refunded: false,
      shortfallStroops: 0n,
      preflightReason: 'not-testnet',
      userNotice: 'preflight_failed',
      operatorAlert: null,
    };
  }

  let submitted = false;
  if (job.pullTxHash === null) {
    const simulated = await ports.chain.simulateRent();
    const allowance = await ports.chain.allowanceRemaining();
    const balance = await ports.chain.balance();
    const used = job.kind === 'extend-now' ? await ports.extendNowUsedToday() : 0;
    const estimate = pullAmountStroops({
      simulatedRentStroops: simulated ?? 0n,
      retryMarginStroops: ports.retryMarginStroops,
    })?.totalStroops;
    const pre = preflightHostedJob({
      network: job.network,
      kind: job.kind,
      simulatedRentStroops: simulated,
      retryMarginStroops: ports.retryMarginStroops,
      allowanceRemainingStroops: allowance,
      balanceStroops: balance,
      budget: ports.budget(simulated === undefined ? undefined : estimate),
      extendNowUsedToday: used,
    });
    if (!pre.ok) {
      if (ports.mode === 'live') await ports.save({ ...job, status: 'preflight-failed' }, []);
      return {
        jobId: job.id,
        mode: ports.mode,
        status: 'preflight-failed',
        submitted: false,
        refunded: false,
        shortfallStroops: 0n,
        preflightReason: pre.reason,
        userNotice: 'preflight_failed',
        operatorAlert: null,
      };
    }
    if (ports.mode === 'dry-run') {
      return {
        jobId: job.id,
        mode: 'dry-run',
        status: 'dry-run',
        submitted: false,
        refunded: false,
        shortfallStroops: 0n,
        userNotice: null,
        operatorAlert: null,
      };
    }
    let pulled: ConfirmedMove;
    try {
      pulled = await ports.chain.pull(pre.pull.totalStroops, job.id);
    } catch {
      return stopped(job, 'live', 'PULL_FAILED', 'queued');
    }
    job = {
      ...job,
      status: 'pulled',
      pullTxHash: pulled.hash,
      pullAmountStroops: pre.pull.totalStroops,
    };
    // The pull row, its evidence and the `pulled` status land together.
    await ports.save(job, [
      ledgerWrite(job, { kind: 'pull', amountStroops: pre.pull.totalStroops, txHash: pulled.hash }),
      ...evidence(job, pulled),
    ]);
    submitted = true;
  }
  if (ports.mode !== 'live') return finished(job, ports.mode, false);

  if (job.extendTxHash === null) {
    let extend: ExtendMove | undefined;
    const rows: LedgerWrite[] = [];
    const maxAttempts = 1 + HOSTED_EXTEND_TRANSIENT_RETRIES;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        extend = await ports.chain.extend(attempt, job.id);
      } catch {
        if (rows.length > 0) await ports.save(job, rows);
        return { ...stopped(job, 'live', 'EXTEND_UNCERTAIN', 'pulled'), submitted };
      }
      rows.push(...evidence(job, extend));
      if (extend.succeeded || !extend.transient) break;
    }
    if (extend === undefined) return { ...stopped(job, 'live', 'INTERNAL', 'pulled'), submitted };
    // A failure left after the transient retries is final: the pull is refunded in full.
    if (extend.chargedRentStroops < 0n) throw new RangeError('charged rent cannot be negative');
    // Persist the extend outcome before any refund (review of #630, P1).
    job = {
      ...job,
      extendTxHash: extend.hash,
      extendRentChargedStroops: extend.succeeded ? extend.chargedRentStroops : null,
    };
    await ports.save(job, rows);
  }
  return settle(ports, job, submitted);
}

/**
 * One job after another. A thrown job becomes `failed` with code `INTERNAL` and the next job
 * still runs. The returned counts carry no account.
 */
export async function runHostedJobs(
  runs: readonly (() => Promise<HostedJobOutcome>)[],
): Promise<HostedJobCounts> {
  const outcomes: HostedJobOutcome[] = [];
  for (const run of runs) {
    try {
      outcomes.push(await run());
    } catch {
      outcomes.push({
        jobId: 'failed',
        mode: 'live',
        status: 'failed',
        submitted: false,
        refunded: false,
        shortfallStroops: 0n,
        code: 'INTERNAL',
        userNotice: null,
        operatorAlert: null,
      });
    }
  }
  return hostedJobCounts(outcomes);
}
