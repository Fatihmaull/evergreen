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
 * `pull` and `refund` are idempotent on `jobId`. A throw means the outcome is
 * uncertain: the caller must not send a replacement.
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
  readonly save: (next: HostedJobSnapshot) => Promise<void>;
  readonly insertLedger: (row: LedgerWrite) => Promise<void>;
}

export type HostedStopCode = 'PULL_FAILED' | 'EXTEND_UNCERTAIN' | 'REFUND_FAILED';

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

async function writeRows(
  ports: HostedJobPorts,
  job: HostedJobSnapshot,
  rows: readonly SettleLedgerRow[],
): Promise<void> {
  for (const row of rows) {
    await ports.insertLedger({
      jobId: job.id,
      network: 'testnet',
      wallet: job.payerAccount,
      contractId: job.contractId,
      kind: row.kind,
      amountStroops: row.amountStroops,
      txHash: row.txHash,
    });
  }
}

async function finishExtend(
  ports: HostedJobPorts,
  job: HostedJobSnapshot,
  extend: ExtendMove | undefined,
  networkFees: { txHash: string; feeChargedStroops: bigint }[],
): Promise<HostedJobOutcome> {
  const pull = job.pullAmountStroops;
  if (pull === null || job.pullTxHash === null)
    return stopped(job, 'live', 'PULL_FAILED', job.status);
  const succeeded = extend?.succeeded === true;
  const charged = succeeded && extend !== undefined ? extend.chargedRentStroops : 0n;
  const excess = succeeded ? pull - (charged + hostedFeeStroops(charged)) : pull;
  let refundTx: string | null = job.refundTxHash;
  if (excess > 0n && refundTx === null) {
    try {
      const refunded = await ports.chain.refund(excess, job.id);
      refundTx = refunded.hash;
      networkFees.push({ txHash: refunded.hash, feeChargedStroops: refunded.feeChargedStroops });
    } catch {
      return stopped(job, 'live', 'REFUND_FAILED', 'pulled');
    }
  }
  const settled = settleHostedJob({
    pullStroops: pull,
    extendSucceeded: succeeded,
    chargedRentStroops: charged,
    networkFees,
    refundTxHash: refundTx,
  });
  if (ledgerUnexplained(pull, settled.rows) !== -settled.shortfallStroops) {
    throw new Error('LEDGER_IDENTITY');
  }
  await writeRows(ports, job, settled.rows);
  const next: HostedJobSnapshot = {
    ...job,
    status: settled.status,
    extendTxHash: extend?.hash ?? job.extendTxHash,
    refundTxHash: refundTx,
    shortfallStroops: settled.shortfallStroops,
  };
  await ports.save(next);
  return {
    jobId: job.id,
    mode: 'live',
    status: settled.status,
    submitted: false,
    refunded: settled.refundStroops > 0n,
    shortfallStroops: settled.shortfallStroops,
    userNotice: settled.userNotice,
    operatorAlert: settled.operatorAlert,
  };
}

/**
 * Run one job. A finished job (`extended`, `refunded`, `preflight-failed`) is
 * returned as stored and nothing is submitted. A job that already has a pull
 * hash is not pulled again.
 */
export async function runHostedJob(ports: HostedJobPorts): Promise<HostedJobOutcome> {
  let job = await ports.load();
  if (job.network !== 'testnet') {
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
  if (job.status === 'extended' || job.status === 'refunded' || job.status === 'preflight-failed') {
    return {
      jobId: job.id,
      mode: ports.mode,
      status: job.status,
      submitted: false,
      refunded: job.status === 'refunded',
      shortfallStroops: job.shortfallStroops ?? 0n,
      userNotice: null,
      operatorAlert:
        job.shortfallStroops !== null && job.shortfallStroops > 0n ? 'shortfall-p1' : null,
    };
  }

  const fees: { txHash: string; feeChargedStroops: bigint }[] = [];
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
      const failed: HostedJobSnapshot = { ...job, status: 'preflight-failed' };
      await ports.save(failed);
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
    await ports.save(job);
    await ports.insertLedger({
      jobId: job.id,
      network: 'testnet',
      wallet: job.payerAccount,
      contractId: job.contractId,
      kind: 'pull',
      amountStroops: pre.pull.totalStroops,
      txHash: pulled.hash,
    });
    fees.push({ txHash: pulled.hash, feeChargedStroops: pulled.feeChargedStroops });
    return continueExtend(ports, job, fees, true);
  }
  return continueExtend(ports, job, fees, false);
}

async function continueExtend(
  ports: HostedJobPorts,
  job: HostedJobSnapshot,
  fees: { txHash: string; feeChargedStroops: bigint }[],
  submitted: boolean,
): Promise<HostedJobOutcome> {
  if (ports.mode !== 'live') {
    return {
      jobId: job.id,
      mode: ports.mode,
      status: job.status,
      submitted: false,
      refunded: false,
      shortfallStroops: 0n,
      userNotice: null,
      operatorAlert: null,
    };
  }
  if (job.extendTxHash !== null) {
    return {
      jobId: job.id,
      mode: 'live',
      status: job.status,
      submitted: false,
      refunded: job.refundTxHash !== null,
      shortfallStroops: job.shortfallStroops ?? 0n,
      userNotice: null,
      operatorAlert:
        job.shortfallStroops !== null && job.shortfallStroops > 0n ? 'shortfall-p1' : null,
    };
  }
  let extend: ExtendMove | undefined;
  const maxAttempts = 1 + HOSTED_EXTEND_TRANSIENT_RETRIES;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      extend = await ports.chain.extend(attempt, job.id);
    } catch {
      return { ...stopped(job, 'live', 'EXTEND_UNCERTAIN', 'pulled'), submitted };
    }
    fees.push({ txHash: extend.hash, feeChargedStroops: extend.feeChargedStroops });
    if (extend.succeeded || !extend.transient) break;
  }
  const settled = await finishExtend(ports, job, extend, fees);
  return { ...settled, submitted };
}

/**
 * One job after another. A thrown job becomes `failed` and the next job still
 * runs. The returned counts carry no account.
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
        code: 'PULL_FAILED',
        userNotice: null,
        operatorAlert: null,
      });
    }
  }
  return hostedJobCounts(outcomes);
}
