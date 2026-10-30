/**
 * F9 (docs/PH2-E4-05-FAILURE-MODES.md): RPC slow, and consecutive failed ticks. Pure; log-only.
 * Nothing here sends anything: the worker adds the verdict to the `scheduler.evaluate` log line.
 *
 * **PROVISIONAL thresholds (PM, 2026-10-30): revise with more data.** Derived from 8 active
 * preview ticks, 1 watch item, dryRun (DevOps, Cloudflare telemetry, 2026-10-30 13:05–13:40 WIB):
 *   rpcMs    per tick: 419, 277, 94, 80, 39, 473, 57, 611  (max 611)
 *   rpcMaxMs per tick: 368, 156, 59, 40, 25, 395, 40, 310  (max 395)
 *   rpcBatches: 2 on every tick.
 * Derivation: 5 × the observed max, rounded up to the next 500 ms.
 *   RPC_SLOW_MAX_MS   = ceil(5 × 395 / 500) × 500 = ceil(1975 / 500) × 500 = 2000
 *   RPC_SLOW_TOTAL_MS = ceil(5 × 611 / 500) × 500 = ceil(3055 / 500) × 500 = 3500
 * The 5× margin is wide on purpose: within 8 samples the spread is already ~10× (39 to 611),
 * so a tighter bound would false-alarm. Both stay under the per-read timeout (10 000 ms,
 * tick.ts DEFAULT_RPC_TIMEOUT_MS). rpcMs scales with batches (one item gave 2), so the
 * total bound will need revising once there are more items.
 * Failed ticks: 3 in a row, i.e. 15 minutes at the 5-minute preview cadence. A conservative
 * provisional pick, not derived from data: no failed tick has been observed yet.
 */
import type { RpcTiming } from './due.js';

/** PROVISIONAL (PM, 2026-10-30): 5 × observed max rpcMaxMs 395, rounded up to 500 ms. */
export const RPC_SLOW_MAX_MS = 2000;
/** PROVISIONAL (PM, 2026-10-30): 5 × observed max rpcMs 611, rounded up to 500 ms. */
export const RPC_SLOW_TOTAL_MS = 3500;
/** PROVISIONAL (PM, 2026-10-30): conservative pick; no failed tick observed yet. */
export const RPC_FAILED_TICKS_ALERT = 3;

export type RpcSlowReason = 'max' | 'total';

/** Reasons a tick counts as RPC-slow; empty when it does not. A tick with no reads is not slow. */
export function rpcSlowReasons(t: RpcTiming): RpcSlowReason[] {
  const out: RpcSlowReason[] = [];
  if (t.rpcMaxMs >= RPC_SLOW_MAX_MS) out.push('max');
  if (t.rpcMs >= RPC_SLOW_TOTAL_MS) out.push('total');
  return out;
}

/**
 * Failed ticks at the end of `outcomes` (oldest first; true = the tick failed), and whether
 * that run reaches the provisional alert count. Reading past ticks is not wired: the scheduler
 * role has no SELECT on its own logs or `scheduler_ticks`, so the caller supplies them.
 */
export function consecutiveFailedTicks(outcomes: readonly boolean[]): {
  readonly count: number;
  readonly alert: boolean;
} {
  let count = 0;
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i] === true; i--) count += 1;
  return { count, alert: count >= RPC_FAILED_TICKS_ALERT };
}
