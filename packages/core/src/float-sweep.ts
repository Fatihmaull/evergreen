/**
 * PH2-E4-03: refund headroom, the float cap, and the fee sweep.
 *
 * Headroom is the pulls still in flight. The cap is headroom plus a sweep
 * buffer. Fatih chose that shape (option 2, 2026-10-29). The buffer's size is
 * not decided: there is no default, and nothing is swept while it is unset.
 *
 * The sweep sends from the engine account to the treasury address. It does not
 * take a treasury key. The mainnet address does not exist yet (PH2-E5-02) and
 * is not invented here. Dry-run is the default the caller should pass.
 */
export const TESTNET_TREASURY_ADDRESS = 'GD7LISFDUOWIVEW3FX452FIGARVRACPTHXVJ42XOBHMJMOQAPIRRMMRZ';

export interface FloatAssessmentInput {
  /** Engine account balance in stroops. Undefined when the read failed. */
  readonly balanceStroops: bigint | undefined;
  /** Sum of pulls in flight (status `pulled`): what a refund may still need. */
  readonly inFlightPullsStroops: bigint;
  /** Undefined until the owner sets it. No default. */
  readonly sweepBufferStroops: bigint | undefined;
}

export interface FloatAssessment {
  /** Balance below the headroom. Undefined when the balance is unknown. */
  readonly belowHeadroom: boolean | undefined;
  /** Balance above cap = headroom + buffer. Undefined while the buffer or balance is unknown. */
  readonly aboveCap: boolean | undefined;
}

/**
 * Same rule as the F8 detector. Unknown inputs stay undefined, never "healthy".
 */
export function assessFloat(input: FloatAssessmentInput): FloatAssessment {
  if (input.inFlightPullsStroops < 0n) throw new RangeError('in-flight pulls cannot be negative');
  if (input.sweepBufferStroops !== undefined && input.sweepBufferStroops < 0n) {
    throw new RangeError('sweep buffer cannot be negative');
  }
  if (input.balanceStroops === undefined) return { belowHeadroom: undefined, aboveCap: undefined };
  if (input.balanceStroops < 0n) throw new RangeError('balance cannot be negative');
  const belowHeadroom = input.balanceStroops < input.inFlightPullsStroops;
  const aboveCap =
    input.sweepBufferStroops === undefined
      ? undefined
      : input.balanceStroops > input.inFlightPullsStroops + input.sweepBufferStroops;
  return { belowHeadroom, aboveCap };
}

export type SweepReason =
  | 'balance-unknown'
  | 'buffer-unset'
  | 'mainnet-treasury-unset'
  | 'below-headroom'
  | 'at-cap'
  | 'above-cap';

export interface SweepPlan {
  readonly mode: 'dry-run' | 'live';
  readonly network: 'testnet' | 'mainnet';
  readonly belowHeadroom: boolean | undefined;
  readonly aboveCap: boolean | undefined;
  /** Stroops that would leave the engine. Zero unless the cap is known and exceeded. */
  readonly amountStroops: bigint;
  /** What stays for refunds: the in-flight pulls. Not swept. */
  readonly keptForRefundsStroops: bigint;
  /**
   * Set only when a testnet sweep has an amount. Never a mainnet address.
   * Never a key.
   */
  readonly destination: typeof TESTNET_TREASURY_ADDRESS | undefined;
  /** True only for a live testnet sweep with an amount. Dry-run never submits. */
  readonly submit: boolean;
  readonly reason: SweepReason;
}

export interface SweepInput extends FloatAssessmentInput {
  readonly network: 'testnet' | 'mainnet';
  readonly mode: 'dry-run' | 'live';
}

/** The decision only. Nothing is sent. */
export function planSweep(input: SweepInput): SweepPlan {
  const assessed = assessFloat(input);
  const kept = input.inFlightPullsStroops;
  const base = {
    mode: input.mode,
    network: input.network,
    belowHeadroom: assessed.belowHeadroom,
    aboveCap: assessed.aboveCap,
    keptForRefundsStroops: kept,
    destination: undefined,
    submit: false,
    amountStroops: 0n,
  } as const;
  if (input.network === 'mainnet') return { ...base, reason: 'mainnet-treasury-unset' };
  if (input.balanceStroops === undefined) return { ...base, reason: 'balance-unknown' };
  if (input.sweepBufferStroops === undefined) return { ...base, reason: 'buffer-unset' };
  if (assessed.belowHeadroom === true) return { ...base, reason: 'below-headroom' };
  const excess = input.balanceStroops - kept - input.sweepBufferStroops;
  if (excess <= 0n) return { ...base, reason: 'at-cap' };
  const live = input.mode === 'live';
  return {
    ...base,
    aboveCap: true,
    amountStroops: excess,
    destination: TESTNET_TREASURY_ADDRESS,
    submit: live,
    reason: 'above-cap',
  };
}

export interface SweepSend {
  (
    destination: typeof TESTNET_TREASURY_ADDRESS,
    amountStroops: bigint,
  ): Promise<{
    readonly hash: string;
  }>;
}

export type SweepRun =
  | { readonly submitted: false; readonly plan: SweepPlan; readonly code?: 'SWEEP_FAILED' }
  | { readonly submitted: true; readonly plan: SweepPlan; readonly hash: string };

/**
 * Dry-run never calls `send`. Live calls it once, and only for the testnet
 * treasury address the plan chose. A throw is not retried here.
 */
export async function runSweep(input: SweepInput, send: SweepSend): Promise<SweepRun> {
  const plan = planSweep(input);
  if (!plan.submit || plan.destination !== TESTNET_TREASURY_ADDRESS || plan.amountStroops <= 0n) {
    return { submitted: false, plan };
  }
  try {
    const sent = await send(plan.destination, plan.amountStroops);
    return { submitted: true, plan, hash: sent.hash };
  } catch {
    return { submitted: false, plan, code: 'SWEEP_FAILED' };
  }
}
