/**
 * The top of /allowance/ in the revamp (components.md § "The other screens",
 * Allowance): the dominant figure is what is left to pull, then four facts.
 *
 * An allowance is a permission, so it gets no healthy chip: the state is a
 * word. Values no route serves yet (the cap approved, what was pulled) say
 * "not yet available", never zero.
 */
import { NOT_YET_AVAILABLE } from './overview-view';
import { esc, exactXlm, formatCount, short } from './format';
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
    return `<div><p class="label">Wallet</p><p class="who">No wallet linked</p></div><button type="button" data-connect>Connect Freighter</button>`;
  if (s.kind === 'unread')
    return `<div>${label}<p><span class="chip undetermined"><span class="shape"></span>undetermined</span></p><p class="caption">The chain did not answer for <span class="mono">${esc(short(s.wallet, 4, 4))}</span>.</p></div>`;
  if (s.kind === 'none')
    return `<div>${label}<p><span class="next-figure ink">none</span></p><p class="caption">No live allowance from <span class="mono">${esc(short(s.wallet, 4, 4))}</span>. Approve one below.</p></div>`;
  return `<div>${label}<p><span class="next-figure ink">${esc(formatCount(s.amountStroops))}</span><span class="next-unit">stroops</span></p>
    <p class="caption">active until ledger <span class="mono">${esc(formatCount(s.liveUntilLedger))}</span> · ${esc(
      approxDateOfLedger(s.liveUntilLedger, s.observedAtLedger, now),
    )} · wallet <span class="mono">${esc(short(s.wallet, 4, 4))}</span></p></div>`;
}

/**
 * The facts row. The wallet balance is shown only once the chain has been
 * read for it; until then (or when the read fails) the cell is left out, never
 * shown as unavailable or zero (DES, 2026-11-24).
 */
export function allowanceFactsHtml(spender: string | undefined, balanceStroops?: bigint): string {
  const na = `<p class="v unavailable">${NOT_YET_AVAILABLE}</p>`;
  const balance =
    balanceStroops === undefined
      ? ''
      : `<div class="fact-cell"><p class="k">Wallet balance</p><p class="v">${esc(exactXlm(balanceStroops).xlm)}</p><p class="s">XLM</p></div>`;
  return `<div class="fact-cell"><p class="k">Cap approved</p>${na}</div>
    <div class="fact-cell"><p class="k">Pulled so far</p>${na}</div>
    ${balance}
    <div class="fact-cell"><p class="k">Spender</p>${
      spender === undefined
        ? '<p class="v unavailable">not published yet</p>'
        : `<p class="v mono-v">${esc(short(spender, 4, 4))}</p><p class="s">Evergreen engine</p>`
    }</div>`;
}
