/**
 * /allowance/ steps C and D (components.md § "B, C, D"): the standing line,
 * the per-row coverage sentence, the review panel before signing, the
 * read-back after it, and the autopilot rows that follow a matching read-back.
 * Pure functions only; `pages/allowance.ts` does the reads and the writes.
 *
 * No healthy chip anywhere on this screen: an allowance is a permission, not
 * health. Rent, the fee and the retry margin are three lines and never one
 * summed figure, except the cap itself, which is the number a signature
 * authorises. Ledgers are the rule; dates are estimates beside them.
 */
import {
  PROVISIONAL_HOSTED_FEE,
  SECONDS_PER_LEDGER,
  pullAmountStroops,
} from '../../../../packages/core/src/index';
import { nativeSac, type ReadResult } from './allowance';
import type { CapEstimate } from './allowance-cap';
import { settingsProblem, type CapRow } from './allowance-candidates';
import type { AllowanceHistory } from './allowance-status';
import { SPENDER_UNSET_TEXT } from './allowance-view';
import type { ApiOutcome } from './api';
import { esc, exactXlm, formatCount, short } from './format';
import { approxDateOfLedger } from './view';

const UNDETERMINED_CHIP =
  '<span class="chip undetermined"><span class="shape"></span>undetermined</span>';
const EXPIRED_CHIP = '<span class="chip expired"><span class="shape"></span>expired</span>';

const ledgerText = (n: number) => `ledger <span class="mono">${esc(formatCount(n))}</span>`;
const stroopsText = (s: bigint | string) => `<span class="mono">${esc(exactXlm(s).stroops)}</span>`;

/** Live: a positive amount whose expiry ledger is still ahead of the read. */
export function isLive(read: ReadResult): boolean {
  if (read.kind !== 'read') return false;
  const { amountStroops, liveUntilLedger, observedAtLedger } = read.raw;
  return (
    BigInt(amountStroops) > 0n && liveUntilLedger !== null && liveUntilLedger > observedAtLedger
  );
}

export type Standing =
  | { readonly kind: 'not-connected' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'read'; readonly read: ReadResult; readonly history?: AllowanceHistory };

/**
 * The one sentence under the lead that answers "where am I". It comes before
 * any step. Zero is told apart only from the history route; without it a zero
 * is undetermined, because the chain reads the same after an expiry, a revoke
 * and when nothing was ever approved.
 */
export function standingLineHtml(standing: Standing, now = new Date()): string {
  if (standing.kind === 'not-connected')
    return '<p class="standing-line">Connect a wallet to read its allowance.</p>';
  if (standing.kind === 'reading')
    return '<p class="standing-line"><span class="muted">reading…</span></p>';
  const { read, history } = standing;
  if (read.kind === 'spender-unset')
    return `<p class="standing-line">${UNDETERMINED_CHIP} <span>${esc(SPENDER_UNSET_TEXT)}</span></p>`;
  if (read.kind === 'read-failed')
    return `<p class="standing-line">${UNDETERMINED_CHIP} <span>The allowance could not be read. (${esc(read.detail)})</span></p>`;
  const { amountStroops, liveUntilLedger, observedAtLedger } = read.raw;
  if (isLive(read) && liveUntilLedger !== null) {
    const amount = exactXlm(amountStroops);
    return `<p class="standing-line"><span><span class="mono">${esc(amount.xlm)}</span> (${stroopsText(
      amountStroops,
    )}) until ${ledgerText(liveUntilLedger)}, ${esc(
      approxDateOfLedger(liveUntilLedger, observedAtLedger, now),
    )}.</span></p>`;
  }
  const state = history?.kind === 'state' ? history.state : undefined;
  if (state?.status === 'expired' && state.lastKnown !== null)
    return `<p class="standing-line">${EXPIRED_CHIP} <span>Stopped. The allowance expired at ${ledgerText(
      state.lastKnown.liveUntilLedger,
    )}.</span></p>`;
  if (state?.status === 'revoked')
    return `<p class="standing-line">${EXPIRED_CHIP} <span>Stopped. The allowance was revoked.</span></p>`;
  return `<p class="standing-line">${UNDETERMINED_CHIP} <span>The chain reads zero. Whether it expired, was revoked or never existed is undetermined.</span></p>`;
}

/** About N days, from ledgers. An estimate, always beside the ledgers. */
function daysText(ledgers: number): string {
  const days = (ledgers * SECONDS_PER_LEDGER) / 86_400;
  const rounded = days >= 10 ? Math.round(days) : Math.round(days * 10) / 10;
  return `~${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

/**
 * What "extends to cover" buys at this row's settings (DES note a). An extend
 * runs at **Act below** and reaches **Extend to**, so it adds about their
 * difference. Without usable settings, or without a number of extends, the
 * line is absent, not guessed. The allowance's end ledger is named only when
 * it is known (after the allowance is read).
 */
export function coverageSentence(
  row: CapRow,
  extendsToCover: bigint | undefined,
  allowanceEndsAtLedger?: number,
): string | undefined {
  if (extendsToCover === undefined || settingsProblem(row) !== undefined) return undefined;
  const added = row.extendToLedgers! - row.thresholdLedgers!;
  const total = added * Number(extendsToCover);
  const n = extendsToCover.toString();
  const end =
    allowanceEndsAtLedger === undefined
      ? ''
      : ` The allowance itself ends at ledger ${formatCount(allowanceEndsAtLedger)}.`;
  return `One extend adds about ${formatCount(added)} ledgers (${daysText(added)}), so ${n} ${
    extendsToCover === 1n ? 'extend covers' : 'extends cover'
  } about ${formatCount(total)} ledgers.${end}`;
}

export interface ReviewArgs {
  readonly cap: CapEstimate | undefined;
  /** As read; undefined until the allowance is read. */
  readonly currentAmountStroops: string | undefined;
  readonly liveUntilLedger: number | undefined;
  readonly observedAtLedger: number | undefined;
  readonly spender: string | undefined;
}

/**
 * The review panel: the screen's one dominant element, so the cap is the only
 * serif number on the page. Every line is present before anything can be
 * signed; a line whose value is not known yet says why instead of guessing.
 */
export function reviewPanelHtml(args: ReviewArgs, now = new Date()): string {
  const { cap } = args;
  const capLine =
    cap?.amountStroops === undefined
      ? `<dd class="lines"><span>${UNDETERMINED_CHIP}</span><span class="small">${
          cap === undefined
            ? 'No contract is in the cap yet.'
            : 'The retry margin is not set, so this page will not name a cap and will not ask you to sign one.'
        }</span></dd>`
      : `<dd class="lines"><span class="cap-figure">${esc(exactXlm(cap.amountStroops).xlm)}</span><span class="cap-stroops mono">${esc(
          exactXlm(cap.amountStroops).stroops,
        )}</span></dd>`;
  const margin =
    cap?.marginStroops === undefined
      ? 'Retry margin: not set'
      : `Retry margin ${stroopsText(
          cap.marginStroops * cap.lines.reduce((sum, l) => sum + l.hostedActions, 0n),
        )}`;
  const madeOf =
    cap === undefined
      ? '<dd class="small muted">Choose a contract in step 2.</dd>'
      : `<dd class="small lines"><span>Rent ${stroopsText(cap.rentStroops)}</span><span>Evergreen fee ${stroopsText(
          cap.feeStroops,
        )} (provisional: 2% of rent, at least ${esc(
          formatCount(Number(PROVISIONAL_HOSTED_FEE.minimumStroops)),
        )} stroops per extend)</span><span>${margin}</span><span class="small muted">Rent and the fee are charged on what each extend actually costs. An unused pull is refunded.</span></dd>`;
  const current =
    args.currentAmountStroops === undefined
      ? 'Your current allowance is not read yet. Whatever it is, this cap replaces it. It is not added to it.'
      : `Your current allowance, <span class="mono">${esc(
          exactXlm(args.currentAmountStroops).xlm,
        )}</span>, is replaced by this cap. It is not added to it.`;
  const until =
    args.liveUntilLedger === undefined || args.observedAtLedger === undefined
      ? 'Not known until the allowance is read.'
      : `${ledgerText(args.liveUntilLedger)}, ${esc(
          approxDateOfLedger(args.liveUntilLedger, args.observedAtLedger, now),
        )}. The ledger is the rule. The date is an estimate.`;
  const spender =
    args.spender === undefined
      ? '<span>Not published yet.</span>'
      : `<span>Evergreen's engine</span><span class="mono addr">${esc(args.spender)}</span>`;
  const sac = nativeSac();
  return `<dl class="review-lines">
      <div><dt>Cap</dt>${capLine}</div>
      <div><dt>Made of</dt>${madeOf}</div>
      <div><dt>Replaces</dt><dd class="small">${current}</dd></div>
      <div><dt>Until</dt><dd class="small">${until}</dd></div>
      <div><dt>Spender</dt><dd class="small lines">${spender}</dd></div>
      <div><dt>Contract</dt><dd class="small">The native XLM contract <span class="mono" title="${esc(sac)}">${esc(
        short(sac),
      )}</span></dd></div>
      <div><dt>What it is</dt><dd class="small">This authorises a payment from your wallet, never access to a contract. You can revoke it at any time below.</dd></div>
    </dl>`;
}

/**
 * After a submitted approve the chain is read again. Step D appears only when
 * it reads exactly what was signed: the same amount and the same ledger.
 */
export type ReadBack =
  | { readonly kind: 'matches' }
  | {
      readonly kind: 'differs';
      readonly amountStroops: string;
      readonly liveUntilLedger: number | null;
    }
  | { readonly kind: 'unread'; readonly detail: string };

export function readBack(
  read: ReadResult,
  signed: { readonly amountStroops: bigint; readonly liveUntilLedger: number },
): ReadBack {
  if (read.kind === 'spender-unset') return { kind: 'unread', detail: SPENDER_UNSET_TEXT };
  if (read.kind === 'read-failed') return { kind: 'unread', detail: read.detail };
  const { amountStroops, liveUntilLedger } = read.raw;
  if (
    amountStroops === signed.amountStroops.toString() &&
    liveUntilLedger === signed.liveUntilLedger
  )
    return { kind: 'matches' };
  return { kind: 'differs', amountStroops, liveUntilLedger };
}

/**
 * "Submitted" (components.md § C, after signing): the hash, linked to the
 * explorer. The page reads the allowance back itself, so it never asks for a
 * reload here.
 */
export function submittedHtml(o: { readonly hash: string; readonly ledger: number }): string {
  const url = `https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(o.hash)}`;
  return `<p class="small">Submitted in ${ledgerText(o.ledger)}. Transaction <a class="mono addr" href="${esc(
    url,
  )}" rel="noopener">${esc(o.hash)}</a></p>`;
}

export function readBackHtml(
  result: ReadBack,
  signed: { readonly amountStroops: bigint; readonly liveUntilLedger: number },
): string {
  if (result.kind === 'matches')
    return `<p>The chain now reads <span class="mono">${esc(exactXlm(signed.amountStroops).xlm)}</span> until ${ledgerText(
      signed.liveUntilLedger,
    )}.</p>`;
  if (result.kind === 'unread')
    return `<p>${UNDETERMINED_CHIP} The allowance could not be read back, so autopilot is not offered yet. (${esc(
      result.detail,
    )}) Reload and read it again.</p>`;
  const was =
    result.liveUntilLedger === null ? 'no entry' : `ledger ${formatCount(result.liveUntilLedger)}`;
  return `<p><span class="chip critical"><span class="shape"></span>differs</span> <span class="crit-ink">The chain reads a different amount or ledger than you signed. Do not turn on autopilot. Signed: <span class="mono">${esc(
    exactXlm(signed.amountStroops).stroops,
  )}</span> until ledger <span class="mono">${esc(formatCount(signed.liveUntilLedger))}</span>. Read: <span class="mono">${esc(
    exactXlm(result.amountStroops).stroops,
  )}</span>, ${esc(was)}.</span></p>`;
}

/** A live allowance covers the cap when it is at least the cap. Nothing else is assumed. */
export function liveCovers(read: ReadResult, cap: CapEstimate | undefined): boolean {
  if (!isLive(read) || read.kind !== 'read' || cap?.amountStroops === undefined) return false;
  return BigInt(read.raw.amountStroops) >= cap.amountStroops;
}

/** Step D's two budget fields, prefilled. Undefined when the pull is not a number yet. */
export function defaultBudget(
  rentStroops: bigint,
  extendsToCover: bigint,
  retryMarginStroops: bigint | undefined,
  capStroops: bigint | undefined,
): { readonly perJobMaxStroops: bigint; readonly per30DaysMaxStroops: bigint } | undefined {
  const pull = pullAmountStroops({ simulatedRentStroops: rentStroops, retryMarginStroops });
  if (pull === undefined || capStroops === undefined) return undefined;
  const wanted = pull.totalStroops * extendsToCover;
  return {
    perJobMaxStroops: pull.totalStroops,
    per30DaysMaxStroops: wanted > capStroops ? capStroops : wanted,
  };
}

/** Whole stroops above zero, or undefined. Commas are accepted and nothing is coerced. */
export function parseStroops(text: string): bigint | undefined {
  const t = text.trim().replace(/,/g, '');
  return /^[1-9]\d*$/.test(t) ? BigInt(t) : undefined;
}

export const BUDGET_RULE_TEXT = 'Per job cannot be more than per 30 days, and neither can be 0.';

/** The API's own budget rule, said before the request instead of after. */
export function budgetProblem(
  perJob: bigint | undefined,
  per30: bigint | undefined,
): string | undefined {
  if (perJob === undefined || per30 === undefined || perJob > per30) return BUDGET_RULE_TEXT;
  return undefined;
}

export interface AutopilotRow {
  readonly contractId: string;
  readonly label: string | undefined;
  readonly thresholdLedgers: number;
  readonly extendToLedgers: number;
  readonly perJobMaxStroops: bigint;
  readonly per30DaysMaxStroops: bigint;
}

export function autopilotRowsHtml(rows: readonly AutopilotRow[]): string {
  return `<p class="small muted">${esc(BUDGET_RULE_TEXT)}</p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Contract</th><th scope="col">Act below</th><th scope="col">Extend to</th><th scope="col">Per-job budget, stroops</th><th scope="col">Per 30 days, stroops</th></tr></thead>
      <tbody>${rows
        .map((r, index) => {
          const who = r.label ?? r.contractId;
          const name = r.label
            ? `${esc(r.label)} <span class="small muted mono">${esc(short(r.contractId))}</span>`
            : `<span class="mono" title="${esc(r.contractId)}">${esc(short(r.contractId))}</span>`;
          return `<tr data-auto-index="${index}">
            <td>${name}<br /><span class="small" data-auto-result aria-live="polite"></span></td>
            <td class="mono">${esc(formatCount(r.thresholdLedgers))}</td>
            <td class="mono">${esc(formatCount(r.extendToLedgers))}</td>
            <td><input class="mono" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" size="10" data-auto-per-job="${index}" aria-label="Per-job budget, ${esc(who)}" value="${r.perJobMaxStroops.toString()}" /></td>
            <td><input class="mono" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" size="10" data-auto-per-30="${index}" aria-label="Per 30 days, ${esc(who)}" value="${r.per30DaysMaxStroops.toString()}" /></td>
          </tr>`;
        })
        .join('')}</tbody></table></div>`;
}

export type AutopilotOnOutcome =
  { readonly kind: 'on' } | Exclude<ApiOutcome<unknown>, { kind: 'ok' }>;

/** The floor the API named, when it named one. Never a number typed into the client. */
export function floorFrom(outcome: AutopilotOnOutcome): number | undefined {
  if (outcome.kind !== 'error' || outcome.code !== 'THRESHOLD_BELOW_FLOOR') return undefined;
  const floor = outcome.details?.floorLedgers;
  return typeof floor === 'number' && Number.isInteger(floor) && floor > 0 ? floor : undefined;
}

export const THRESHOLD_UNPUBLISHED_TEXT =
  'Autopilot cannot be turned on yet: the engine has not published its threshold. Your allowance is approved and stays on chain.';

/** One line under one row. `On.` or the API's refusal, never a guess. */
export function autopilotOnOutcomeHtml(outcome: AutopilotOnOutcome): string {
  if (outcome.kind === 'on') return '<span class="muted">On.</span>';
  const floor = floorFrom(outcome);
  if (floor !== undefined)
    return `<span class="crit-ink">The engine acts no earlier than ${esc(formatCount(floor))} ledgers left. Use ${esc(
      formatCount(floor),
    )}?</span> <button class="secondary" type="button" data-auto-use-floor="${floor}">Use ${esc(
      formatCount(floor),
    )}</button>`;
  if (outcome.kind === 'unavailable')
    return '<span class="crit-ink">The Evergreen API did not answer, so autopilot is still off for this contract.</span>';
  if (outcome.code === 'UPSTREAM_UNAVAILABLE' && outcome.status === 503)
    return `<span class="crit-ink">${esc(THRESHOLD_UNPUBLISHED_TEXT)}</span>`;
  if (outcome.code === 'UNAUTHENTICATED')
    return '<span class="crit-ink">This browser is no longer signed in, so autopilot is still off. <a href="/login/">Sign in</a> and try again.</span>';
  if (outcome.code === 'NETWORK_NOT_WRITABLE')
    return '<span class="crit-ink">Autopilot is testnet-only until beta ends, so it is still off.</span>';
  return `<span class="crit-ink">The API did not turn autopilot on (${esc(outcome.code)}), so it is still off for this contract.</span>`;
}

export const MARGIN_UNSET_TEXT =
  'The safety margin is not set, so this page will not name an allowance amount and will not ask you to sign one.';

/**
 * Every reason the sign button is off, one sentence each, in the order the
 * person fixes them. Each names its own cause: a page that has not been
 * connected yet must not say the margin is unset (Fatih's preview reload,
 * 2026-11-23).
 */
export function approveOffReasons(s: {
  readonly spenderSet: boolean;
  readonly marginSet: boolean;
  readonly connected: boolean;
  readonly read: boolean;
  readonly linked: boolean;
  readonly capNamed: boolean;
}): string[] {
  const reasons: string[] = [];
  if (!s.spenderSet) reasons.push(SPENDER_UNSET_TEXT);
  if (!s.marginSet) reasons.push(MARGIN_UNSET_TEXT);
  if (!s.connected) {
    reasons.push('Connect your wallet in step 1.');
    return reasons;
  }
  if (!s.linked)
    reasons.push(
      'This wallet is not linked to your account, so an allowance from it is one autopilot cannot use.',
    );
  if (s.spenderSet && !s.read)
    reasons.push(
      'The allowance has not been read, so the expiry ledger and its date are not known.',
    );
  if (s.marginSet && !s.capNamed)
    reasons.push('Choose at least one contract in step 2, or enter rent by hand, to name a cap.');
  return reasons;
}
