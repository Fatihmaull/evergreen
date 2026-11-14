/**
 * Postgres `AlertOutboxStore` and alert preferences over migration 0011 (`alert_outbox`,
 * `alert_preferences`; PH2-E2-06, docs/PH2-E2-06-ALERTS-DESIGN.md §2, §5, §7), through the same
 * `SqlClient` the auth and watchlist stores use, so tests swap in a fake or PGlite with no network.
 *
 * Written for the **`eg_api` role** (the API Worker sends alerts; 0011 grants `eg_scheduler`
 * nothing here), whose grants are exactly: SELECT on both tables; INSERT
 * `(user_id, event_id, kind, severity)` on the outbox; UPDATE
 * `(status, attempts, resend_email_id, last_attempt_at, sent_at)` on the outbox; INSERT
 * `(user_id, kind, enabled, updated_at)` and UPDATE `(enabled, updated_at)` on preferences. **No
 * DELETE anywhere**, so "reset a preference" is an UPDATE back to the default, never a delete.
 *
 * Facts about 0011 these statements rely on:
 * - `UNIQUE (user_id, event_id)` is the dedupe. `INSERT ... ON CONFLICT DO NOTHING` returns no row
 *   on a conflict, so `claim` reads the row back in a second statement.
 * - `status`, `attempts`, `created_at` take their defaults on insert, so a row is born `pending`
 *   with 0 attempts and cannot be inserted as `sent`.
 * - `CHECK (status <> 'sent' OR sent_at IS NOT NULL)`: `markSent` sets both together. The 24-hour
 *   cap on optional alerts counts `sent_at`, so a sent row without it would escape the cap.
 * - `attempts` is capped at 10 by a CHECK; the dispatcher stops at 3.
 */
import type { SqlClient, SqlRow } from '../auth/pg-store.js';
import type { AlertOutboxStore, OutboxRow, OutboxStatus } from './dispatch.js';
import { ALERT_SPECS, isRequired, type AlertKind } from './policy.js';
import type { AlertPreferencesStore } from './preferences.js';

/**
 * The optional kinds as a SQL list, built from the code's own constants (never from input), so the
 * 24-hour cap counts exactly the kinds `ALERT_SPECS` calls optional and the driver sees no array.
 */
const OPTIONAL_KINDS_SQL: string = (Object.keys(ALERT_SPECS) as AlertKind[])
  .filter((kind) => !isRequired(kind))
  .map((kind) => `'${kind}'`)
  .join(', ');

const STATUSES: ReadonlySet<string> = new Set<OutboxStatus>(['pending', 'sent', 'failed']);

function toRow(userId: string, eventId: string, r: SqlRow): OutboxRow {
  const status = String(r['status']);
  if (!STATUSES.has(status)) throw new Error('Unexpected alert outbox status.');
  const resend = r['resend_email_id'];
  const last = r['last_attempt_epoch'];
  return {
    userId,
    eventId,
    kind: String(r['kind']) as AlertKind,
    severity: String(r['severity']) as OutboxRow['severity'],
    status: status as OutboxStatus,
    attempts: Number(r['attempts']),
    resendEmailId: resend === null || resend === undefined ? undefined : String(resend),
    lastAttemptAt: last === null || last === undefined ? undefined : Number(last),
  };
}

export class PgAlertOutboxStore implements AlertOutboxStore {
  constructor(private readonly sql: SqlClient) {}

  /** The row for (user, event), inserting a `pending` one first if there is none. */
  async claim(row: {
    userId: string;
    eventId: string;
    kind: AlertKind;
    severity: OutboxRow['severity'];
  }): Promise<OutboxRow> {
    await this.sql.query(
      `INSERT INTO alert_outbox (user_id, event_id, kind, severity)
VALUES ($1::uuid, $2, $3, $4)
ON CONFLICT (user_id, event_id) DO NOTHING`,
      [row.userId, row.eventId, row.kind, row.severity],
    );
    const rows = await this.sql.query(
      `SELECT kind, severity, status, attempts, resend_email_id,
  extract(epoch FROM last_attempt_at)::bigint AS last_attempt_epoch
FROM alert_outbox WHERE user_id = $1::uuid AND event_id = $2`,
      [row.userId, row.eventId],
    );
    const found = rows[0];
    if (found === undefined) throw new Error('Alert outbox row missing after claim.');
    return toRow(row.userId, row.eventId, found);
  }

  /** Counts the attempt before the send, so a crash mid-send is still counted. */
  async beginAttempt(userId: string, eventId: string, nowSeconds: number): Promise<void> {
    await this.mustChange(
      `UPDATE alert_outbox SET attempts = attempts + 1, last_attempt_at = to_timestamp($3)
WHERE user_id = $1::uuid AND event_id = $2 RETURNING 1 AS changed`,
      [userId, eventId, nowSeconds],
    );
  }

  async markSent(
    userId: string,
    eventId: string,
    resendEmailId: string | undefined,
  ): Promise<void> {
    await this.mustChange(
      `UPDATE alert_outbox SET status = 'sent', sent_at = now(), resend_email_id = $3
WHERE user_id = $1::uuid AND event_id = $2 RETURNING 1 AS changed`,
      [userId, eventId, resendEmailId ?? null],
    );
  }

  /** Never turns a `sent` row back into `failed`: a late failure cannot undo a delivery. */
  async markFailed(userId: string, eventId: string): Promise<void> {
    await this.sql.query(
      `UPDATE alert_outbox SET status = 'failed'
WHERE user_id = $1::uuid AND event_id = $2 AND status <> 'sent'`,
      [userId, eventId],
    );
  }

  /** Optional alerts sent to this user in the last `windowSeconds` (§5). Required kinds never count. */
  async sentInWindow(userId: string, nowSeconds: number, windowSeconds: number): Promise<number> {
    const rows = await this.sql.query(
      `SELECT count(*)::int AS n FROM alert_outbox
WHERE user_id = $1::uuid AND status = 'sent' AND kind IN (${OPTIONAL_KINDS_SQL})
  AND sent_at > to_timestamp($2) - $3 * interval '1 second'`,
      [userId, nowSeconds, windowSeconds],
    );
    return Number(rows[0]?.['n'] ?? 0);
  }

  private async mustChange(text: string, params: readonly unknown[]): Promise<void> {
    const rows = await this.sql.query(text, params);
    if (rows.length === 0) throw new Error('Alert outbox row missing.');
  }
}

const PREFERENCE_UPSERT = `INSERT INTO alert_preferences (user_id, kind, enabled, updated_at)
VALUES ($1::uuid, $2, $3, to_timestamp($4))
ON CONFLICT (user_id, kind) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`;

/** The user's choices for the optional kinds. A missing row means the kind's default. */
export class PgAlertPreferencesStore implements AlertPreferencesStore {
  constructor(private readonly sql: SqlClient) {}

  /** Only the kinds the user has set; pass it to `wantsAlert` / `dispatchUserAlert` as `prefs`. */
  async get(userId: string): Promise<Partial<Record<AlertKind, boolean>>> {
    const rows = await this.sql.query(
      'SELECT kind, enabled FROM alert_preferences WHERE user_id = $1::uuid',
      [userId],
    );
    const prefs: Partial<Record<AlertKind, boolean>> = {};
    for (const r of rows) prefs[String(r['kind']) as AlertKind] = r['enabled'] === true;
    return prefs;
  }

  /** Sets one optional kind. A required kind is refused here and again by the table's CHECK. */
  async set(userId: string, kind: AlertKind, enabled: boolean, nowSeconds: number): Promise<void> {
    this.optional(kind);
    await this.sql.query(PREFERENCE_UPSERT, [userId, kind, enabled, nowSeconds]);
  }

  /**
   * Every optional kind, `enabled = false`, in one `SqlClient.transaction`.
   * `eg_api` already has INSERT and UPDATE on these columns (migration 0011).
   * No new grant and no DELETE. A required kind is not in the list.
   */
  async disableOptional(userId: string, nowSeconds: number): Promise<void> {
    const kinds = (Object.keys(ALERT_SPECS) as AlertKind[]).filter((kind) => !isRequired(kind));
    await this.sql.transaction(
      kinds.map((kind) => ({
        text: PREFERENCE_UPSERT,
        params: [userId, kind, false, nowSeconds],
      })),
    );
  }

  /**
   * Back to the kind's default. An UPDATE to `defaultOn`, never a DELETE (`eg_api` has none), so
   * the row stays and says what the default was when the user reset it. No row means already default.
   */
  async reset(userId: string, kind: AlertKind, nowSeconds: number): Promise<void> {
    this.optional(kind);
    await this.sql.query(
      `UPDATE alert_preferences SET enabled = $3, updated_at = to_timestamp($4)
WHERE user_id = $1::uuid AND kind = $2`,
      [userId, kind, ALERT_SPECS[kind].defaultOn, nowSeconds],
    );
  }

  private optional(kind: AlertKind): void {
    if (isRequired(kind)) throw new RangeError('A required alert has no preference.');
  }
}
