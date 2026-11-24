/**
 * Extend now, option A (Fatih, 2026-11-24): the button queues one extend that
 * the hosted engine runs through the autopilot money path, so the XLM moves
 * the way every autopilot extend does: pull from the allowance, extend,
 * refund what was not used. It is never a wallet transaction from this page.
 *
 * The safeguards this side owns (docs/API.md § "POST /jobs as built"):
 *
 * - Offered only on the user's own watchlist rows with autopilot on, on
 *   testnet, while the API says the flag is on (`extendNow.enabled`).
 * - A confirmation with the estimate: simulated rent + Evergreen fee
 *   (core's `hostedFeeStroops`, max(2% of rent, 25,000 stroops)) + the retry margin,
 *   which is `pullAmountStroops`, the sum the engine pulls.
 * - Confirm is offered only when the payer's allowance to the engine is read
 *   and covers that sum. Unread is never "covered" (§9a). The engine's
 *   pre-flight re-checks the allowance and is the authority.
 * - One Idempotency-Key per confirmation, so a double click or a retry is the
 *   same job, never a second one. The API holds the 1-per-24-hours limit.
 *
 * Pure functions plus `requestExtendNow`, so every rule is tested without a
 * browser.
 */
import { pullAmountStroops, PROVISIONAL_HOSTED_FEE } from '../../../../packages/core/src/index';
import { apiRequest, type ApiOutcome, type FetchLike, type Me } from './api';
import { ALLOWANCE_RETRY_MARGIN_STROOPS } from './allowance-cap';
import type { ReadResult } from './allowance';
import { esc, exactXlm, formatCount, short } from './format';
import type { Row, WatchItem } from './watchlist-view';

/** Whether the panel offers the button, and if not, why. */
export type ExtendNowGate =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'used'; readonly resetsAt: Date | undefined }
  | { readonly kind: 'archived' }
  | { readonly kind: 'ready'; readonly payer: string };

export function extendNowGate(r: Row): ExtendNowGate {
  const { item } = r;
  const a = item.autopilot;
  const en = item.extendNow;
  if (
    en?.enabled !== true ||
    item.network !== 'testnet' ||
    a?.enabled !== true ||
    typeof a.payerWallet !== 'string'
  )
    return { kind: 'hidden' };
  if (r.binding.state === 'expired') return { kind: 'archived' };
  if (
    Number.isInteger(en.usedToday) &&
    Number.isInteger(en.limitPerDay) &&
    en.usedToday >= en.limitPerDay
  ) {
    const t = Date.parse(en.resetsAt);
    return { kind: 'used', resetsAt: Number.isFinite(t) ? new Date(t) : undefined };
  }
  return { kind: 'ready', payer: a.payerWallet };
}

const TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hourCycle: 'h23',
});

/** "24 Nov, 16:05 UTC". The reset is a moment, so it carries a time. */
export function resetTime(d: Date): string {
  return `${TIME.format(d)} UTC`;
}

/** The panel's Extend now block, or nothing. */
export function extendNowPanelHtml(r: Row): string {
  const g = extendNowGate(r);
  const id = esc(r.item.contractId);
  switch (g.kind) {
    case 'hidden':
      return '';
    case 'archived':
      return `<p class="panel-h">Extend now</p><p class="note">Archived entries must be restored before they can be extended.</p>`;
    case 'used':
      return `<p class="panel-h">Extend now</p>
    <div class="actions"><button type="button" disabled>Extend now</button></div>
    <p class="note">Used today. One Extend now per contract per 24 hours${
      g.resetsAt === undefined ? '' : `; available again after ${esc(resetTime(g.resetsAt))}`
    }.</p>`;
    case 'ready':
      return `<p class="panel-h">Extend now</p>
    <div class="actions"><button type="button" data-extend-now="${id}">Extend now</button></div>
    <p class="note">Runs one extend through autopilot, paid from your allowance. Once per 24 hours.</p>`;
  }
}

export interface ExtendNowEstimate {
  readonly rentStroops: bigint;
  readonly feeStroops: bigint;
  readonly marginStroops: bigint;
  /** What the engine pulls: rent + fee + margin. What is not used is refunded. */
  readonly totalStroops: bigint;
}

/** Undefined when this network has no retry margin: then there is no sum to confirm. */
export function estimateExtendNow(rentStroops: bigint): ExtendNowEstimate | undefined {
  const b = pullAmountStroops(
    { simulatedRentStroops: rentStroops, retryMarginStroops: ALLOWANCE_RETRY_MARGIN_STROOPS },
    PROVISIONAL_HOSTED_FEE,
  );
  if (b === undefined) return undefined;
  return {
    rentStroops: b.rentStroops,
    feeStroops: b.feeStroops,
    marginStroops: b.marginStroops,
    totalStroops: b.totalStroops,
  };
}

export type Coverage =
  | { readonly kind: 'covered'; readonly allowanceStroops: bigint }
  | { readonly kind: 'short'; readonly allowanceStroops: bigint }
  | { readonly kind: 'none' }
  | { readonly kind: 'unread' };

/** The payer's allowance to the engine against the pull. Unread is its own answer. */
export function coverage(total: bigint, read: ReadResult | undefined): Coverage {
  if (read === undefined || read.kind !== 'read') return { kind: 'unread' };
  let amount: bigint;
  try {
    amount = BigInt(read.raw.amountStroops);
  } catch {
    return { kind: 'unread' };
  }
  const { liveUntilLedger, observedAtLedger } = read.raw;
  if (amount <= 0n || liveUntilLedger === null || liveUntilLedger <= observedAtLedger)
    return { kind: 'none' };
  return amount >= total
    ? { kind: 'covered', allowanceStroops: amount }
    : { kind: 'short', allowanceStroops: amount };
}

export type DialogState =
  | { readonly phase: 'estimating' }
  | { readonly phase: 'no-estimate'; readonly why: string }
  | {
      readonly phase: 'confirm';
      readonly estimate: ExtendNowEstimate;
      readonly extendByLedgers: number;
      readonly payer: string;
      readonly coverage: Coverage;
      readonly sending?: boolean;
    }
  | { readonly phase: 'queued'; readonly jobId: string; readonly again: boolean }
  | { readonly phase: 'refused'; readonly text: string };

const money = (s: bigint): string => {
  const x = exactXlm(s);
  return `<span class="mono">${esc(x.xlm)}</span><span class="note"> · ${esc(x.stroops)}</span>`;
};

function coverageHtml(c: Coverage, payer: string): string {
  const who = `<span class="mono">${esc(short(payer, 4, 4))}</span>`;
  switch (c.kind) {
    case 'covered':
      return `<p class="note">Your allowance from ${who} has ${esc(exactXlm(c.allowanceStroops).xlm)} left, which covers this.</p>`;
    case 'short':
      return `<p class="warn-line">Your allowance from ${who} has ${esc(exactXlm(c.allowanceStroops).xlm)} left, less than this pull. <a href="/allowance/">Raise the allowance</a> first.</p>`;
    case 'none':
      return `<p class="warn-line">There is no live allowance from ${who} to the engine. <a href="/allowance/">Set one up</a> first.</p>`;
    case 'unread':
      return `<p class="warn-line">The allowance from ${who} could not be read, so we cannot confirm it covers this. Try again in a moment.</p>`;
  }
}

/** The dialog's body for each step. The title is the contract's name. */
export function extendNowDialogHtml(item: WatchItem, s: DialogState): string {
  const name = esc(item.label ?? short(item.contractId));
  const head = `<h2>Extend ${name} now?</h2>`;
  const cancel = `<button type="button" class="secondary" data-en-close>Cancel</button>`;
  switch (s.phase) {
    case 'estimating':
      return `${head}<p class="note" role="status">Simulating the rent of one extend…</p><div class="actions">${cancel}</div>`;
    case 'no-estimate':
      return `${head}<p class="warn-line">${esc(s.why)}</p><p class="note">Without an estimate Extend now is not offered. Autopilot still extends this contract on its own schedule.</p><div class="actions"><button type="button" class="secondary" data-en-close>Close</button></div>`;
    case 'confirm': {
      const e = s.estimate;
      const ok = s.coverage.kind === 'covered';
      return `${head}
  <p>Autopilot pulls this from your allowance, extends the contract by about <span class="mono">${esc(formatCount(s.extendByLedgers))}</span> ledgers, and refunds what is not used.</p>
  <dl class="kv">
    <div><dt>Rent</dt><dd>${money(e.rentStroops)}<br /><span class="note">simulated now; the chain charges the real rent</span></dd></div>
    <div><dt>Evergreen fee</dt><dd>${money(e.feeStroops)}</dd></div>
    <div><dt>Retry margin</dt><dd>${money(e.marginStroops)}<br /><span class="note">refunded if not used</span></dd></div>
    <div class="total"><dt>Pulled at most</dt><dd>${money(e.totalStroops)}</dd></div>
  </dl>
  ${coverageHtml(s.coverage, s.payer)}
  <p class="note">It is queued and runs within about 15 minutes. We email you when it is requested. One Extend now per contract per 24 hours.</p>
  <div class="actions"><button type="button" data-en-confirm${ok && s.sending !== true ? '' : ' disabled'}>${s.sending === true ? 'Queuing…' : 'Confirm Extend now'}</button>${cancel}</div>`;
    }
    case 'queued':
      return `<h2>Queued</h2>
  <p>${s.again ? 'This Extend now was already queued; nothing new was added.' : 'Extend now is queued.'} It runs within about 15 minutes, through autopilot. We sent you an email.</p>
  <div class="actions"><a class="pill" href="/dashboard/activity/?j=${encodeURIComponent(s.jobId)}">See it in Activity</a><button type="button" class="secondary" data-en-close>Close</button></div>`;
    case 'refused':
      return `${head}<p class="warn-line">${esc(s.text)}</p><div class="actions"><button type="button" class="secondary" data-en-close>Close</button></div>`;
  }
}

export interface QueuedJob {
  readonly id: string;
}

/** `POST /jobs` with the session's CSRF token and the dialog's one key. */
export async function requestExtendNow(
  contractId: string,
  idempotencyKey: string,
  fetchImpl?: FetchLike,
): Promise<ApiOutcome<{ job?: QueuedJob }>> {
  const me = await apiRequest<Me>('/me', { method: 'GET' }, fetchImpl);
  if (me.kind !== 'ok') return me;
  if (typeof me.data?.csrfToken !== 'string' || me.data.csrfToken === '')
    return { kind: 'error', status: me.status, code: 'UNRECOGNISED' };
  return apiRequest<{ job?: QueuedJob }>(
    '/jobs',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Evergreen-CSRF': me.data.csrfToken,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ network: 'testnet', contractId, kind: 'extend-now' }),
    },
    fetchImpl,
  );
}

/** What the dialog shows after `POST /jobs`. */
export function extendNowResult(o: ApiOutcome<{ job?: QueuedJob }>): DialogState {
  if (o.kind === 'ok') {
    const id = o.data?.job?.id;
    if (typeof id !== 'string' || id === '')
      return {
        phase: 'refused',
        text: 'The API answered in a shape this page does not know. Check Activity before trying again.',
      };
    return { phase: 'queued', jobId: id, again: o.status === 200 };
  }
  if (o.kind === 'unavailable')
    return {
      phase: 'refused',
      text: 'The Evergreen API did not answer. Check Activity before trying again: if it was queued, it is listed there.',
    };
  switch (o.code) {
    case 'DAILY_LIMIT_REACHED': {
      const at =
        typeof o.details?.['resetsAt'] === 'string' ? Date.parse(o.details['resetsAt']) : NaN;
      return {
        phase: 'refused',
        text: `Extend now was already used for this contract in the last 24 hours${
          Number.isFinite(at) ? `; available again after ${resetTime(new Date(at))}` : ''
        }. Nothing was queued.`,
      };
    }
    case 'AUTOPILOT_OFF':
      return {
        phase: 'refused',
        text: 'Autopilot is off for this contract, so Extend now has nothing to run through. Turn autopilot on first.',
      };
    case 'EXTEND_NOW_DISABLED':
      return {
        phase: 'refused',
        text: 'Extend now is switched off on this network for now. Autopilot still extends on its own schedule.',
      };
    case 'NOT_FOUND':
      return {
        phase: 'refused',
        text: 'This contract is no longer on your watchlist. Reload the page.',
      };
    case 'UNAUTHENTICATED':
      return { phase: 'refused', text: 'You are signed out. Sign in again, then try once more.' };
    case 'CSRF_FAILED':
      return {
        phase: 'refused',
        text: 'The request was refused as possibly forged. Reload the page and try again.',
      };
    case 'IDEMPOTENCY_KEY_REUSED':
      return {
        phase: 'refused',
        text: 'This confirmation was already used for a different request. Close and start again.',
      };
    case 'RATE_LIMITED':
      return { phase: 'refused', text: 'Too many requests. Wait a minute, then try again.' };
    default:
      return {
        phase: 'refused',
        text: 'The API refused this, and nothing was queued. Check Activity before trying again.',
      };
  }
}
