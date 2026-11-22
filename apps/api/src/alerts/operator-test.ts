/**
 * Operator-channel test send. Not a failure mode and not a user alert.
 *
 * Recipients come only from `ALERTS_ALLOWLIST`. This function takes no
 * recipient argument and does not read a request, so a query or a body cannot
 * choose who is mailed.
 *
 * There is no operator authenticator in this Worker. A user session
 * (`requireSession`) is not one: any signed-in user would be able to mail the
 * allowlist. The HTTP trigger is therefore not mounted. `handle` and
 * `scheduled` do not call this function. Wiring a route is a public API change
 * and is not done here.
 *
 * Same gate as F16, in the same order. If `EMAIL_API_KEY` or `EMAIL_FROM` is
 * unset or blank, this does not call the transport and logs
 * `action: 'email_channel_down'`. Otherwise `ALERTS_SEND` must be exactly
 * `send`. One recipient's failure is `action: 'send_failed'` and the next
 * operator is still tried.
 *
 * Dedupe: `operatorIdempotencyKey` of
 * `operator-test:<UTC hour YYYY-MM-DDTHH>`, which is
 * `operator-test:<YYYY-MM-DDTHH>/<recipient hash>`. The body is fixed text, so
 * a reused key is the same payload. Resend keeps the key for 24 hours; the
 * hour is what makes the next hour a new send.
 *
 * No database read. The address, the key and the provider body are not logged.
 */
import { emailChannelBlocked, EMAIL_CHANNEL_SETTINGS } from './config-check.js';
import { operatorSendFailedLog } from './operator-send.js';
import { alertsMode, parseAllowlist } from './policy.js';
import type { AlertNotification, AlertTransport } from './sender.js';

export interface OperatorTestEnv {
  readonly ALERTS_SEND?: string | undefined;
  readonly ALERTS_ALLOWLIST?: string | undefined;
  readonly EMAIL_API_KEY?: string | undefined;
  readonly EMAIL_FROM?: string | undefined;
}

export interface OperatorTestDeps {
  readonly nowSeconds: () => number;
  /** One transport per allowlisted operator. Not called when the channel is down. */
  readonly transportFor: (recipient: string) => AlertTransport;
}

export type OperatorTestOutcome =
  | {
      readonly action: 'email_channel_down';
      readonly blockedBy: readonly string[];
    }
  | { readonly action: 'dry-run'; readonly reason: 'alerts_send_off' | 'no_operator' }
  | {
      readonly action: 'sent';
      readonly recipients: number;
      readonly failed?: number;
    }
  | { readonly action: 'send_failed'; readonly failed: number };

const EVENT = 'alerts.operator_test' as const;

/** UTC hour bucket `YYYY-MM-DDTHH`. `toISOString` is always UTC. */
export function operatorTestHour(nowSeconds: number): string {
  return new Date(nowSeconds * 1000).toISOString().slice(0, 13);
}

/** Event id for `operatorIdempotencyKey`. No address. */
export function operatorTestEventId(nowSeconds: number): string {
  return `operator-test:${operatorTestHour(nowSeconds)}`;
}

/**
 * Fixed text, marked TEST. A detail that changed per call would make Resend
 * answer 409 inside the hour. Severity is `info` because this is not a failure.
 */
export function operatorTestNotification(): AlertNotification {
  return {
    subject: 'Evergreen operator alert: TEST',
    body: 'TEST. This is an operator-channel test, not a failure. No contract, user, or database row is involved. Recipients are the operator allowlist only.',
    severity: 'info',
  };
}

/** Names among `EMAIL_CHANNEL_SETTINGS` that are unset or blank. Values are not returned. */
export function operatorTestChannelBlocked(env: OperatorTestEnv): readonly string[] {
  const missing = EMAIL_CHANNEL_SETTINGS.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim() === '';
  });
  return emailChannelBlocked(missing);
}

function logOutcome(outcome: OperatorTestOutcome): void {
  console.log(JSON.stringify({ event: EVENT, ...outcome }));
}

/**
 * One call, one attempt to mail the allowlist. Does not throw: a send failure
 * stays inside one recipient, and anything else becomes `action: 'send_failed'`
 * with no message.
 */
export async function runOperatorTestAlert(
  env: OperatorTestEnv,
  deps: OperatorTestDeps,
): Promise<OperatorTestOutcome> {
  try {
    const outcome = await deliverOperatorTest(env, deps);
    logOutcome(outcome);
    return outcome;
  } catch {
    const outcome: OperatorTestOutcome = { action: 'send_failed', failed: 0 };
    logOutcome(outcome);
    return outcome;
  }
}

async function deliverOperatorTest(
  env: OperatorTestEnv,
  deps: OperatorTestDeps,
): Promise<OperatorTestOutcome> {
  const blockedBy = operatorTestChannelBlocked(env);
  if (blockedBy.length > 0) return { action: 'email_channel_down', blockedBy };
  if (alertsMode(env.ALERTS_SEND) !== 'send') {
    return { action: 'dry-run', reason: 'alerts_send_off' };
  }
  const operators = [...parseAllowlist(env.ALERTS_ALLOWLIST)];
  if (operators.length === 0) return { action: 'dry-run', reason: 'no_operator' };
  const eventId = operatorTestEventId(deps.nowSeconds());
  const notification = operatorTestNotification();
  // Guard: one recipient's send failure must not skip the other operators.
  let sent = 0;
  let failed = 0;
  for (const recipient of operators) {
    try {
      await deps.transportFor(recipient).deliver(notification, eventId);
      sent += 1;
    } catch (error) {
      failed += 1;
      console.log(JSON.stringify(operatorSendFailedLog(EVENT, error)));
    }
  }
  if (sent === 0) return { action: 'send_failed', failed };
  return failed === 0
    ? { action: 'sent', recipients: sent }
    : { action: 'sent', recipients: sent, failed };
}
