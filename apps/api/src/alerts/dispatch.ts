/**
 * PH2-E2-06 per-user alert dispatch (docs/PH2-E2-06-ALERTS-DESIGN.md §2, §5):
 * the outbox row is written before the send ("intent before effect"), so a
 * retry of the same (user, event) reuses the row and the Resend idempotency
 * key, and an event already `sent` is never sent again.
 *
 * The outbox and preferences tables are Rakha's schema (§7, ask on #385), so
 * this module only defines `AlertOutboxStore`; a memory store backs the tests.
 * Sending is still gated by `decideAlert` (ALERTS_SEND exactly `send`, the
 * allowlist on preview). Nothing here logs the recipient address.
 */
import { ALERT_SPECS, type AlertKind } from './policy.js';
import { testnetResetSignal, type TickFact } from './failure-modes.js';
import {
  decideAlert,
  type AlertEnv,
  type AlertNotification,
  type AlertRequest,
  type AlertTransport,
} from './sender.js';

export type OutboxStatus = 'pending' | 'sent' | 'failed';

export interface OutboxRow {
  readonly userId: string;
  readonly eventId: string;
  readonly kind: AlertKind;
  readonly severity: AlertNotification['severity'];
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly resendEmailId?: string | undefined;
}

/** Shape asked of Rakha in §7 item 1; UNIQUE (userId, eventId) is the dedupe. */
export interface AlertOutboxStore {
  /** Insert a `pending` row, or return the existing row for (userId, eventId). */
  claim(row: {
    userId: string;
    eventId: string;
    kind: AlertKind;
    severity: AlertNotification['severity'];
  }): Promise<OutboxRow>;
  /** Increments attempts before the send, so a crash mid-send is still counted. */
  beginAttempt(userId: string, eventId: string): Promise<void>;
  markSent(userId: string, eventId: string, resendEmailId: string | undefined): Promise<void>;
  markFailed(userId: string, eventId: string): Promise<void>;
  /** Optional alerts sent to this user in the rate window (§5). */
  sentInWindow(userId: string, nowSeconds: number, windowSeconds: number): Promise<number>;
}

export interface DispatchRequest extends Omit<AlertRequest, 'sentInWindow'> {
  readonly userId: string;
}

export interface DispatchDeps {
  readonly store: AlertOutboxStore;
  readonly transportFor: (recipient: string) => AlertTransport;
  readonly nowSeconds: () => number;
  /** Bound on attempts per row; undetermined in the design, so the caller passes it. */
  readonly maxAttempts: number;
}

export type DispatchOutcome =
  | ReturnType<typeof decideAlert>
  | { readonly action: 'duplicate'; readonly status: 'sent' }
  | { readonly action: 'exhausted'; readonly attempts: number }
  | { readonly action: 'sent' }
  | { readonly action: 'failed'; readonly attempts: number };

export async function dispatchUserAlert(
  env: AlertEnv,
  req: DispatchRequest,
  deps: DispatchDeps,
  windowSeconds: number = 24 * 60 * 60,
): Promise<DispatchOutcome> {
  const sentInWindow =
    ALERT_SPECS[req.kind].class === 'optional'
      ? await deps.store.sentInWindow(req.userId, deps.nowSeconds(), windowSeconds)
      : 0;
  const decision = decideAlert(env, { ...req, sentInWindow });
  if (decision.action !== 'send') return decision;

  const row = await deps.store.claim({
    userId: req.userId,
    eventId: req.eventId,
    kind: req.kind,
    severity: req.notification.severity,
  });
  if (row.status === 'sent') return { action: 'duplicate', status: 'sent' };
  if (row.attempts >= deps.maxAttempts) return { action: 'exhausted', attempts: row.attempts };

  await deps.store.beginAttempt(req.userId, req.eventId);
  try {
    const result = await deps.transportFor(req.recipient).deliver(req.notification, req.eventId);
    await deps.store.markSent(req.userId, req.eventId, resendId(result));
    return { action: 'sent' };
  } catch {
    // F16: the caller logs this without the address (docs/PH2-E4-05-FAILURE-MODES.md).
    await deps.store.markFailed(req.userId, req.eventId);
    return { action: 'failed', attempts: row.attempts + 1 };
  }
}

function resendId(result: unknown): string | undefined {
  if (result && typeof result === 'object' && 'id' in result) {
    const id = (result as { id: unknown }).id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

/**
 * F10 signal 2 (PM, 2026-10-29): the user email goes out only when the tick
 * after a drop is still <= the ledger from before the drop. One event id per
 * confirmed drop, so later ticks collapse onto the same outbox row.
 */
export function testnetResetUserEvents(ticks: readonly TickFact[]): string[] {
  const s = testnetResetSignal(ticks);
  if (!s.userEmail) return [];
  return s.confirmed.map((c) => `f10-testnet-reset:${c.from}->${c.to}`);
}

/** In-memory outbox for tests only; `sentInWindow` ignores the window. */
export function memoryOutboxStore(): AlertOutboxStore & { rows: Map<string, OutboxRow> } {
  const rows = new Map<string, OutboxRow>();
  const k = (u: string, e: string) => `${u}\u0000${e}`;
  const get = (u: string, e: string) => {
    const r = rows.get(k(u, e));
    if (!r) throw new Error('outbox row missing');
    return r;
  };
  return {
    rows,
    async claim(r) {
      const existing = rows.get(k(r.userId, r.eventId));
      if (existing) return existing;
      const row: OutboxRow = { ...r, status: 'pending', attempts: 0 };
      rows.set(k(r.userId, r.eventId), row);
      return row;
    },
    async beginAttempt(u, e) {
      const r = get(u, e);
      rows.set(k(u, e), { ...r, attempts: r.attempts + 1 });
    },
    async markSent(u, e, id) {
      const r = get(u, e);
      rows.set(k(u, e), { ...r, status: 'sent', resendEmailId: id });
    },
    async markFailed(u, e) {
      rows.set(k(u, e), { ...get(u, e), status: 'failed' });
    },
    async sentInWindow(u) {
      return [...rows.values()].filter(
        (r) => r.userId === u && r.status === 'sent' && ALERT_SPECS[r.kind].class === 'optional',
      ).length;
    },
  };
}
