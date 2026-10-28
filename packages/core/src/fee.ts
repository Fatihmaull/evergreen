/**
 * The hosted-tier fee (PH2-E5-03). One home, so the engine that pulls it, the
 * reconcile step that recomputes it and the allowance-cap estimate that shows it
 * (PH2-E3-05) cannot disagree.
 *
 * `fee = max(2% × rent, 25,000 stroops)` per hosted action, where a hosted
 * action is one job (one pull), not one entry. Fatih set it on 2026-10-27 on #414.
 *
 * **PROVISIONAL.** Used now for the cap estimate and, once
 * `web-reference/design-language/claims-and-copy.md` allows it, the hosted-tier
 * copy. It is re-measured with real transactions in PH2-E5-02, after the router
 * audit, and PH2-E5-03 stays open until Fatih confirms the value is final. Change
 * it here and nowhere else.
 *
 * The minimum is what keeps DoD-2's zero subsidy: a hosted action costs about
 * 18,400 stroops in network fees (about 24,500 with one failed retry) simulated on
 * mainnet, so a pure percentage would charge less than that on a small job.
 *
 * Integer stroops only. The percentage is basis points over bigint, never a float.
 */
export interface HostedFeeConfig {
  /** Percentage of rent, in basis points: 200 is 2%. */
  readonly basisPoints: bigint;
  /** Floor per hosted action, in stroops. */
  readonly minimumStroops: bigint;
}

export const PROVISIONAL_HOSTED_FEE: HostedFeeConfig = {
  basisPoints: 200n,
  minimumStroops: 25_000n,
};

const BASIS_POINTS_PER_UNIT = 10_000n;

/**
 * The fee for one hosted action, in stroops.
 *
 * Pass the rent the fee is being computed on: the **simulated** rent when the
 * pull is sized (charged is never above simulated, so the pulled fee is an upper
 * bound), the **charged** rent when reconcile settles it.
 *
 * **Rounds up.** The percentage part is a ceiling, so rounding never goes against
 * Evergreen. That is the engine's proposal (Rakha, #414), not yet confirmed by
 * Fatih; the difference is at most one stroop.
 *
 * Rent of zero gives the minimum. The caller decides whether a zero-rent job
 * should run at all (preflight should stop it before the pull).
 */
export function hostedFeeStroops(
  rentStroops: bigint,
  config: HostedFeeConfig = PROVISIONAL_HOSTED_FEE,
): bigint {
  if (rentStroops < 0n) throw new RangeError('rent cannot be negative');
  if (config.basisPoints < 0n || config.minimumStroops < 0n) {
    throw new RangeError('fee configuration cannot be negative');
  }
  const percentage =
    (rentStroops * config.basisPoints + BASIS_POINTS_PER_UNIT - 1n) / BASIS_POINTS_PER_UNIT;
  return percentage > config.minimumStroops ? percentage : config.minimumStroops;
}
