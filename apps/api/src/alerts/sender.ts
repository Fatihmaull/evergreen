/**
 * PH2-E2-06 send decision (docs/PH2-E2-06-ALERTS-DESIGN.md §2, §6). Sends go
 * through an injected transport shaped like the engine's
 * `EmailChannel.deliver(notification, eventId)`; apps/api does not import
 * packages/engine. No outbox here: that is Rakha's schema (§7).
 */
import {
  alertsMode,
  isAllowlisted,
  parseAllowlist,
  rateDecision,
  wantsAlert,
  type AlertKind,
} from './policy.js';

/** Same shape as `Notification` in packages/core. */
export interface AlertNotification {
  readonly subject: string;
  readonly body: string;
  readonly severity: 'info' | 'warn' | 'critical';
}

/** Structural match for `EmailChannel` built with mode 'send' for `recipient`. */
export interface AlertTransport {
  deliver(notification: AlertNotification, eventId: string): Promise<unknown>;
}

export interface AlertEnv {
  readonly ALERTS_SEND?: string;
  readonly ALERTS_ALLOWLIST?: string;
}

export interface AlertRequest {
  readonly kind: AlertKind;
  readonly eventId: string;
  readonly recipient: string;
  readonly notification: AlertNotification;
  readonly prefs: Readonly<Partial<Record<AlertKind, boolean>>>;
  readonly sentInWindow: number;
  readonly deactivated: boolean;
}

export type AlertOutcome =
  | { readonly action: 'skip'; readonly reason: 'deactivated' | 'opted_out' | 'rate_limited' }
  | { readonly action: 'dry-run'; readonly reason: 'alerts_send_off' | 'not_allowlisted' }
  | { readonly action: 'sent'; readonly result: unknown };

export function decideAlert(
  env: AlertEnv,
  req: AlertRequest,
): Exclude<AlertOutcome, { action: 'sent' }> | { readonly action: 'send' } {
  if (req.deactivated) return { action: 'skip', reason: 'deactivated' };
  if (!wantsAlert(req.kind, req.prefs)) return { action: 'skip', reason: 'opted_out' };
  if (!rateDecision(req.kind, req.sentInWindow).allow)
    return { action: 'skip', reason: 'rate_limited' };
  if (alertsMode(env.ALERTS_SEND) !== 'send')
    return { action: 'dry-run', reason: 'alerts_send_off' };
  if (!isAllowlisted(parseAllowlist(env.ALERTS_ALLOWLIST), req.recipient)) {
    return { action: 'dry-run', reason: 'not_allowlisted' };
  }
  return { action: 'send' };
}

/** The only write path: calls `transport.deliver` only on a `send` decision. */
export async function sendAlert(
  env: AlertEnv,
  req: AlertRequest,
  transport: AlertTransport,
): Promise<AlertOutcome> {
  const decision = decideAlert(env, req);
  if (decision.action !== 'send') return decision;
  const result = await transport.deliver(req.notification, req.eventId);
  return { action: 'sent', result };
}
