/**
 * PH2-E2-06 alert preferences (docs/PH2-E2-06-ALERTS-DESIGN.md §6,
 * docs/API.md §6a). Pure: no clock, no transport, no SQL. The Postgres store
 * is `PgAlertPreferencesStore`; routes take this interface so tests use a
 * memory store. Email never authorises anything that moves XLM: a preference
 * is a boolean, and this module does not send mail or build a transaction.
 */
import { ALERT_SPECS, isRequired, wantsAlert, type AlertClass, type AlertKind } from './policy.js';

/** What `GET`/`PATCH /me/alert-preferences` read and write. */
export interface AlertPreferencesStore {
  /** Only the kinds the user has a row for. A missing kind means the default. */
  get(userId: string): Promise<Partial<Record<AlertKind, boolean>>>;
  /** Sets one optional kind. The route refuses a required kind before this. */
  set(userId: string, kind: AlertKind, enabled: boolean, nowSeconds: number): Promise<void>;
  /**
   * Back to the kind's default. An update of the existing row, never a delete
   * (`eg_api` has no DELETE). No row means the kind is already at its default.
   */
  reset(userId: string, kind: AlertKind, nowSeconds: number): Promise<void>;
  /**
   * Turns every optional kind off. The Postgres store sends the three writes
   * in one database transaction. This is not a ledger transaction and moves
   * no XLM. Required kinds are not written.
   */
  disableOptional(userId: string, nowSeconds: number): Promise<void>;
}

export interface PreferenceItem {
  readonly kind: AlertKind;
  readonly class: AlertClass;
  readonly enabled: boolean;
  readonly defaultOn: boolean;
  /** True only for an optional kind the user has a row for. Required kinds are never stored. */
  readonly stored: boolean;
}

const KINDS = Object.keys(ALERT_SPECS) as AlertKind[];

/**
 * The full list, in `ALERT_SPECS` order. `enabled` goes through `wantsAlert`,
 * so a stored `false` on a required kind cannot turn it off.
 */
export function preferenceItems(
  stored: Readonly<Partial<Record<AlertKind, boolean>>>,
): PreferenceItem[] {
  return KINDS.map((kind) => {
    const spec = ALERT_SPECS[kind];
    return {
      kind,
      class: spec.class,
      enabled: wantsAlert(kind, stored),
      defaultOn: spec.defaultOn,
      stored: spec.class === 'optional' && Object.hasOwn(stored, kind),
    };
  });
}

export type PreferenceWrite =
  | { readonly action: 'set'; readonly kind: AlertKind; readonly enabled: boolean }
  | { readonly action: 'reset'; readonly kind: AlertKind };

export interface PreferenceRefusal {
  readonly ok: false;
  readonly status: 400 | 422;
  readonly field: string;
  readonly message: string;
}

export type ParsedPreference =
  { readonly ok: true; readonly value: PreferenceWrite } | PreferenceRefusal;

const refuse = (status: 400 | 422, field: string, message: string): PreferenceRefusal => ({
  ok: false,
  status,
  field,
  message,
});

function isKind(value: string): value is AlertKind {
  return Object.hasOwn(ALERT_SPECS, value);
}

/**
 * `PATCH` body: `{ kind, enabled }` or `{ kind, reset: true }`, and nothing
 * else. A required kind is well-formed and refused (422): it cannot be stored.
 * The sent value is never copied into the message.
 */
export function parsePreferencePatch(body: unknown): ParsedPreference {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return refuse(400, 'body', 'Body must be a JSON object.');
  }
  const obj = body as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key !== 'kind' && key !== 'enabled' && key !== 'reset') {
      return refuse(400, key, 'Unknown field.');
    }
  }
  const hasEnabled = Object.hasOwn(obj, 'enabled');
  const hasReset = Object.hasOwn(obj, 'reset');
  if (hasEnabled === hasReset) {
    return refuse(400, 'body', 'Send enabled or reset, not both.');
  }
  const kind = obj['kind'];
  if (typeof kind !== 'string' || !isKind(kind)) {
    return refuse(400, 'kind', 'kind must be an alert kind.');
  }
  if (hasReset && obj['reset'] !== true) {
    return refuse(400, 'reset', 'reset must be true.');
  }
  if (hasEnabled && typeof obj['enabled'] !== 'boolean') {
    return refuse(400, 'enabled', 'enabled must be a boolean.');
  }
  if (isRequired(kind)) {
    return refuse(422, 'kind', 'This alert is required and cannot be turned off.');
  }
  if (hasReset) return { ok: true, value: { action: 'reset', kind } };
  return { ok: true, value: { action: 'set', kind, enabled: obj['enabled'] === true } };
}
