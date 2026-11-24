/**
 * One hosted job (PH2-E4-02, ADR-007 §3.3): preflight and reconcile.
 *
 * No chain calls live here. The engine supplies the reads and the confirmed
 * transactions. Dry-run is the caller's default: this module only decides.
 *
 * Testnet only. No treasury address (that is PH2-E4-03). The retry margin has
 * no default; an unset margin does not pull.
 */
import { hostedFeeStroops, type HostedFeeConfig, PROVISIONAL_HOSTED_FEE } from './fee.js';
import { pullAmountStroops, type PullAmountBreakdown } from './pull-amount.js';

/**
 * Plan §3.3, per (user, contract) per rolling 24 hours. Only pulled jobs count.
 * 1 since Fatih, 2026-11-24 (Extend now option A); was 3.
 */
export const EXTEND_NOW_DAILY_LIMIT = 1;

/**
 * Transient extend attempts after the first. The fee note sizes the engine's
 * network cost "with one failed retry" (ADR-007). A non-transient failure stops
 * immediately.
 */
export const HOSTED_EXTEND_TRANSIENT_RETRIES = 1;

export type HostedKind = 'autopilot' | 'extend-now';
export type BudgetAnswer = 'ok' | 'over-per-job' | 'over-30d' | 'undetermined';
export type PreflightReason =
  | 'not-testnet'
  | 'simulation-failed'
  | 'margin-unset'
  | 'budget'
  | 'daily-limit'
  | 'allowance-short'
  | 'balance-short';

export interface PreflightHostedInput {
  readonly network: string;
  readonly kind: HostedKind;
  /** Undefined when the extend simulation failed. Never the charged rent. */
  readonly simulatedRentStroops: bigint | undefined;
  /** Undefined when the retry margin is not configured. There is no default. */
  readonly retryMarginStroops: bigint | undefined;
  readonly allowanceRemainingStroops: bigint;
  readonly balanceStroops: bigint;
  readonly budget: BudgetAnswer;
  /** Pulled extend-now jobs for this user and contract in the rolling 24 hours. */
  readonly extendNowUsedToday: number;
}

export type PreflightHosted =
  | { readonly ok: false; readonly reason: PreflightReason }
  | { readonly ok: true; readonly pull: PullAmountBreakdown };

/** Nothing is submitted. A failed check names a reason and does not return an amount. */
export function preflightHostedJob(
  input: PreflightHostedInput,
  fee: HostedFeeConfig = PROVISIONAL_HOSTED_FEE,
): PreflightHosted {
  if (input.network !== 'testnet') return { ok: false, reason: 'not-testnet' };
  if (input.simulatedRentStroops === undefined) return { ok: false, reason: 'simulation-failed' };
  const pull = pullAmountStroops(
    {
      simulatedRentStroops: input.simulatedRentStroops,
      retryMarginStroops: input.retryMarginStroops,
    },
    fee,
  );
  if (pull === undefined) return { ok: false, reason: 'margin-unset' };
  if (input.budget !== 'ok') return { ok: false, reason: 'budget' };
  if (input.kind === 'extend-now' && input.extendNowUsedToday >= EXTEND_NOW_DAILY_LIMIT) {
    return { ok: false, reason: 'daily-limit' };
  }
  const allowance = input.allowanceRemainingStroops;
  const balance = input.balanceStroops;
  if (allowance < pull.totalStroops) return { ok: false, reason: 'allowance-short' };
  if (balance < pull.totalStroops) return { ok: false, reason: 'balance-short' };
  return { ok: true, pull };
}

export type LedgerKind =
  'pull' | 'rent' | 'network-fee' | 'evergreen-fee' | 'refund' | 'difference';

export interface SettleLedgerRow {
  readonly kind: LedgerKind;
  readonly amountStroops: bigint;
  /**
   * Set for stored kinds (`pull`, `refund`, `network-fee`). Null for derived
   * kinds (`rent`, `evergreen-fee`, `difference`).
   */
  readonly txHash: string | null;
}

export interface NetworkFeeEvidence {
  readonly txHash: string;
  readonly feeChargedStroops: bigint;
}

export interface SettleHostedInput {
  readonly pullStroops: bigint;
  readonly extendSucceeded: boolean;
  /** Charged rent when the extend confirmed. Ignored when the extend failed. */
  readonly chargedRentStroops: bigint;
  /** One entry per confirmed transaction. Evidence only; never billed. */
  readonly networkFees: readonly NetworkFeeEvidence[];
  /** Confirmed refund hash. Required when a refund row is produced. */
  readonly refundTxHash: string | null;
}

export interface SettleHosted {
  readonly status: 'extended' | 'refunded';
  readonly finalFeeStroops: bigint;
  readonly refundStroops: bigint;
  /** K15: charged rent + final fee − pull, when that is positive. Otherwise 0. */
  readonly shortfallStroops: bigint;
  /** Always 0. A shortfall is not a `difference` row (`fee_ledger.amount` is never negative). */
  readonly differenceStroops: 0n;
  /** A shortfall does not turn autopilot off. */
  readonly disableAutopilot: false;
  readonly operatorAlert: 'shortfall-p1' | null;
  readonly userNotice: 'extend_failed_refund' | null;
  /** Rows to append. The pull row is written when the pull confirms, not here. */
  readonly rows: readonly SettleLedgerRow[];
}

function evidenceRows(fees: readonly NetworkFeeEvidence[]): SettleLedgerRow[] {
  const rows: SettleLedgerRow[] = [];
  for (const fee of fees) {
    if (fee.feeChargedStroops < 0n) throw new RangeError('network fee cannot be negative');
    if (fee.feeChargedStroops === 0n) continue;
    if (fee.txHash === '') throw new RangeError('network fee needs a transaction hash');
    rows.push({
      kind: 'network-fee',
      amountStroops: fee.feeChargedStroops,
      txHash: fee.txHash,
    });
  }
  return rows;
}

/**
 * Reconcile one pulled job.
 *
 * Extend finally failed: refund the whole pull, fee included. No evergreen-fee.
 * Extend succeeded: final fee is `hostedFeeStroops(charged rent)`. The excess
 * is refunded. A negative excess is a shortfall on `jobs.shortfall_stroops`,
 * not a second pull and not a ledger row.
 */
export function settleHostedJob(
  input: SettleHostedInput,
  fee: HostedFeeConfig = PROVISIONAL_HOSTED_FEE,
): SettleHosted {
  if (input.pullStroops < 0n) throw new RangeError('pull cannot be negative');
  if (input.chargedRentStroops < 0n) throw new RangeError('charged rent cannot be negative');
  const evidence = evidenceRows(input.networkFees);
  if (!input.extendSucceeded) {
    if (input.pullStroops > 0n && (input.refundTxHash === null || input.refundTxHash === '')) {
      throw new RangeError('a refund row needs its transaction hash');
    }
    const rows = [...evidence];
    if (input.pullStroops > 0n) {
      rows.push({ kind: 'refund', amountStroops: input.pullStroops, txHash: input.refundTxHash });
    }
    return {
      status: 'refunded',
      finalFeeStroops: 0n,
      refundStroops: input.pullStroops,
      shortfallStroops: 0n,
      differenceStroops: 0n,
      disableAutopilot: false,
      operatorAlert: null,
      userNotice: 'extend_failed_refund',
      rows,
    };
  }
  const finalFee = hostedFeeStroops(input.chargedRentStroops, fee);
  const excess = input.pullStroops - (input.chargedRentStroops + finalFee);
  const shortfall = excess < 0n ? -excess : 0n;
  const refund = excess > 0n ? excess : 0n;
  if (refund > 0n && (input.refundTxHash === null || input.refundTxHash === '')) {
    throw new RangeError('a refund row needs its transaction hash');
  }
  const rows = [...evidence];
  if (input.chargedRentStroops > 0n) {
    rows.push({ kind: 'rent', amountStroops: input.chargedRentStroops, txHash: null });
  }
  if (finalFee > 0n) {
    rows.push({ kind: 'evergreen-fee', amountStroops: finalFee, txHash: null });
  }
  if (refund > 0n) {
    rows.push({ kind: 'refund', amountStroops: refund, txHash: input.refundTxHash });
  }
  return {
    status: 'extended',
    finalFeeStroops: finalFee,
    refundStroops: refund,
    shortfallStroops: shortfall,
    differenceStroops: 0n,
    disableAutopilot: false,
    operatorAlert: shortfall > 0n ? 'shortfall-p1' : null,
    userNotice: null,
    rows,
  };
}

/**
 * `fee_ledger_job_balance.unexplained`: pull − (rent + evergreen-fee + refund + difference).
 * `network-fee` rows are ignored. A shortfall leaves this negative by `shortfallStroops`;
 * the DoD-2 count reads `jobs.shortfall_stroops > 0`, not this view.
 */
export function ledgerUnexplained(
  pullStroops: bigint,
  rows: readonly Pick<SettleLedgerRow, 'kind' | 'amountStroops'>[],
): bigint {
  let billed = 0n;
  for (const row of rows) {
    if (
      row.kind === 'rent' ||
      row.kind === 'evergreen-fee' ||
      row.kind === 'refund' ||
      row.kind === 'difference'
    ) {
      billed += row.amountStroops;
    }
  }
  return pullStroops - billed;
}
