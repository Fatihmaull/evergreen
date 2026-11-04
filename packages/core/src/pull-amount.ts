/**
 * The amount one hosted job pulls (PH2-E4-02): the one `transfer_from` of
 * simulated rent + hosted fee + retry margin (ADR-007 K2, Fatih on #385). One
 * home, so the engine's preflight and the dashboard's allowance-cap estimate
 * (PH2-E3-05) cannot disagree on the sum.
 *
 * Fee rule (K11, Fatih 2026-11-03; ADR-007: `max(2% × the rent actually
 * charged, 25,000 stroops)`):
 * - **The fee in the pull is an estimate**, `hostedFeeStroops` of the simulated
 *   rent. Reconcile computes the final fee, `hostedFeeStroops(charged rent)`.
 *   The excess of the pull over charged rent + final fee is refunded on-chain to
 *   the user and stored as a `refund` row; `difference` holds only what was not
 *   returned, normally 0 (#583).
 * - **Shortfall (K13):** if charged rent + final fee exceeds the pull, reconcile
 *   records the shortfall, raises a P1 operator alert and the job counts as a
 *   zero-subsidy violation; there is no second `transfer_from` (#583).
 * - **The retry margin is absolute stroops** (Rakha, 2026-11-02), a named parameter, never a literal
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
  /**
   * = `hostedFeeStroops(simulatedRentStroops, config)`: an estimate; the final
   * fee is `hostedFeeStroops(charged rent)` at reconcile.
   */
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
