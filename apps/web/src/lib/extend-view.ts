/**
 * Copy for /extend/ (PH2-E3-04).
 *
 * One click is one hosted extend. Rent and the provisional fee are separate
 * lines. The retry margin is unset, so this screen does not name a pull amount.
 * A job status outside the documented set is undetermined, never "extended".
 * Nothing here says a contract is protected.
 */
import {
  pullAmountStroops,
  hostedFeeStroops,
  routerFeeStroops,
} from '../../../../packages/core/src/index';
import { ALLOWANCE_RETRY_MARGIN_STROOPS } from './allowance-cap';
import { exactXlm, esc, short } from './format';
import {
  ROUTER_CONTRACT_ID,
  type ExtendJob,
  type ExtendRow,
  type QueueOutcome,
} from './extend-job';

const money = (stroops: string | bigint) => {
  const exact = exactXlm(stroops);
  return `${esc(exact.xlm)} · ${esc(exact.stroops)}`;
};

export const EMAIL_UNDETERMINED =
  'Each one-click extend is specified to send you an email notice. This page does not send mail, and whether a notice has been sent is undetermined.';

export const ROUTER_UNPUBLISHED =
  'Without a live allowance, one signature would go to the router, and that signature extends instance and code only. Persistent entries are not in it. No router address is published, so this page will not ask your wallet to sign an extend. A second signature is not offered.';

/**
 * Rent, the provisional fee, and — on testnet, where the retry margin is
 * 100,000 stroops — the pull. Each is its own line. Any other network leaves
 * the margin unset, and the pull stays undetermined.
 */
export function oneExtendQuoteHtml(rentStroops: bigint | undefined): string {
  if (rentStroops === undefined) {
    return `<div class="panel undetermined"><p><span class="chip undetermined"><span class="shape"></span>undetermined</span> Rent and the fee for one extend are undetermined until a rent figure is entered.</p></div>`;
  }
  const hosted = hostedFeeStroops(rentStroops);
  const router = routerFeeStroops(rentStroops);
  const margin = ALLOWANCE_RETRY_MARGIN_STROOPS;
  const pull =
    margin === undefined
      ? undefined
      : pullAmountStroops({ simulatedRentStroops: rentStroops, retryMarginStroops: margin });
  const pullLine =
    pull === undefined
      ? '<p class="small">Pull amount: undetermined. The safety margin is not set on this network.</p>'
      : `<dl class="small"><dt>Margin, one extend</dt><dd class="mono">${money(pull.marginStroops)}</dd><dt>Pull amount, one extend</dt><dd class="mono">${money(pull.totalStroops)}</dd></dl>`;
  return `<div class="stack">
      <dl class="small">
        <dt>Rent, one extend, estimate</dt><dd class="mono">${money(rentStroops)}</dd>
        <dt>Fee, one extend, estimate</dt><dd class="mono">${money(hosted)}</dd>
        <dt>Router fee, one extend, estimate</dt><dd class="mono">${money(router)}</dd>
      </dl>
      ${pullLine}
      <p class="small muted">The fee is provisional. Rent and the fee are separate. The pull is rent, that fee and the margin. The router fee has no minimum. This page does not send it.</p>
    </div>`;
}

export function limitHtml(row: ExtendRow): string {
  if (row.limitPerDay === undefined || row.usedToday === undefined) {
    return '<p class="small muted">Today’s extend count for this contract is undetermined.</p>';
  }
  const left = row.limitPerDay - row.usedToday;
  const reset = row.resetsAt === undefined ? '' : ` The count moves at ${esc(row.resetsAt)}.`;
  return `<p class="small">Extend now, this contract: ${row.usedToday} of ${row.limitPerDay} used in the rolling day. ${left > 0 ? `${left} left.` : 'None left.'}${reset} Only an extend that pulled funds counts.</p>`;
}

export function jobHtml(job: ExtendJob): string {
  const id = esc(short(job.id, 8, 6));
  const hashes = [
    job.pullTxHash === undefined ? '' : `<dt>Pull</dt><dd class="mono">${esc(job.pullTxHash)}</dd>`,
    job.extendTxHash === undefined
      ? ''
      : `<dt>Extend</dt><dd class="mono">${esc(job.extendTxHash)}</dd>`,
    job.refundTxHash === undefined
      ? ''
      : `<dt>Refund</dt><dd class="mono">${esc(job.refundTxHash)}</dd>`,
  ].join('');
  const amount =
    job.pullAmountStroops === undefined
      ? ''
      : `<dt>Pulled</dt><dd class="mono">${money(job.pullAmountStroops)}</dd>`;
  const reason = job.preflightReason === undefined ? '' : ` Reason: ${esc(job.preflightReason)}.`;
  const sentence: Record<ExtendJob['status'], string> = {
    queued:
      'Queued. This page signed nothing. Whether the engine submits is its own mode, which ships dry-run.',
    'preflight-failed': `The engine refused this extend before a pull.${reason} It does not count against the daily limit.`,
    cancelled: 'Cancelled before a pull. Nothing was taken.',
    pulled: 'Funds were pulled. The extend’s outcome is not on this reading yet.',
    extended: 'The extend was recorded for this job.',
    refunded: 'The pull was refunded. When the extend fails, the refund includes the fee.',
    failed:
      'The job failed. What moved, if anything, is the transactions listed here and nowhere else.',
  };
  return `<div class="panel note stack">
      <p><span class="chip undetermined"><span class="shape"></span>${esc(job.status)}</span> ${sentence[job.status]}</p>
      <dl class="small"><dt>Job</dt><dd class="mono" title="${esc(job.id)}">${id}</dd>${amount}${hashes}</dl>
    </div>`;
}

export function queueHtml(outcome: QueueOutcome): string {
  if (outcome.kind === 'queued') {
    const replay = outcome.replay
      ? '<p class="small">This key already had a job, so no second one was created.</p>'
      : '';
    return jobHtml(outcome.job) + replay;
  }
  const sentence: Record<typeof outcome.reason, string> = {
    'no-key': 'No idempotency key was given, so nothing was sent.',
    unavailable: 'The jobs route did not answer, so nothing was queued.',
    'not-signed-in':
      'Not queued. Extend now belongs to a signed-in session. Sign in, then try again.',
    'autopilot-off':
      'Not queued. Autopilot is off for this contract. Turning it on is on the watchlist, and it needs the allowance.',
    'allowance-missing':
      'Not queued. No live allowance. This page will not sign a router extend in its place.',
    'allowance-expired':
      'Not queued. The allowance is expired, so autopilot is stopped. This page will not sign a replacement extend.',
    'daily-limit': 'Not queued. Today’s extend-now uses of this contract are at the limit.',
    'not-testnet': 'Not queued. This page only asks for a testnet extend.',
    'reused-key': 'Not queued. That idempotency key was already used for a different request.',
    unrecognised:
      'The jobs route answered in a shape this page will not treat as queued. Whether a job exists is undetermined. This page will not send another.',
  };
  const tone =
    outcome.reason === 'unavailable' || outcome.reason === 'unrecognised' ? 'undetermined' : 'note';
  return `<div class="panel ${tone}"><p class="small">${sentence[outcome.reason]}</p></div>`;
}

export function rowHtml(row: ExtendRow): string {
  const who = esc(short(row.contractId));
  if (!row.autopilot) {
    return `<div class="card card-pad stack" data-contract="${esc(row.contractId)}">
        <p class="mono" title="${esc(row.contractId)}">${who}</p>
        <p class="small">Autopilot is off. Extend now is not offered. <a href="/dashboard/watchlist/">The watchlist</a> is where it is turned on, and <a href="/allowance/">the allowance</a> is where the cap is signed.</p>
      </div>`;
  }
  const blocked =
    row.limitPerDay !== undefined &&
    row.usedToday !== undefined &&
    row.usedToday >= row.limitPerDay;
  return `<div class="card card-pad stack" data-contract="${esc(row.contractId)}">
      <p class="mono" title="${esc(row.contractId)}">${who}</p>
      ${limitHtml(row)}
      <div class="row"><button class="extend-now" type="button" data-contract="${esc(row.contractId)}"${blocked ? ' disabled' : ''}>Extend now</button></div>
      <div class="extend-result" data-contract="${esc(row.contractId)}" aria-live="polite"></div>
    </div>`;
}

export function routerNoteHtml(): string {
  const address =
    ROUTER_CONTRACT_ID === undefined
      ? ROUTER_UNPUBLISHED
      : `Router ${ROUTER_CONTRACT_ID}. This page still does not send a second signature.`;
  return `<p class="small">${esc(address)}</p><p class="small muted">${esc(EMAIL_UNDETERMINED)}</p>`;
}
