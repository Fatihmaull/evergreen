/**
 * PH2-E4-03 sweep step. Dry-run unless `SWEEP_MODE=live`.
 *
 * The tick asks `planSweep` and logs counts. It does not take a treasury key.
 * A live plan is submitted only through the `send` the caller passes. This
 * scheduler does not build that payment: without a sender, live still moves
 * nothing (`SWEEP_FAILED`). The buffer has no default.
 */
import { runSweep, type SweepSend } from '@evergreen-stellar/core';

export interface SweepEnv {
  /** Exactly `live` may submit. Anything else, including unset, is dry-run. */
  SWEEP_MODE?: string;
  /** Decimal stroops. Unset or malformed means the buffer is unknown and nothing is swept. */
  SWEEP_BUFFER_STROOPS?: string;
}

export interface SweepConfig {
  readonly mode: 'dry-run' | 'live';
  readonly sweepBufferStroops: bigint | undefined;
}

export function parseSweepConfig(env: SweepEnv): SweepConfig {
  const text = env.SWEEP_BUFFER_STROOPS;
  const sweepBufferStroops =
    text !== undefined && /^\d{1,15}$/.test(text) ? BigInt(text) : undefined;
  return { mode: env.SWEEP_MODE === 'live' ? 'live' : 'dry-run', sweepBufferStroops };
}

/** Counts only. No account, no hash, no destination. */
export interface SweepTickCounts {
  readonly dryRun: boolean;
  readonly reason: string;
  readonly inFlight: string;
  readonly amount: string;
  readonly submitted: boolean;
}

export async function runSweepTick(deps: {
  readonly config: SweepConfig;
  readonly inFlightStroops: bigint;
  readonly balanceStroops: bigint | undefined;
  readonly send: SweepSend;
}): Promise<SweepTickCounts> {
  const result = await runSweep(
    {
      network: 'testnet',
      mode: deps.config.mode,
      balanceStroops: deps.balanceStroops,
      inFlightPullsStroops: deps.inFlightStroops,
      sweepBufferStroops: deps.config.sweepBufferStroops,
    },
    deps.send,
  );
  return {
    dryRun: deps.config.mode !== 'live',
    reason: result.plan.reason,
    inFlight: deps.inFlightStroops.toString(10),
    amount: result.plan.amountStroops.toString(10),
    submitted: result.submitted,
  };
}
