/**
 * PH2-E4-05 F9 slow-tick operator alert (docs/PH2-E4-05-FAILURE-MODES.md F9). A cron in the
 * API Worker, independent of the scheduler, reads the newest **successful** `scheduler_ticks`
 * row (`WHERE ok`) and alerts the operator through Resend when the RPC round trip it recorded
 * (`rpc_ms`, migration 0010) is above the threshold. Same gate as F11: sending happens only
 * when `ALERTS_SEND` is exactly `send`, to the operators in `ALERTS_ALLOWLIST`.
 *
 * **The threshold is decided, so it is a constant:** slow if the latest tick's `rpcMs` is
 * above 12000 ms (PM, 2026-11-10; revisable by Fatih, in this one place). Production `rpc_ms`
 * on 10 Nov 2026 since 11:30 WIB, 10 samples (4435, 5303, 6415, 7329, 7493, 8211, 9026, 9359,
 * 10057, 13160), had median 7852 ms and max 13160 ms. `rpc_ms` is the sum of getNetwork and
 * getLatestLedger, each with a 10 s timeout, so the previous 3000 ms line fired on every
 * successful tick. The failed-tick rule is not here: a failed tick is not a heartbeat, so a
 * run of them leaves the newest `ok` row ageing, which is F11.
 *
 * **Not a user alert and not in `alert_outbox`.** That table has a user foreign key, which an
 * operator alert cannot satisfy. Its only dedupe is Resend's 24-hour idempotency key, built
 * from the event id below (one per slow tick) and the recipient; see `operatorIdempotencyKey`.
 *
 * A slow tick that is also stale is F11's to report, not this alert's: with
 * `HEARTBEAT_STALE_SECONDS` set, a newest `ok` row older than that is left alone, so a dead
 * scheduler whose last tick happened to be slow does not email again every 24 hours.
 */
import { staleThresholdSeconds } from './heartbeat.js';
import { operatorSendFailedLog } from './operator-send.js';
import { alertsMode, parseAllowlist } from './policy.js';
import type { AlertNotification, AlertTransport } from './sender.js';

/** Slow if the newest successful tick's `rpc_ms` is strictly above this (PM, 2026-11-10; revisable by Fatih). */
export const SLOW_TICK_RPC_MS = 12000;

export interface SlowTickEnv {
  readonly ALERTS_SEND?: string;
  readonly ALERTS_ALLOWLIST?: string;
  /** F11's threshold, reused only to leave a stale tick to F11. */
  readonly HEARTBEAT_STALE_SECONDS?: string;
}

/** The newest successful tick: unix seconds, and `rpc_ms` (undefined for a row from before 0010). */
export interface LatestOkTick {
  readonly tickedAt: number;
  readonly rpcMs: number | undefined;
}

export type SlowTickState =
  | { readonly state: 'no_tick' }
  | { readonly state: 'unmeasured' }
  | { readonly state: 'stale' }
  | { readonly state: 'fine'; readonly rpcMs: number }
  | { readonly state: 'slow'; readonly rpcMs: number; readonly tickedAt: number };

/**
 * Pure. Absence is not an alert (an empty table is F11's "stale"), and an unmeasured row
 * (`rpc_ms` NULL, written before 0010) is neither fine nor slow.
 */
export function slowTickState(
  latest: LatestOkTick | undefined,
  nowSeconds: number,
  staleSeconds: number | undefined,
): SlowTickState {
  if (latest === undefined) return { state: 'no_tick' };
  if (staleSeconds !== undefined && nowSeconds - latest.tickedAt > staleSeconds) {
    return { state: 'stale' };
  }
  if (latest.rpcMs === undefined) return { state: 'unmeasured' };
  return latest.rpcMs > SLOW_TICK_RPC_MS
    ? { state: 'slow', rpcMs: latest.rpcMs, tickedAt: latest.tickedAt }
    : { state: 'fine', rpcMs: latest.rpcMs };
}

export function slowTickNotification(s: SlowTickState & { state: 'slow' }): AlertNotification {
  return {
    subject: 'Evergreen operator alert: scheduler RPC slow (F9)',
    body: `F9: the newest scheduler tick spent ${s.rpcMs} ms waiting on the Soroban RPC (alert above ${SLOW_TICK_RPC_MS} ms). Reads may be timing out soon; renewals could be delayed. Checked by the API Worker cron.`,
    severity: 'warn',
  };
}

export interface SlowTickDeps {
  /** The newest `scheduler_ticks` row with `ok`, undefined when there is none. */
  readonly latestOkTick: () => Promise<LatestOkTick | undefined>;
  readonly nowSeconds: () => number;
  /** Builds a transport for one recipient (Resend in the Worker, a fake in tests). */
  readonly transportFor: (recipient: string) => AlertTransport;
}

export type SlowTickOutcome =
  | {
      readonly action: 'none';
      readonly reason: 'no_tick' | 'unmeasured' | 'stale' | 'fine';
    }
  | { readonly action: 'read_failed' }
  | {
      readonly action: 'dry-run';
      readonly reason: 'alerts_send_off' | 'no_operator';
      readonly rpcMs: number;
    }
  | {
      readonly action: 'sent';
      readonly recipients: number;
      readonly rpcMs: number;
      /** How many delivers threw, when at least one other succeeded. */
      readonly failed?: number;
    }
  | { readonly action: 'send_failed'; readonly failed: number; readonly rpcMs: number };

/**
 * One cron run. Reads, decides, and calls `transport.deliver` only when the newest successful
 * tick is slow, `ALERTS_SEND` is exactly `send` and the allowlist has an operator. The event
 * id is per slow tick, so cron runs over the same tick reuse Resend's idempotency key. A failed
 * deliver is logged (`action: 'send_failed'`, no address) and the next operator is still tried.
 */
export async function runSlowTickCheck(
  env: SlowTickEnv,
  deps: SlowTickDeps,
): Promise<SlowTickOutcome> {
  let latest: LatestOkTick | undefined;
  try {
    latest = await deps.latestOkTick();
  } catch {
    return { action: 'read_failed' };
  }
  const s = slowTickState(
    latest,
    deps.nowSeconds(),
    staleThresholdSeconds(env.HEARTBEAT_STALE_SECONDS),
  );
  if (s.state !== 'slow') return { action: 'none', reason: s.state };
  if (alertsMode(env.ALERTS_SEND) !== 'send') {
    return { action: 'dry-run', reason: 'alerts_send_off', rpcMs: s.rpcMs };
  }
  const operators = [...parseAllowlist(env.ALERTS_ALLOWLIST)];
  if (operators.length === 0) return { action: 'dry-run', reason: 'no_operator', rpcMs: s.rpcMs };
  const eventId = `f9-slow-tick:${s.tickedAt}`;
  const notification = slowTickNotification(s);
  // Guard: one recipient's send failure must not skip the other operators, and must not reject the cron.
  let sent = 0;
  let failed = 0;
  for (const r of operators) {
    try {
      await deps.transportFor(r).deliver(notification, eventId);
      sent += 1;
    } catch (error) {
      failed += 1;
      console.log(JSON.stringify(operatorSendFailedLog('alerts.f9_slow_tick', error)));
    }
  }
  if (sent === 0) return { action: 'send_failed', failed, rpcMs: s.rpcMs };
  return failed === 0
    ? { action: 'sent', recipients: sent, rpcMs: s.rpcMs }
    : { action: 'sent', recipients: sent, failed, rpcMs: s.rpcMs };
}

/**
 * The read the cron needs: the newest successful tick. `id` breaks a tie between two rows with
 * the same `ticked_at`. Requires SELECT on `scheduler_ticks` for the API role (0009) and the
 * `ok` and `rpc_ms` columns (0010).
 */
export const LATEST_OK_TICK_SQL =
  'SELECT extract(epoch FROM ticked_at)::bigint AS t, rpc_ms FROM scheduler_ticks WHERE ok ORDER BY ticked_at DESC, id DESC LIMIT 1';
