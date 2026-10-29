import { MIN_ACTION_RUNS_IN_WINDOW } from './config.js';

/**
 * The 4 x worst-gap rule, in ledgers (DoD-2, phase-2/PHASE2-PLAN.md:49): the
 * scheduler must get MIN_ACTION_RUNS_IN_WINDOW runs inside any window it is
 * trusted to act in. One place for the multiplier, so callers (apps/api's
 * failure-mode detectors, the scheduler) do not write `4n * gap` by hand.
 *
 * Bigint because ledger sequences come from Postgres BIGINT columns.
 */

const RUNS = BigInt(MIN_ACTION_RUNS_IN_WINDOW);

/** MIN_ACTION_RUNS_IN_WINDOW x the worst gap. Throws on a negative gap: a ledger going down is a reset, not a gap. */
export function gapMarginLedgers(worstGapLedgers: bigint): bigint {
  if (worstGapLedgers < 0n) {
    throw new RangeError('worst gap is negative: a decreasing ledger is a reset, not a gap');
  }
  return RUNS * worstGapLedgers;
}

/**
 * DoD-2's check: the margin is strictly below the lowest act threshold in use.
 * `undefined` when either input is unknown: absence is not health.
 */
export function gapMarginHolds(
  worstGapLedgers: bigint | undefined,
  lowestActLedgers: bigint | undefined,
): boolean | undefined {
  if (worstGapLedgers === undefined || lowestActLedgers === undefined) return undefined;
  return gapMarginLedgers(worstGapLedgers) < lowestActLedgers;
}

/**
 * F11 at-risk rule (Fatih, 2026-10-29, option 1): ledgers left strictly below
 * the margin. `undefined` when either input is unknown.
 */
export function belowGapMargin(
  ledgersLeft: bigint | undefined,
  worstGapLedgers: bigint | undefined,
): boolean | undefined {
  if (ledgersLeft === undefined || worstGapLedgers === undefined) return undefined;
  return ledgersLeft < gapMarginLedgers(worstGapLedgers);
}
