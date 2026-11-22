/**
 * PH2-E2-06 per-user alert email templates (docs/PH2-E2-06-ALERTS-DESIGN.md §3):
 * one plain-text body and one simple HTML body per `AlertKind`. Pure: no
 * clock, no transport. Wording states only what the event says; values the
 * caller does not know are rendered as "undetermined", never invented.
 */
import { assessEntry } from '@evergreen-stellar/core';
import type { LedgerEntryTTL } from '@evergreen-stellar/shared-types';
import { canUnsubscribe, type AlertKind } from './policy.js';
import type { AlertNotification } from './sender.js';

export interface AlertContext {
  /** Contract id or entry label as shown on the dashboard. */
  readonly entry: string;
  readonly network: 'testnet' | 'mainnet';
  /** Free-form fact from the caller (reason, amount, ledger); optional. */
  readonly detail?: string | undefined;
  /** Dashboard link; defaults to the watchlist path only. */
  readonly dashboardUrl?: string | undefined;
  /**
   * Absolute URL of `/dashboard/alerts/`. Optional alerts link it. Required
   * alerts do not: they cannot be turned off.
   */
  readonly preferencesUrl?: string | undefined;
  /**
   * Absolute RFC 8058 one-click URL. Optional alerts put it in
   * `List-Unsubscribe`. Required alerts ignore it. Never a `mailto:`.
   */
  readonly unsubscribeUrl?: string | undefined;
  /**
   * Ledger observation for `approaching_critical`. Other kinds ignore it.
   * Severity is `assessEntry` on `entry` and `thresholdLedgers`: an expired
   * entry is critical, and a shared or temporary entry is critical only when
   * remaining ledgers are at or below the threshold. A lone recoverable entry
   * stays a warning. A send of `approaching_critical` requires this. Omitting
   * it does not render the copy's `warn`.
   */
  readonly approaching?: ApproachingObservation | undefined;
}

/** Entry and threshold `assessEntry` grades for an approaching alert. */
export interface ApproachingObservation {
  readonly entry: LedgerEntryTTL;
  readonly thresholdLedgers: number;
}

export interface AlertEmail extends AlertNotification {
  readonly html: string;
}

type Severity = AlertNotification['severity'];

const COPY: Readonly<Record<AlertKind, { subject: string; lead: string; severity: Severity }>> = {
  preflight_failed: {
    subject: 'Autopilot did not run for {entry}',
    lead: 'The pre-flight check failed, so nothing was pulled from your wallet and the entry was not extended.',
    severity: 'warn',
  },
  allowance_missing: {
    subject: 'Autopilot is stopped for {entry}: allowance missing or used up',
    lead: 'Your allowance is missing, expired, or its 30-day budget is used up. Autopilot cannot extend this entry until you approve a new allowance.',
    severity: 'warn',
  },
  allowance_expiring: {
    subject: 'Allowance for {entry} is about to expire',
    lead: 'The allowance autopilot uses for {entry} is about to expire. Renew it to keep autopilot running.',
    severity: 'info',
  },
  extend_failed_refund: {
    subject: 'Extend failed for {entry}: full refund under way',
    lead: 'The extend failed after the pull. The whole pull, fee included, is being refunded. The entry is still not protected.',
    severity: 'critical',
  },
  refund_delayed: {
    subject: 'Your refund for {entry} is delayed',
    lead: 'A refund owed to you is delayed. It is still owed and will be sent to your wallet.',
    severity: 'critical',
  },
  unexplained_charge: {
    subject: 'Unexplained charge on your wallet for {entry}',
    lead: 'Reconciliation found a difference between what Evergreen recorded and what the chain shows for your wallet.',
    severity: 'critical',
  },
  testnet_reset: {
    subject: 'Testnet was reset: protection state for {entry} was reset',
    lead: 'The Stellar testnet appears to have been reset. Protection state for this entry starts over.',
    severity: 'warn',
  },
  restore_lost_changes: {
    subject: 'A restore may have lost recent changes for {entry}',
    lead: 'Evergreen data was restored from a backup. Recent changes for this entry may be missing; which ones is undetermined.',
    severity: 'warn',
  },
  approaching_critical: {
    subject: '{entry} is approaching expiry',
    lead: 'This entry is approaching its expiry and autopilot is off for it. Extend it, or turn autopilot on.',
    // Not a send path. `severityFor` uses `assessEntry` and throws if the
    // observation is missing, so this literal is never the rendered severity.
    severity: 'warn',
  },
  extend_succeeded: {
    subject: 'Extended: {entry}',
    lead: 'Autopilot extended this entry. This is your receipt.',
    severity: 'info',
  },
};

/** One line; refuses CR/LF so a caller value cannot inject a header. */
function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * An absolute https URL safe to place in a body and in `List-Unsubscribe`.
 * Anything else (including `mailto:` and `http:`) is dropped.
 */
function httpsLink(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0 || value.length > 2048) return undefined;
  // Whitespace, quotes and brackets would break a header or an href.
  if (!/^https:\/\/[^\s<>"'\\]+$/.test(value)) return undefined;
  if (value.toLowerCase().includes('mailto:')) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  if (url.username !== '' || url.password !== '') return undefined;
  // Embed the caller string only when it is already the canonical href.
  if (url.href !== value) return undefined;
  return value;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Email severity for an approaching entry. `critical` only when `assessEntry`
 * says so; `warning`, `healthy` and `unknown` are `warn` on this channel,
 * which has no fourth grade. The threshold comparison stays in `assessEntry`.
 */
function severityForApproaching(entry: LedgerEntryTTL, thresholdLedgers: number): Severity {
  return assessEntry(entry, thresholdLedgers).health === 'critical' ? 'critical' : 'warn';
}

function severityFor(kind: AlertKind, ctx: AlertContext, fallback: Severity): Severity {
  if (kind !== 'approaching_critical') return fallback;
  if (ctx.approaching === undefined) {
    throw new Error('approaching_critical requires ctx.approaching');
  }
  return severityForApproaching(ctx.approaching.entry, ctx.approaching.thresholdLedgers);
}

/**
 * `approaching_critical` requires `ctx.approaching`. Other kinds do not.
 * A missing observation is a caller bug, not severity `warn`.
 */
export function renderAlertEmail<K extends AlertKind>(
  kind: K,
  ctx: K extends 'approaching_critical'
    ? AlertContext & { readonly approaching: ApproachingObservation }
    : AlertContext,
): AlertEmail {
  const c = COPY[kind];
  const entry = oneLine(ctx.entry) || 'undetermined';
  const fill = (t: string) => t.replace(/\{entry\}/g, entry);
  const subject = oneLine(`[${ctx.network}] ${fill(c.subject)}`);
  const lead = fill(c.lead);
  const detail = ctx.detail === undefined ? undefined : oneLine(ctx.detail);
  const url = ctx.dashboardUrl;
  const optional = canUnsubscribe(kind);
  // Required alerts never carry an opt-out link or a one-click header, even
  // if a caller passed the URLs.
  const preferences = optional ? httpsLink(ctx.preferencesUrl) : undefined;
  const unsubscribe = optional ? httpsLink(ctx.unsubscribeUrl) : undefined;
  const footer = optional
    ? preferences === undefined
      ? 'You can turn this alert off in your Evergreen alert preferences.'
      : `You can turn this alert off in your Evergreen alert preferences: ${preferences}`
    : 'This alert is required for autopilot users and cannot be turned off.';
  const headers =
    unsubscribe === undefined
      ? undefined
      : {
          'List-Unsubscribe': `<${unsubscribe}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        };

  const text = [
    lead,
    '',
    `Entry: ${entry}`,
    `Network: ${ctx.network}`,
    ...(detail ? [`Details: ${detail}`] : []),
    ...(url ? ['', `Open your watchlist: ${url}`] : []),
    '',
    footer,
    ...(unsubscribe === undefined
      ? []
      : [
          '',
          'The one-click unsubscribe in this message turns off every optional alert. Required alerts stay on.',
        ]),
  ].join('\n');

  const html = [
    '<!doctype html><html><body style="font-family:sans-serif;line-height:1.5">',
    `<p>${escapeHtml(lead)}</p>`,
    '<ul>',
    `<li>Entry: <code>${escapeHtml(entry)}</code></li>`,
    `<li>Network: ${escapeHtml(ctx.network)}</li>`,
    ...(detail ? [`<li>Details: ${escapeHtml(detail)}</li>`] : []),
    '</ul>',
    ...(url ? [`<p><a href="${escapeHtml(url)}">Open your watchlist</a></p>`] : []),
    ...(preferences === undefined
      ? []
      : [`<p><a href="${escapeHtml(preferences)}">Alert preferences</a></p>`]),
    `<p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>`,
    '</body></html>',
  ].join('');

  return {
    subject,
    body: text,
    html,
    severity: severityFor(kind, ctx as AlertContext, c.severity),
    ...(headers === undefined ? {} : { headers }),
  };
}

export const ALERT_TEMPLATE_KINDS: readonly AlertKind[] = Object.keys(COPY) as AlertKind[];

/**
 * Compile-time witness: `renderAlertEmail('approaching_critical', …)` requires
 * the observation. `pnpm typecheck` fails if that argument becomes optional.
 */
type ApproachingCallRequiresObservation = Parameters<
  typeof renderAlertEmail<'approaching_critical'>
>[1] extends { readonly approaching: ApproachingObservation }
  ? true
  : false;

export const approachingCallRequiresObservation: ApproachingCallRequiresObservation = true;
