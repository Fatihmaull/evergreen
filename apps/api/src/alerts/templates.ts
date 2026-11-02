/**
 * PH2-E2-06 per-user alert email templates (docs/PH2-E2-06-ALERTS-DESIGN.md §3):
 * one plain-text body and one simple HTML body per `AlertKind`. Pure: no
 * clock, no transport. Wording states only what the event says; values the
 * caller does not know are rendered as "undetermined", never invented.
 */
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAlertEmail(kind: AlertKind, ctx: AlertContext): AlertEmail {
  const c = COPY[kind];
  const entry = oneLine(ctx.entry) || 'undetermined';
  const fill = (t: string) => t.replace(/\{entry\}/g, entry);
  const subject = oneLine(`[${ctx.network}] ${fill(c.subject)}`);
  const lead = fill(c.lead);
  const detail = ctx.detail === undefined ? undefined : oneLine(ctx.detail);
  const url = ctx.dashboardUrl;
  const footer = canUnsubscribe(kind)
    ? 'You can turn this alert off in your Evergreen alert preferences.'
    : 'This alert is required for autopilot users and cannot be turned off.';

  const text = [
    lead,
    '',
    `Entry: ${entry}`,
    `Network: ${ctx.network}`,
    ...(detail ? [`Details: ${detail}`] : []),
    ...(url ? ['', `Open your watchlist: ${url}`] : []),
    '',
    footer,
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
    `<p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>`,
    '</body></html>',
  ].join('');

  return { subject, body: text, html, severity: c.severity };
}

export const ALERT_TEMPLATE_KINDS: readonly AlertKind[] = Object.keys(COPY) as AlertKind[];
