/**
 * PH2-E4-05 F16, sign-in path only. The sign-in mailer fails inside the request
 * (`auth.email_send_failed` in the router). The cron cannot see it: the failure
 * is not stored, and reading Workers Logs from `scheduled()` is not a thing this
 * Worker does. Persisting it would be a migration. So the request schedules this
 * send with `ctx.waitUntil` and returns the sign-in response without awaiting it.
 *
 * Dedupe (same shape as F14): the Resend key is
 * `f16-signin-email-failed:<UTC hour YYYY-MM-DDTHH>/<recipient hash>`.
 * Sign-in has no retry counter. `emailFailureOperatorAlert` waits for retries
 * that this route does not run (the user retries). Every `MailerError` therefore
 * schedules one email, and the hour collapses a burst to one send per operator.
 * The body is fixed text, so a reused key is the same payload.
 *
 * The operator email uses the same Resend channel as the sign-in mail. If that
 * channel is down, this send fails too and the per-recipient catch logs
 * `action: 'send_failed'`. If `EMAIL_API_KEY` or `EMAIL_FROM` is missing, it
 * does not call Resend and logs `action: 'email_channel_down'`. The Telegram
 * backup decided on 2026-10-29 is not wired.
 *
 * No database read. The address, the code, the provider message and the key
 * are not inputs, so they cannot be copied into the email or the log.
 */
import { emailChannelBlocked, EMAIL_CHANNEL_SETTINGS } from './config-check.js';
import { operatorSendFailedLog } from './operator-send.js';
import { alertsMode, parseAllowlist } from './policy.js';
import type { AlertNotification, AlertTransport } from './sender.js';

/**
 * Optional strings include `undefined` so a Worker env can be passed under
 * `exactOptionalPropertyTypes` (a missing setting is `undefined`, not absent).
 */
export interface SigninEmailFailedEnv {
  readonly ALERTS_SEND?: string | undefined;
  readonly ALERTS_ALLOWLIST?: string | undefined;
  readonly EMAIL_API_KEY?: string | undefined;
  readonly EMAIL_FROM?: string | undefined;
}

export interface SigninEmailFailedDeps {
  readonly nowSeconds: () => number;
  /** One transport per allowlisted operator. Not called when the channel is down. */
  readonly transportFor: (recipient: string) => AlertTransport;
}

export type SigninEmailFailedOutcome =
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

const EVENT = 'alerts.f16_signin_email' as const;

/** UTC hour bucket `YYYY-MM-DDTHH`. `toISOString` is always UTC. */
export function signinEmailFailedHour(nowSeconds: number): string {
  return new Date(nowSeconds * 1000).toISOString().slice(0, 13);
}

/** Event id for `operatorIdempotencyKey`. No address, no code, no error text. */
export function signinEmailFailedEventId(nowSeconds: number): string {
  return `f16-signin-email-failed:${signinEmailFailedHour(nowSeconds)}`;
}

/** Fixed text. A detail that changed per failure would make Resend answer 409 inside the hour. */
export function signinEmailFailedNotification(): AlertNotification {
  return {
    subject: 'Evergreen operator alert: sign-in email failed (F16)',
    body: 'F16: the API could not send a sign-in code. This alert is sent on the sign-in request and does not read the database. It uses the same email channel, so a provider outage can fail this send too.',
    severity: 'critical',
  };
}

/** Names among `EMAIL_CHANNEL_SETTINGS` that are unset or blank. Values are not returned. */
export function signinEmailChannelBlocked(env: SigninEmailFailedEnv): readonly string[] {
  const missing = EMAIL_CHANNEL_SETTINGS.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim() === '';
  });
  return emailChannelBlocked(missing);
}

function logOutcome(outcome: SigninEmailFailedOutcome): void {
  console.log(JSON.stringify({ event: EVENT, ...outcome }));
}

/**
 * One sign-in failure, one call. Does not throw: a send failure stays inside
 * one recipient, and anything else becomes `action: 'send_failed'` with no message.
 */
export async function runSigninEmailFailedAlert(
  env: SigninEmailFailedEnv,
  deps: SigninEmailFailedDeps,
): Promise<SigninEmailFailedOutcome> {
  try {
    const outcome = await deliverSigninEmailFailed(env, deps);
    logOutcome(outcome);
    return outcome;
  } catch {
    const outcome: SigninEmailFailedOutcome = { action: 'send_failed', failed: 0 };
    logOutcome(outcome);
    return outcome;
  }
}

async function deliverSigninEmailFailed(
  env: SigninEmailFailedEnv,
  deps: SigninEmailFailedDeps,
): Promise<SigninEmailFailedOutcome> {
  const blockedBy = signinEmailChannelBlocked(env);
  if (blockedBy.length > 0) return { action: 'email_channel_down', blockedBy };
  if (alertsMode(env.ALERTS_SEND) !== 'send') {
    return { action: 'dry-run', reason: 'alerts_send_off' };
  }
  const operators = [...parseAllowlist(env.ALERTS_ALLOWLIST)];
  if (operators.length === 0) return { action: 'dry-run', reason: 'no_operator' };
  const eventId = signinEmailFailedEventId(deps.nowSeconds());
  const notification = signinEmailFailedNotification();
  // Guard: one recipient's send failure must not skip the other operators or reject the request.
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
