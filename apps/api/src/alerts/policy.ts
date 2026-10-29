/**
 * PH2-E2-06 per-user alerts: the pure decisions that need no schema
 * (docs/PH2-E2-06-ALERTS-DESIGN.md §3, §5, §6). No transport, no clock, no
 * storage. The outbox and the preferences store are Rakha's schema (§7) and
 * are NOT here; callers pass in what those would hold.
 */

/** `ALERTS_SEND` (§6): sending is on only for exactly `send`, byte for byte. */
export type AlertsMode = 'dry-run' | 'send';

export function alertsMode(value: string | undefined): AlertsMode {
  // No trim, no case folding: `SEND`, ` send`, `send ` and `Send` are dry-run.
  return value === 'send' ? 'send' : 'dry-run';
}

/**
 * `ALERTS_ALLOWLIST` (§6, Stage B): a Worker secret (it holds email
 * addresses, docs/ops/secrets.md); never log or echo it. Comma-separated. Entries
 * are trimmed of surrounding whitespace; the recipient must match an entry
 * exactly (no case folding), so a near-miss stays dry-run. Unset or empty
 * means nobody is allowlisted.
 */
export function parseAllowlist(value: string | undefined): ReadonlySet<string> {
  if (value === undefined) return new Set();
  return new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

export function isAllowlisted(allowlist: ReadonlySet<string>, recipient: string): boolean {
  return allowlist.has(recipient);
}

/** §3 events. Each maps to a PH2-E4-05 mode, or `null` for product alerts. */
export type AlertKind =
  | 'preflight_failed'
  | 'allowance_missing'
  | 'allowance_expiring'
  | 'extend_failed_refund'
  | 'refund_delayed'
  | 'unexplained_charge'
  | 'testnet_reset'
  | 'restore_lost_changes'
  | 'approaching_critical'
  | 'extend_succeeded';

export type AlertClass = 'required' | 'optional';

export interface AlertSpec {
  readonly mode: 'F1' | 'F2' | 'F4' | 'F6' | 'F7' | 'F10' | 'F19' | null;
  readonly class: AlertClass;
  /** Only meaningful for optional alerts; required ones are never stored. */
  readonly defaultOn: boolean;
}

export const ALERT_SPECS: Readonly<Record<AlertKind, AlertSpec>> = {
  preflight_failed: { mode: 'F1', class: 'required', defaultOn: true },
  allowance_missing: { mode: 'F2', class: 'required', defaultOn: true },
  allowance_expiring: { mode: 'F2', class: 'optional', defaultOn: true },
  extend_failed_refund: { mode: 'F4', class: 'required', defaultOn: true },
  refund_delayed: { mode: 'F6', class: 'required', defaultOn: true },
  unexplained_charge: { mode: 'F7', class: 'required', defaultOn: true },
  testnet_reset: { mode: 'F10', class: 'required', defaultOn: true },
  restore_lost_changes: { mode: 'F19', class: 'required', defaultOn: true },
  approaching_critical: { mode: null, class: 'optional', defaultOn: true },
  // Default ON decided by Tih, 2026-10-29; still optional (§3).
  extend_succeeded: { mode: null, class: 'optional', defaultOn: true },
};

export const isRequired = (kind: AlertKind): boolean => ALERT_SPECS[kind].class === 'required';

/** One-click unsubscribe (RFC 8058) is for optional alerts only (§6). */
export const canUnsubscribe = (kind: AlertKind): boolean => !isRequired(kind);

/**
 * Whether the user wants this alert. `prefs` holds only optional kinds the
 * user has set; a required kind ignores prefs entirely.
 */
export function wantsAlert(
  kind: AlertKind,
  prefs: Readonly<Partial<Record<AlertKind, boolean>>>,
): boolean {
  if (isRequired(kind)) return true;
  return prefs[kind] ?? ALERT_SPECS[kind].defaultOn;
}

/**
 * Per-user cap (§5). UNDETERMINED: the design doc leaves N and the window
 * open (Fatih's call). These are named placeholders, not a justified value.
 */
export const ALERT_RATE_LIMIT_UNDETERMINED = {
  maxOptionalPerWindow: 3,
  windowSeconds: 24 * 60 * 60,
} as const;

export type RateDecision =
  { readonly allow: true } | { readonly allow: false; readonly reason: 'rate_limited' };

/**
 * `sentInWindow` counts alerts already sent to this user in the current
 * window (from the outbox, once it exists). Required alerts always pass.
 */
export function rateDecision(
  kind: AlertKind,
  sentInWindow: number,
  max: number = ALERT_RATE_LIMIT_UNDETERMINED.maxOptionalPerWindow,
): RateDecision {
  if (isRequired(kind)) return { allow: true };
  return sentInWindow < max ? { allow: true } : { allow: false, reason: 'rate_limited' };
}
