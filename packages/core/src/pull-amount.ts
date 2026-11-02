/**
 * The amount one hosted job pulls (PH2-E4-02): the one `transfer_from` of
 * simulated rent + hosted fee + retry margin (ADR-007 K2, Fatih on #385). One
 * home, so the engine's preflight and the dashboard's allowance-cap estimate
 * (PH2-E3-05) cannot disagree on the sum.
 *
 * Decided by Rakha (2026-11-02):
 * - **The fee is locked at pull.** It is `hostedFeeStroops` of the *simulated*
 *   rent and is not recomputed at reconcile. The difference between charged and
 *   simulated is recorded at reconcile as a `fee_ledger` row (append-only).
 * - **The retry margin is absolute stroops**, a named parameter, never a literal
 *   here. Its size is UNDETERMINED until the testnet measurement of simulated vs
 *   charged rent, so callers pass the configured value or `undefined`.
 *
 * Integer stroops only, bigint addition. The only rounding is the fee's own
 * ceiling inside `hostedFeeStroops`.
 *
 * Not wired into the engine run: that is Stage 2 (PH2-E4-04).
 */
import { PROVISIONAL_HOSTED_FEE, hostedFeeStroops, type HostedFeeConfig } from './fee.js';

export interface PullAmountInput {
  /** Rent from the extend simulation (preflight), stroops. Never the charged rent. */
  readonly simulatedRentStroops: bigint;
  /**
   * The retry-only margin, absolute stroops. `undefined` = not configured (its
   * size is undetermined); there is no default.
   */
  readonly retryMarginStroops: bigint | undefined;
}

export interface PullAmountBreakdown {
  /** = `simulatedRentStroops`. */
  readonly rentStroops: bigint;
  /** = `hostedFeeStroops(simulatedRentStroops, config)`, locked at pull. */
  readonly feeStroops: bigint;
  /** = `retryMarginStroops`. */
  readonly marginStroops: bigint;
  /** rent + fee + margin: `jobs.pull_amount`, the one `transfer_from`. */
  readonly totalStroops: bigint;
}

/**
 * The pull for one job, with its parts.
 *
 * Returns `undefined` when `retryMarginStroops` is `undefined`: the sum is then
 * undetermined, and the caller passes `pullAmountStroops(...)?.totalStroops` to
 * the engine's `checkBudget(item, estimate)`, which answers `'undetermined'` for
 * `undefined`, so nothing is pulled.
 *
 * Throws `RangeError` on a negative rent (from `hostedFeeStroops`), a negative
 * margin, or a negative fee configuration.
 */
export function pullAmountStroops(
  input: PullAmountInput,
  config: HostedFeeConfig = PROVISIONAL_HOSTED_FEE,
): PullAmountBreakdown | undefined {
  const { simulatedRentStroops: rent, retryMarginStroops: margin } = input;
  if (margin !== undefined && margin < 0n) throw new RangeError('margin cannot be negative');
  const fee = hostedFeeStroops(rent, config);
  if (margin === undefined) return undefined;
  return {
    rentStroops: rent,
    feeStroops: fee,
    marginStroops: margin,
    totalStroops: rent + fee + margin,
  };
}
