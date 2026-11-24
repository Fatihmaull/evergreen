/**
 * The alert-preferences screen (web-reference/design-language/components.md
 * § Alert preferences). Copy only. No request leaves this file.
 *
 * 15 Nov 2026 copy. Nothing here picks a send.
 *
 * - persistent expiry: 1 day is the rule; about 17,280 ledgers is the
 *   estimate at 5 seconds a ledger
 * - allowance: 30, 7 and 1 days are the rule; the ledger counts are the estimate
 * - temporary entries: no email during beta, and no switch
 * - a close other than 5 seconds stays undetermined
 * - event ids: not shown
 * - how often a saved choice is checked: not a number; the page only stores
 * - sender address: not printed
 * - `ALERTS_SEND`: the sending line stays unknown. There is no dashboard read
 * - inbox delivery: accepted is not received, and this page lists no outbox
 * - other channels: email is the channel on this page; none other is offered
 */
import type {
  AlertKindName,
  OptionalKind,
  PreferenceItem,
  PreferenceRead,
} from './alert-preferences';
import { OPTIONAL_ORDER, REQUIRED_ORDER } from './alert-preferences';

/** Matches `DEFAULT_CRITICAL_LEDGERS`. The test locks the equality. */
export const APPROACHING_AT_OR_BELOW_LEDGERS = 17_280;
/**
 * 30, 7 and 1 days × 86,400 ÷ 5. 518,400 is not a protocol constant and is
 * not `DEFAULT_WARN_LEDGERS`.
 */
export const ALLOWANCE_LEAD_LEDGERS = [518_400, 120_960, 17_280] as const;
/** `SECONDS_PER_LEDGER`. A display assumption, not a close-time guarantee. */
export const LEDGER_SECONDS_ASSUMED = 5;

const COUNT = new Intl.NumberFormat('en-US');

export function ledgerCount(n: number): string {
  return COUNT.format(n);
}

/**
 * Reversible default until `docs/API.md` documents a read of `ALERTS_SEND`.
 * The page passes this and nothing else.
 */
export const SENDING_FACT = 'unknown' as const;
export type SendingFact = typeof SENDING_FACT | 'off' | 'on';

export type EmailVerification = 'unknown' | 'not-verified' | 'confirmed';

export type WatchlistFact = 'pending' | 'empty' | 'named' | 'unread';

export const SAVING_WORD = 'saving…';
export const SAVED_TEXT = 'Saved.';
export const NOT_SAVED_TEXT = 'Not saved. The last saved choice still stands. Try again.';

const CHIP = {
  undetermined: '<span class="chip undetermined"><span class="shape"></span>undetermined</span>',
  warning: '<span class="chip warning"><span class="shape"></span>warning</span>',
  critical: '<span class="chip critical"><span class="shape"></span>critical</span>',
} as const;

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

const LEADS: Readonly<Record<AlertKindName, string>> = {
  allowance_expiring: `The allowance autopilot uses is about to expire. Reminders go out at 30, 7 and 1 days, about ${ALLOWANCE_LEAD_LEDGERS.map(ledgerCount).join(', ')} ledgers at ${LEDGER_SECONDS_ASSUMED} seconds a ledger. The days are the rule. The ledgers are the estimate. ${ledgerCount(518_400)} is that arithmetic, not a protocol constant. A close of about 6 seconds is undetermined. Nothing is sent until the expiry ledger is stored.`,
  approaching_critical: `Email when a persistent entry you watch is within 1 day of expiry and autopilot is off for it. About ${ledgerCount(APPROACHING_AT_OR_BELOW_LEDGERS)} ledgers, at ${LEDGER_SECONDS_ASSUMED} seconds a ledger. The day is the rule. The ledgers are the estimate. The email is warning, or critical when that entry is shared or already expired. A temporary entry is not emailed during beta. Nothing is sent until that ledger is stored.`,
  extend_succeeded:
    'Autopilot extended this entry. The email is a receipt of that extend. It is not a payment, and this page does not move XLM.',
  preflight_failed:
    'The pre-flight check failed, so nothing was pulled from your wallet and the entry was not extended.',
  allowance_missing:
    'Your allowance is missing, expired, or its 30-day budget is used up. Autopilot cannot extend this entry until you approve a new allowance.',
  extend_failed_refund:
    'The extend failed after the pull. The whole pull, fee included, is being refunded. The entry is still not protected.',
  refund_delayed:
    'A refund owed to you is delayed. It is still owed and will be sent to your wallet.',
  unexplained_charge:
    'Reconciliation found a difference between what Evergreen recorded and what the chain shows for your wallet.',
  testnet_reset:
    'The Stellar testnet appears to have been reset. Protection state for this entry starts over.',
  restore_lost_changes:
    'Evergreen data was restored from a backup. Recent changes for this entry may be missing; which ones is undetermined.',
};

const TITLES: Readonly<Record<AlertKindName, string>> = {
  allowance_expiring: 'Allowance about to expire',
  approaching_critical: 'Approaching expiry',
  extend_succeeded: 'Extend succeeded',
  preflight_failed: 'Pre-flight failed',
  allowance_missing: 'Allowance missing or used up',
  extend_failed_refund: 'Extend failed, refund under way',
  refund_delayed: 'Refund delayed',
  unexplained_charge: 'Unexplained charge',
  testnet_reset: 'Testnet reset',
  restore_lost_changes: 'Restore lost changes',
};

const REQUIRED_TONE: Readonly<Record<string, 'warning' | 'critical'>> = {
  preflight_failed: 'warning',
  allowance_missing: 'warning',
  extend_failed_refund: 'critical',
  refund_delayed: 'critical',
  unexplained_charge: 'critical',
  testnet_reset: 'warning',
  restore_lost_changes: 'warning',
};

export function watchlistNoteHtml(fact: WatchlistFact): string {
  if (fact === 'empty') {
    return '<p class="fine">Your watchlist is empty, so this alert has no entry to name. <a href="/dashboard/scanner/">Add a contract from the scanner</a>. An empty list is not a healthy contract.</p>';
  }
  if (fact === 'unread') {
    return `<p class="fine">${CHIP.undetermined} The watchlist could not be read, so this page does not say whether any entry would be named. That is undetermined.</p>`;
  }
  return '';
}

function sendingHtml(sending: SendingFact): string {
  if (sending === 'off') {
    return '<p class="fine"><span class="mark-incomplete" aria-hidden="true"></span> <span class="switch-word">not sending</span> Sending is off. Choices on this page are still saved. No email is sent, and no email sent is not health.</p>';
  }
  if (sending === 'on') {
    return '<p class="fine"><span class="switch-word" data-on="true">sending</span> Sending is on. An accepted send is not a received one. No mail in the inbox is not health.</p>';
  }
  return `<p class="fine">${CHIP.undetermined} Whether any alert email is being sent is undetermined. No mail in the inbox is not health.</p>`;
}

function emailHtml(address: string | null, verification: EmailVerification): string {
  if (address === null) {
    return `<p class="fine">${CHIP.undetermined} The address could not be read. Whether a later alert arrives is undetermined.</p>`;
  }
  const to = `<p class="email-to">${esc(address)}</p>`;
  if (verification === 'not-verified') {
    return `${to}<p class="fine">${CHIP.undetermined} This address has not been confirmed for alerts. Nothing here shows it as verified.</p>`;
  }
  if (verification === 'confirmed') {
    return `${to}<p class="fine">A sign-in code was accepted for this address. That does not confirm a later alert arrived.</p>`;
  }
  return `${to}<p class="fine">${CHIP.undetermined} A sign-in code was accepted for this address once. Whether a later alert arrives is undetermined.</p>`;
}

function switchHtml(kind: OptionalKind, enabled: boolean, title: string): string {
  return `<button type="button" class="alert-switch" role="switch" aria-checked="${enabled ? 'true' : 'false'}" aria-label="${esc(title)}" data-kind="${kind}"><span class="track" aria-hidden="true"><span class="knob"></span></span></button>`;
}

/** The short "when" beside each optional switch; the full rule is under "How alerts work". */
const WHEN: Readonly<Record<OptionalKind, string>> = {
  allowance_expiring: 'at 30, 7 and 1 days',
  approaching_critical: 'at 1 day, autopilot off',
  extend_succeeded: 'one email per extend',
};

function optionalRow(kind: OptionalKind, item: PreferenceItem, watchlist: WatchlistFact): string {
  const title = TITLES[kind];
  const extra =
    kind === 'approaching_critical'
      ? `<div class="pref-extra" data-watchlist-note>${watchlistNoteHtml(watchlist)}</div>`
      : '';
  return `<li class="pref-row" data-kind="${kind}">
      <span class="pref-title">${esc(title)}</span>
      <span class="note">${WHEN[kind]}</span>
      <span class="switch-word" data-word data-on="${item.enabled ? 'true' : 'false'}">${item.enabled ? 'on' : 'off'}</span>
      ${switchHtml(kind, item.enabled, title)}
      <span class="note pref-status" data-status></span>
      ${extra}
    </li>`;
}

function requiredRow(item: PreferenceItem): string {
  const tone = REQUIRED_TONE[item.kind] ?? 'warning';
  return `<li class="req-row" data-kind="${item.kind}">${CHIP[tone]} <span>${esc(TITLES[item.kind])}</span></li>`;
}

function leadHtml(kind: AlertKindName): string {
  const marks =
    kind === 'approaching_critical'
      ? ` ${CHIP.warning} ${CHIP.critical} Those marks are the email's severity, not this contract's health. One choice for every persistent entry you watch. There is no per-contract switch.`
      : '';
  return `<div><dt>${esc(TITLES[kind])}</dt><dd>${LEADS[kind]}${marks}</dd></div>`;
}

function byKind(items: readonly PreferenceItem[]): ReadonlyMap<AlertKindName, PreferenceItem> {
  return new Map(items.map((item) => [item.kind, item]));
}

export function alertsHtml(
  read: PreferenceRead | { readonly kind: 'reading' },
  options?: {
    readonly sending?: SendingFact;
    readonly emailVerification?: EmailVerification;
    readonly watchlist?: WatchlistFact;
  },
): string {
  if (read.kind === 'reading') {
    return '<p class="fine">reading…</p>';
  }
  if (read.kind === 'no-session') {
    return `<div class="panel note"><p>A preference belongs to a signed-in session, and this browser has none. Nothing is shown. <a href="/login/">Sign in</a>.</p><p class="fine">Signing in with email cannot move XLM.</p><p class="fine"><a href="/dashboard/scanner/">The scanner</a> needs no session.</p></div>`;
  }
  if (read.kind === 'unavailable') {
    return `<div class="panel undetermined"><p>${CHIP.undetermined} The Evergreen API did not answer, so there are no preferences to show. This says nothing about your contracts: it is about us.</p></div>`;
  }
  if (read.kind === 'upstream') {
    return `<div class="panel undetermined"><p>${CHIP.undetermined} The API answered, but could not complete this, so there are no preferences to show. This says nothing about your contracts: it is about us.</p></div>`;
  }
  if (read.kind === 'unreadable') {
    return `<div class="panel undetermined"><p>${CHIP.undetermined} The API answered, but not with preferences this page can read. We could not establish this.</p></div>`;
  }

  const sending = options?.sending ?? SENDING_FACT;
  const verification = options?.emailVerification ?? 'unknown';
  const watchlist = options?.watchlist ?? 'pending';
  const items = byKind(read.items);
  const optional = OPTIONAL_ORDER.map((kind) =>
    optionalRow(kind, items.get(kind) as PreferenceItem, watchlist),
  );
  const required = REQUIRED_ORDER.map((kind) => requiredRow(items.get(kind) as PreferenceItem));

  return `<dl class="kv wide-kv">
      <div><dt>Sent to</dt><dd>${read.email === null ? CHIP.undetermined : `<span class="mono email-to">${esc(read.email)}</span>`} · <a href="/login/">account</a></dd></div>
    </dl>
    <section class="block" aria-labelledby="opt-h">
      <div class="block-head"><h2 id="opt-h">You choose</h2></div>
      <p class="note">On unless you turn one off. A missing saved choice means on.</p>
      <ul class="toggles">${optional.join('')}</ul>
    </section>
    <section class="block" aria-labelledby="req-h">
      <div class="block-head"><h2 id="req-h">Always sent</h2></div>
      <p class="note">These alerts are required for autopilot users and cannot be turned off. The mark is the email's severity, not a contract's health.</p>
      <ul class="toggles fixed">${required.join('')}</ul>
    </section>
    <details class="block alerts-how">
      <summary>How alerts work</summary>
      <div class="stack">
        ${emailHtml(read.email, verification)}
        ${sendingHtml(sending)}
        <p class="fine">Which address a message would come from is undetermined.</p>
        <p class="fine">Email is the channel. No other channel is on this page.</p>
        <dl class="kv">${[...OPTIONAL_ORDER, ...REQUIRED_ORDER].map(leadHtml).join('')}</dl>
        <p class="fine">At most 5 optional emails are sent in 24 hours. Required emails are not counted in that 5.</p>
        <p class="fine">No alert email is not health. It can mean nothing happened, or that sending did not.</p>
        <p class="fine">A pull whose outcome is still unknown, and an extend that fails only for a while, have no email of their own. You hear the final outcome: the extend succeeded, the whole pull is being refunded, or the refund is delayed.</p>
        <p class="fine">How often a saved choice is checked for a send is undetermined. This page only stores the choice. It does not send mail.</p>
      </div>
    </details>`;
}
