/**
 * The scheduler gap, measured in LEDGERS, and what it implies for the lowest
 * act threshold anyone may use (PH2-E4-04, docs/PH2-E4-04-SCHEDULER-DESIGN.md §4).
 *
 * Ledgers, not wall clock: the thresholds are ledgers, and a Worker's clock is
 * not the chain's. The inputs are the `observed_ledger` of each scheduler
 * heartbeat (`scheduler_ticks`), in the order the ticks happened.
 *
 * DoD-2 (Fatih, 2026-10-28): **4 × the worst observed gap, in ledgers, is below
 * the lowest act threshold in use.** The 4 is core's own rule that an action
 * window needs four scheduler runs of margin (`MIN_ACTION_RUNS_IN_WINDOW`), read
 * from there rather than repeated. It replaces "below 17,280 ledgers", which would
 * have passed a gap of 17,000.
 *
 * None of this is a TTL comparison; it compares a measured scheduler gap with an
 * action window. The names avoid "threshold" and "remaining" for the lint rule that
 * keeps real TTL policy comparisons in `ttl.ts`.
 */
import { MIN_ACTION_RUNS_IN_WINDOW } from './config.js';

const isLedger = (n: number): boolean => Number.isSafeInteger(n) && n > 0;

/**
 * The gaps between consecutive ticks, in ledgers. Needs at least two ticks: with
 * fewer, nothing has been measured, and the answer is an empty list, not zero.
 *
 * Two ticks in the same ledger give a gap of 0 (a manual dispatch right after a
 * cron tick). A ledger that goes **down** throws: that is a testnet reset or ticks
 * read out of order, and either makes every later number meaningless. DoD-2 says a
 * reset restarts its 30 days, so the caller must start a new window, not average
 * across it.
 */
export function tickGapsLedgers(observedLedgers: readonly number[]): number[] {
  for (const ledger of observedLedgers) {
    if (!isLedger(ledger)) throw new RangeError(`not a ledger number: ${String(ledger)}`);
  }
  const gaps: number[] = [];
  for (let i = 1; i < observedLedgers.length; i++) {
    const gap = observedLedgers[i]! - observedLedgers[i - 1]!;
    if (gap < 0) {
      throw new RangeError(
        `ticks are not in ledger order (tick ${i} is ledger ${observedLedgers[i]}, after ${observedLedgers[i - 1]}); a testnet reset starts a new window`,
      );
    }
    gaps.push(gap);
  }
  return gaps;
}

/** The worst (largest) gap, or `undefined` when there are no gaps: undetermined, never 0. */
export function worstGapLedgers(gaps: readonly number[]): number | undefined {
  if (gaps.length === 0) return undefined;
  for (const gap of gaps) {
    if (!Number.isSafeInteger(gap) || gap < 0) throw new RangeError(`not a gap: ${String(gap)}`);
  }
  return Math.max(...gaps);
}

/** What four scheduler runs of margin come to, in ledgers, for a given worst gap. */
export function marginLedgers(worstGap: number): number {
  if (!Number.isSafeInteger(worstGap) || worstGap < 0) {
    throw new RangeError(`not a gap: ${String(worstGap)}`);
  }
  return worstGap * MIN_ACTION_RUNS_IN_WINDOW;
}

/**
 * DoD-2's scheduler check: does 4 × the worst gap fall **strictly below** the lowest
 * act window anyone uses? `undefined` when no gap was measured. Returns the
 * numbers too, so a report can show them rather than a bare pass.
 */
export function schedulerGapCheck(
  worstGap: number | undefined,
  lowestActionWindowLedgers: number,
): { readonly passes: boolean; readonly marginLedgers: number } | undefined {
  if (worstGap === undefined) return undefined;
  if (!isLedger(lowestActionWindowLedgers)) {
    throw new RangeError(`not an action window: ${String(lowestActionWindowLedgers)}`);
  }
  const margin = marginLedgers(worstGap);
  return { passes: margin < lowestActionWindowLedgers, marginLedgers: margin };
}

/**
 * The smallest act window that passes the check for a given worst gap: the value to
 * publish as `THRESHOLD_FLOOR_LEDGERS` (the lowest `thresholdLedgers` the API accepts).
 * It is one above 4 × the gap because the check is strict, so a window exactly 4 × the
 * gap would be accepted by the API and then fail DoD-2. Core's own configuration
 * warning is not strict (it accepts exactly four runs); the one-ledger difference is
 * deliberate and follows the DoD's wording.
 */
export function lowestPassingActionWindowLedgers(worstGap: number): number {
  return marginLedgers(worstGap) + 1;
}
