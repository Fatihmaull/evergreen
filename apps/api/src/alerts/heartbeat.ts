/**
 * PH2-E4-05 F11 operator alert (PM decision, 2026-10-29): a cron in the API
 * Worker, independent of the scheduler, reads the newest `scheduler_ticks` row
 * and alerts the operator through Resend when it is stale. The operator
 * addresses come from `ALERTS_ALLOWLIST` (a Worker secret); none is in code.
 * Sending happens only when `ALERTS_SEND` is exactly `send`.
 *
 * Undetermined, so not invented here: the staleness threshold. It comes from
 * `HEARTBEAT_STALE_SECONDS`; unset or malformed means no decision is made.
 */
import { alertsMode, parseAllowlist } from './policy.js';
import type { AlertNotification, AlertTransport } from './sender.js';

export interface HeartbeatEnv {
  readonly ALERTS_SEND?: string;
  readonly ALERTS_ALLOWLIST?: string;
  readonly HEARTBEAT_STALE_SECONDS?: string;
}

export type HeartbeatState =
  | { readonly state: 'threshold_unset' }
  | { readonly state: 'fresh'; readonly ageSeconds: number }
  | { readonly state: 'stale'; readonly ageSeconds: number | undefined };

/** Whole positive seconds, or undefined. No trimming, no defaults. */
export function staleThresholdSeconds(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
}

/**
 * Pure. `latestTickedAt` is unix seconds of the newest tick, or undefined when
 * the table has no row (absence is not health: no tick is stale).
 */
export function heartbeatState(
  latestTickedAt: number | undefined,
  nowSeconds: number,
  maxAgeSeconds: number | undefined,
): HeartbeatState {
  if (maxAgeSeconds === undefined) return { state: 'threshold_unset' };
  if (latestTickedAt === undefined) return { state: 'stale', ageSeconds: undefined };
  const age = nowSeconds - latestTickedAt;
  return age > maxAgeSeconds
    ? { state: 'stale', ageSeconds: age }
    : { state: 'fresh', ageSeconds: age };
}

export function heartbeatNotification(s: HeartbeatState & { state: 'stale' }): AlertNotification {
  const age =
    s.ageSeconds === undefined
      ? 'no scheduler tick has been recorded'
      : `the newest scheduler tick is ${s.ageSeconds} seconds old`;
  return {
    subject: 'Evergreen operator alert: scheduler heartbeat stale (F11)',
    body: `F11: ${age}. The scheduler may be down; renewals may be missed. Checked by the API Worker cron.`,
    severity: 'critical',
  };
}

export interface HeartbeatDeps {
  /** Unix seconds of the newest scheduler_ticks row, undefined when empty. */
  readonly latestTickedAt: () => Promise<number | undefined>;
  readonly nowSeconds: () => number;
  /** Builds a transport for one recipient (Resend in the Worker, a fake in tests). */
  readonly transportFor: (recipient: string) => AlertTransport;
}

export type HeartbeatOutcome =
  | { readonly action: 'none'; readonly reason: 'threshold_unset' | 'fresh' }
  | { readonly action: 'read_failed' }
  | {
      readonly action: 'dry-run';
      readonly reason: 'alerts_send_off' | 'no_operator';
      readonly ageSeconds: number | undefined;
    }
  | {
      readonly action: 'sent';
      readonly recipients: number;
      readonly ageSeconds: number | undefined;
    };

/**
 * One cron run. Reads, decides, and calls `transport.deliver` only when the
 * heartbeat is stale, `ALERTS_SEND` is exactly `send` and the allowlist has at
 * least one operator. Event id is per stale tick so retries collapse.
 */
export async function runHeartbeatCheck(
  env: HeartbeatEnv,
  deps: HeartbeatDeps,
): Promise<HeartbeatOutcome> {
  const threshold = staleThresholdSeconds(env.HEARTBEAT_STALE_SECONDS);
  if (threshold === undefined) return { action: 'none', reason: 'threshold_unset' };
  let latest: number | undefined;
  try {
    latest = await deps.latestTickedAt();
  } catch {
    return { action: 'read_failed' };
  }
  const s = heartbeatState(latest, deps.nowSeconds(), threshold);
  if (s.state !== 'stale') return { action: 'none', reason: 'fresh' };
  if (alertsMode(env.ALERTS_SEND) !== 'send')
    return { action: 'dry-run', reason: 'alerts_send_off', ageSeconds: s.ageSeconds };
  const operators = [...parseAllowlist(env.ALERTS_ALLOWLIST)];
  if (operators.length === 0)
    return { action: 'dry-run', reason: 'no_operator', ageSeconds: s.ageSeconds };
  const eventId = `f11-heartbeat-stale:${latest ?? 'none'}`;
  const notification = heartbeatNotification(s);
  for (const r of operators) await deps.transportFor(r).deliver(notification, eventId);
  return { action: 'sent', recipients: operators.length, ageSeconds: s.ageSeconds };
}

/** The read the cron needs. Requires SELECT on scheduler_ticks for the API role. */
export const LATEST_TICK_SQL =
  'SELECT extract(epoch FROM max(ticked_at))::bigint AS t FROM scheduler_ticks';

/** Resend transport for one operator. Never logs the key or the address. */
export function resendOperatorTransport(
  apiKey: string,
  from: string,
  to: string,
  fetcher: typeof fetch,
): AlertTransport {
  return {
    async deliver(n, eventId) {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'manual',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': eventId,
        },
        body: JSON.stringify({ from, to: [to], subject: n.subject, text: n.body }),
      });
      if (!response.ok) throw new Error(`operator alert send failed: ${response.status}`);
      return { status: response.status };
    },
  };
}
