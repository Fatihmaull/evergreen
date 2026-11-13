/**
 * PH2-E4-05 F14 operator alert. The API cron calls this once when any of F9, F10
 * or F11 returned `read_failed`. It does not read the database: there is no SQL,
 * no `DATABASE_URL`, and no row id in the idempotency key.
 *
 * Dedupe (decision for PM, 2026-11-10): the Resend key is
 * `f14-database-unavailable:<UTC hour YYYY-MM-DDTHH>/<recipient hash>`.
 * A per-cron-window key would email on every 5- or 15-minute fire for the whole
 * outage, and this file does not know the cron expression. The hour is the longer
 * of those two windows. A new hour is a new key, so a multi-hour outage re-alerts
 * inside Resend's 24-hour retention. The body is fixed text, so every send in
 * that hour has the same payload.
 *
 * Same gate as F9/F10/F11: `ALERTS_SEND` exactly `send`, recipients from
 * `ALERTS_ALLOWLIST`. One recipient's failure is `action: 'send_failed'` and
 * does not skip the next recipient.
 */
import { operatorSendFailedLog } from './operator-send.js';
import { alertsMode, parseAllowlist } from './policy.js';
import type { AlertEnv, AlertNotification, AlertTransport } from './sender.js';

export interface DatabaseUnavailableDeps {
  readonly nowSeconds: () => number;
  /** Builds a transport for one recipient (Resend in the Worker, a fake in tests). */
  readonly transportFor: (recipient: string) => AlertTransport;
}

export type DatabaseUnavailableOutcome =
  | { readonly action: 'dry-run'; readonly reason: 'alerts_send_off' | 'no_operator' }
  | {
      readonly action: 'sent';
      readonly recipients: number;
      /** How many delivers threw, when at least one other succeeded. */
      readonly failed?: number;
    }
  | { readonly action: 'send_failed'; readonly failed: number };

/** UTC hour bucket `YYYY-MM-DDTHH`. `toISOString` is always UTC. */
export function databaseUnavailableHour(nowSeconds: number): string {
  return new Date(nowSeconds * 1000).toISOString().slice(0, 13);
}

/** Event id for `operatorIdempotencyKey`. No database data. */
export function databaseUnavailableEventId(nowSeconds: number): string {
  return `f14-database-unavailable:${databaseUnavailableHour(nowSeconds)}`;
}

/** Fixed text. A count or an error string would change the payload inside one hour and Resend would 409. */
export function databaseUnavailableNotification(): AlertNotification {
  return {
    subject: 'Evergreen operator alert: database unavailable (F14)',
    body: 'F14: the API cron could not read the database. The scheduler checks did not complete. This alert is sent without reading the database. Checked by the API Worker cron.',
    severity: 'critical',
  };
}

/**
 * One invocation, one call. The caller must not call this again for the same
 * cron run when several checks returned `read_failed`.
 */
export async function runDatabaseUnavailableAlert(
  env: AlertEnv,
  deps: DatabaseUnavailableDeps,
): Promise<DatabaseUnavailableOutcome> {
  if (alertsMode(env.ALERTS_SEND) !== 'send')
    return { action: 'dry-run', reason: 'alerts_send_off' };
  const operators = [...parseAllowlist(env.ALERTS_ALLOWLIST)];
  if (operators.length === 0) return { action: 'dry-run', reason: 'no_operator' };
  const eventId = databaseUnavailableEventId(deps.nowSeconds());
  const notification = databaseUnavailableNotification();
  // Guard: one recipient's send failure must not skip the other operators or reject the cron.
  let sent = 0;
  let failed = 0;
  for (const recipient of operators) {
    try {
      await deps.transportFor(recipient).deliver(notification, eventId);
      sent += 1;
    } catch (error) {
      failed += 1;
      console.log(JSON.stringify(operatorSendFailedLog('alerts.f14_database', error)));
    }
  }
  if (sent === 0) return { action: 'send_failed', failed };
  return failed === 0
    ? { action: 'sent', recipients: sent }
    : { action: 'sent', recipients: sent, failed };
}
