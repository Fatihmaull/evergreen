/**
 * PH2-E4-09 operator channel test. One fixed TEST email to `ALERTS_ALLOWLIST`,
 * through the same gate as F14/F16/F17/F18: `ALERTS_SEND` exactly `send`,
 * `signinEmailChannelBlocked` (missing `EMAIL_API_KEY` or `EMAIL_FROM` logs
 * `action: 'email_channel_down'` and does not call Resend), `parseAllowlist`,
 * the per-recipient try/catch, and `resendOperatorTransport` (Resend
 * idempotency key).
 *
 * Nothing in the request is an input. Recipients, subject and body come from
 * the Worker env and the fixed text below. There is no recipient parameter.
 *
 * Dedupe key, per recipient: `operator-test:<UTC hour YYYY-MM-DDTHH>/<recipient hash>`
 * via `operatorIdempotencyKey`. The body is fixed, so a reused key is the same
 * payload. An in-isolate mark, set synchronously before the first send, skips
 * a second attempt in the same hour in this isolate. Other isolates still
 * collapse on the Resend key. Whether two in-flight first requests can both
 * be accepted before Resend stores the key is undetermined.
 *
 * Auth is not in this function. The route calls `operatorTestAuthorized` first
 * and does not exist unless `TICK_TOKEN` is set (the preview scheduler's bearer).
 */
import { operatorSendFailedLog } from './operator-send.js';
import { signinEmailChannelBlocked } from './signin-email-failed.js';
import { alertsMode, parseAllowlist } from './policy.js';
import type { AlertNotification, AlertTransport } from './sender.js';

export const OPERATOR_TEST_EVENT = 'alerts.operator_test' as const;

/**
 * Optional strings include `undefined` so a Worker env can be passed under
 * `exactOptionalPropertyTypes`.
 */
export interface OperatorTestEnv {
  readonly ALERTS_SEND?: string | undefined;
  readonly ALERTS_ALLOWLIST?: string | undefined;
  readonly EMAIL_API_KEY?: string | undefined;
  readonly EMAIL_FROM?: string | undefined;
}

export interface OperatorTestDeps {
  readonly nowSeconds: () => number;
  /** One transport per allowlisted operator. Not called when the channel is down or the hour is already marked. */
  readonly transportFor: (recipient: string) => AlertTransport;
}

export type OperatorTestOutcome =
  | { readonly action: 'email_channel_down'; readonly blockedBy: readonly string[] }
  | {
      readonly action: 'dry-run';
      readonly reason: 'alerts_send_off' | 'no_operator' | 'hour_deduped';
    }
  | { readonly action: 'sent'; readonly recipients: number; readonly failed?: number }
  | { readonly action: 'send_failed'; readonly failed: number };

/** UTC hour bucket `YYYY-MM-DDTHH`. `toISOString` is always UTC. Same cut as F14 and F16. */
export function operatorTestHour(nowSeconds: number): string {
  return new Date(nowSeconds * 1000).toISOString().slice(0, 13);
}

/** Event id for `operatorIdempotencyKey`. No address. */
export function operatorTestEventId(nowSeconds: number): string {
  return `operator-test:${operatorTestHour(nowSeconds)}`;
}

/** Fixed text. A detail that changed per call would make Resend answer 409 inside the hour. */
export function operatorTestNotification(): AlertNotification {
  return {
    subject: 'Evergreen operator alert: TEST',
    body: 'TEST. This message checks the operator email channel. It is not a user alert. It includes no account, no address, and no secret.',
    severity: 'info',
  };
}

/**
 * This isolate's hour mark. One string: the next hour overwrites it. Set
 * synchronously before any `await` in the send loop, so a second request in
 * this isolate cannot pass the check in between.
 */
let markedHour: string | undefined;

/** Tests only. Production never calls this. */
export function resetOperatorTestHourGuard(): void {
  markedHour = undefined;
}

function logOutcome(outcome: OperatorTestOutcome): void {
  console.log(JSON.stringify({ event: OPERATOR_TEST_EVENT, ...outcome }));
}

/**
 * One operator-initiated test. Does not throw: a send failure stays inside
 * one recipient, and anything else becomes `action: 'send_failed'` with no message.
 * Does not read a request, a database, or a recipient argument.
 */
export async function runOperatorChannelTest(
  env: OperatorTestEnv,
  deps: OperatorTestDeps,
): Promise<OperatorTestOutcome> {
  try {
    const outcome = await deliverOperatorChannelTest(env, deps);
    logOutcome(outcome);
    return outcome;
  } catch {
    const outcome: OperatorTestOutcome = { action: 'send_failed', failed: 0 };
    logOutcome(outcome);
    return outcome;
  }
}

async function deliverOperatorChannelTest(
  env: OperatorTestEnv,
  deps: OperatorTestDeps,
): Promise<OperatorTestOutcome> {
  const blockedBy = signinEmailChannelBlocked(env);
  if (blockedBy.length > 0) return { action: 'email_channel_down', blockedBy };
  if (alertsMode(env.ALERTS_SEND) !== 'send') {
    return { action: 'dry-run', reason: 'alerts_send_off' };
  }
  const operators = [...parseAllowlist(env.ALERTS_ALLOWLIST)];
  if (operators.length === 0) return { action: 'dry-run', reason: 'no_operator' };
  const now = deps.nowSeconds();
  const hour = operatorTestHour(now);
  if (markedHour === hour) return { action: 'dry-run', reason: 'hour_deduped' };
  markedHour = hour;
  const eventId = operatorTestEventId(now);
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
      console.log(JSON.stringify(operatorSendFailedLog(OPERATOR_TEST_EVENT, error)));
    }
  }
  if (sent === 0) return { action: 'send_failed', failed };
  return failed === 0
    ? { action: 'sent', recipients: sent }
    : { action: 'sent', recipients: sent, failed };
}

/**
 * The route exists only when this is true. Same rule as the preview scheduler's
 * `POST /tick`: unset or `''` means the route is not there. No trim: a
 * whitespace-only value is set, which matches that route.
 */
export function operatorTestRouteOpen(token: string | undefined): boolean {
  return token !== undefined && token !== '';
}

/**
 * Same compare as `tokenMatches` in `apps/scheduler/src/worker.ts`. Both sides
 * are hashed to a fixed length first, so the XOR does not leak where they
 * differ or how long the expected token is. A missing header returns false
 * before the hash, as that function does. Not imported from the scheduler:
 * the API Worker does not depend on that package.
 */
export async function operatorTestAuthorized(
  authorizationHeader: string | null,
  expected: string,
): Promise<boolean> {
  const presented =
    authorizationHeader !== null && authorizationHeader.startsWith('Bearer ')
      ? authorizationHeader.slice('Bearer '.length)
      : null;
  if (presented === null || expected === '') return false;
  const digest = async (text: string): Promise<Uint8Array> =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [a, b] = await Promise.all([digest(presented), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
