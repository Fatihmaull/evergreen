/**
 * PH2-E2-06 per-user alert planning (docs/PH2-E2-06-ALERTS-DESIGN.md §2, §3,
 * §5): turns one alert event plus the recipient's state into the
 * `DispatchRequest` that `dispatchUserAlert` takes, rendering the copy from
 * templates.ts so every caller words the same kind the same way. Pure: no
 * clock, no transport, no storage. The outbox and preferences are Rakha's
 * schema (§7); the caller passes `prefs` and `deactivated` in and injects the
 * store through `DispatchDeps`. Sending stays gated by `decideAlert`
 * (ALERTS_SEND exactly `send` plus the allowlist); nothing here sends.
 */
import {
  dispatchUserAlert,
  type DispatchDeps,
  type DispatchOutcome,
  type DispatchRequest,
} from './dispatch.js';
import type { AlertKind } from './policy.js';
import type { AlertEnv } from './sender.js';
import { renderAlertEmail, type AlertContext } from './templates.js';

export interface UserAlertEvent {
  readonly userId: string;
  readonly kind: AlertKind;
  /** Stable per fact, not per tick (§5), e.g. `job:<job_id>:refund-delayed`. */
  readonly eventId: string;
  readonly recipient: string;
  readonly context: AlertContext;
  /** Optional kinds the user has set; empty until the preferences store exists. */
  readonly prefs: Readonly<Partial<Record<AlertKind, boolean>>>;
  readonly deactivated: boolean;
}

/** Event ids reach the outbox key and Resend's idempotency key, so they stay address-free. */
export const MAX_EVENT_ID_LENGTH = 200;

export type EventIdProblem = 'empty' | 'too_long' | 'whitespace' | 'contains_at';

export function eventIdProblem(eventId: string): EventIdProblem | null {
  if (eventId.length === 0) return 'empty';
  if (eventId.length > MAX_EVENT_ID_LENGTH) return 'too_long';
  if (/\s/.test(eventId)) return 'whitespace';
  // An `@` is the cheapest sign an address leaked into the id; refuse it.
  if (eventId.includes('@')) return 'contains_at';
  return null;
}

export type PlanResult =
  | { readonly ok: true; readonly request: DispatchRequest }
  | { readonly ok: false; readonly reason: 'invalid_event_id'; readonly problem: EventIdProblem };

export function planUserAlert(event: UserAlertEvent): PlanResult {
  const problem = eventIdProblem(event.eventId);
  if (problem) return { ok: false, reason: 'invalid_event_id', problem };
  const email = renderAlertEmail(event.kind, event.context);
  return {
    ok: true,
    request: {
      userId: event.userId,
      kind: event.kind,
      eventId: event.eventId,
      recipient: event.recipient,
      notification: { subject: email.subject, body: email.body, severity: email.severity },
      prefs: event.prefs,
      deactivated: event.deactivated,
    },
  };
}

export type PlannedDispatchOutcome =
  | DispatchOutcome
  | {
      readonly action: 'invalid';
      readonly reason: 'invalid_event_id';
      readonly problem: EventIdProblem;
    };

/** Plan, then dispatch through the injected store and transport. */
export async function dispatchUserAlertEvent(
  env: AlertEnv,
  event: UserAlertEvent,
  deps: DispatchDeps,
): Promise<PlannedDispatchOutcome> {
  const plan = planUserAlert(event);
  if (!plan.ok) return { action: 'invalid', reason: plan.reason, problem: plan.problem };
  return dispatchUserAlert(env, plan.request, deps);
}
