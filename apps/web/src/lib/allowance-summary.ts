/**
 * The top of /allowance/ in the revamp (components.md § "The other screens",
 * Allowance): the dominant figure is what is left to pull, then four facts.
 *
 * An allowance is a permission, so it gets no healthy chip: the state is a
 * word. Values no route serves yet (the cap approved, what was pulled) say
 * "not yet available", never zero.
 */
import { NOT_YET_AVAILABLE } from './overview-view';
import { esc, formatCount, short } from './format';
import { approxDateOfLedger } from './view';

export type AllowanceSummary =
  | { readonly kind: 'no-wallet' }
  | { readonly kind: 'unread'; readonly wallet: string }
  | { readonly kind: 'none'; readonly wallet: string }
  | {
      readonly kind: 'live';
      readonly wallet: string;
      readonly amountStroops: bigint;
      readonly liveUntilLedger: number;
      readonly observedAtLedger: number;
    };

export function allowanceNextHtml(s: AllowanceSummary, now = new Date()): string {
  const label = '<p class="label">Left to pull</p>';
  if (s.kind === 'no-wallet')
    return `<div>${label}<p class="caption">No wallet is linked to this account. Connect one in step 1 below.</p></div>`;
  if (s.kind === 'unread')
    return `<div>${label}<p><span class="chip undetermined"><span class="shape"></span>undetermined</span></p><p class="caption">The chain did not answer for <span class="mono">${esc(short(s.wallet, 4, 4))}</span>.</p></div>`;
  if (s.kind === 'none')
    return `<div>${label}<p><span class="next-figure ink">none</span></p><p class="caption">No live allowance from <span class="mono">${esc(short(s.wallet, 4, 4))}</span>. Approve one below.</p></div>`;
  return `<div>${label}<p><span class="next-figure ink">${esc(formatCount(s.amountStroops))}</span><span class="next-unit">stroops</span></p>
    <p class="caption">active until ledger <span class="mono">${esc(formatCount(s.liveUntilLedger))}</span> · ${esc(
      approxDateOfLedger(s.liveUntilLedger, s.observedAtLedger, now),
    )} · wallet <span class="mono">${esc(short(s.wallet, 4, 4))}</span></p></div>`;
}

export function allowanceFactsHtml(spender: string | undefined): string {
  const na = `<p class="v unavailable">${NOT_YET_AVAILABLE}</p>`;
  return `<div class="fact-cell"><p class="k">Cap approved</p>${na}</div>
    <div class="fact-cell"><p class="k">Pulled so far</p>${na}</div>
    <div class="fact-cell"><p class="k">Wallet balance</p>${na}</div>
    <div class="fact-cell"><p class="k">Spender</p>${
      spender === undefined
        ? '<p class="v unavailable">not published yet</p>'
        : `<p class="v mono-v">${esc(short(spender, 4, 4))}</p><p class="s">Evergreen engine</p>`
    }</div>`;
}
