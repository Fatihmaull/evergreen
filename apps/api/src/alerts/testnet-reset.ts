/**
 * PH2-E4-05 F10 operator monitor (Fatih, 2026-10-29 17:03 WIB, option 3): a
 * cron in the API Worker reads the newest `scheduler_ticks` rows and alerts
 * the operator when `observed_ledger` decreased between consecutive ticks
 * (signal 1). The user email (signal 2) is `testnetResetUserEvents` in
 * dispatch.ts, not this file.
 *
 * Undetermined, so not invented here: how many ticks to look back. It comes
 * from `TESTNET_RESET_LOOKBACK_TICKS`; unset or malformed means no check.
 * Sending happens only when `ALERTS_SEND` is exactly `send`. Same read grant
 * as F11 (SELECT on scheduler_ticks for the API role, migration 0009).
 */
import { alertsMode, parseAllowlist } from './policy.js';
import { testnetResetSignal, type TickFact } from './failure-modes.js';
import type { AlertNotification, AlertTransport } from './sender.js';

export interface TestnetResetEnv {
  readonly ALERTS_SEND?: string;
  readonly ALERTS_ALLOWLIST?: string;
  readonly TESTNET_RESET_LOOKBACK_TICKS?: string;
}

export function lookbackTicks(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^[1-9][0-9]{0,4}$/.test(raw)) return undefined;
  const n = Number(raw);
  return n >= 2 ? n : undefined;
}

export interface TestnetResetDeps {
  /** The newest `limit` ticks, any order. */
  readonly recentTicks: (limit: number) => Promise<readonly TickFact[]>;
  readonly transportFor: (recipient: string) => AlertTransport;
}

export type TestnetResetOutcome =
  | { readonly action: 'none'; readonly reason: 'lookback_unset' | 'no_decrease' }
  | { readonly action: 'read_failed' }
  | {
      readonly action: 'dry-run';
      readonly reason: 'alerts_send_off' | 'no_operator';
      readonly decreases: number;
    }
  | { readonly action: 'sent'; readonly recipients: number; readonly decreases: number };

export function testnetResetNotification(from: bigint, to: bigint): AlertNotification {
  return {
    subject: 'Evergreen operator alert: observed ledger decreased (F10, testnet reset?)',
    body: `F10: the scheduler's observed ledger went from ${from} to ${to} between consecutive ticks. Treat as a possible testnet reset; the DoD-2 window restarts. Checked by the API Worker cron.`,
    severity: 'critical',
  };
}

export async function runTestnetResetCheck(
  env: TestnetResetEnv,
  deps: TestnetResetDeps,
): Promise<TestnetResetOutcome> {
  const limit = lookbackTicks(env.TESTNET_RESET_LOOKBACK_TICKS);
  if (limit === undefined) return { action: 'none', reason: 'lookback_unset' };
  let ticks: readonly TickFact[];
  try {
    ticks = await deps.recentTicks(limit);
  } catch {
    return { action: 'read_failed' };
  }
  const s = testnetResetSignal(ticks);
  if (!s.operatorAlert) return { action: 'none', reason: 'no_decrease' };
  const decreases = s.decreases.length;
  if (alertsMode(env.ALERTS_SEND) !== 'send')
    return { action: 'dry-run', reason: 'alerts_send_off', decreases };
  const operators = [...parseAllowlist(env.ALERTS_ALLOWLIST)];
  if (operators.length === 0) return { action: 'dry-run', reason: 'no_operator', decreases };
  for (const d of s.decreases) {
    // One event id per drop: later cron runs over the same drop reuse Resend's idempotency key.
    const eventId = `f10-ledger-decrease:${d.from}->${d.to}`;
    const n = testnetResetNotification(d.from, d.to);
    for (const r of operators) await deps.transportFor(r).deliver(n, eventId);
  }
  return { action: 'sent', recipients: operators.length, decreases };
}

export const RECENT_TICKS_SQL =
  'SELECT extract(epoch FROM ticked_at)::bigint AS t, observed_ledger AS l FROM scheduler_ticks ORDER BY ticked_at DESC LIMIT $1';
