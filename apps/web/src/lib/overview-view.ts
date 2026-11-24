/**
 * The revamped Overview (components.md § "Dashboard revamp", Fatih
 * 2026-11-24), as pure functions of the watchlist rows, so every rule the
 * spec states is testable without a browser.
 *
 * Every row goes through `rowFor` and `orderRows`, the watchlist screen's own
 * model, so the Overview can never call a contract healthy that the Contracts
 * screen would not. An undetermined contract is never shown with a figure,
 * and a value with no source yet says "not yet available", never zero.
 */
import { approxDate, approxDateShort, esc, formatCount, short, stamp } from './format';
import { approxDateOfLedger } from './view';
import { orderRows, type Row } from './watchlist-view';

/** Shown where a value would be when no API route serves it yet. */
export const NOT_YET_AVAILABLE = 'not yet available';
const unavailable = (cls = 'note'): string =>
  `<span class="${cls} unavailable">${NOT_YET_AVAILABLE}</span>`;

const WORD = { healthy: 'healthy', 'at-risk': 'at risk', undetermined: 'undetermined' } as const;

/** The chip for one row: archived beats at risk; at risk says how close. */
export function stateChip(r: Row): string {
  if (r.binding.state === 'expired')
    return `<span class="chip expired"><span class="shape"></span>${esc(r.binding.word)}</span>`;
  if (r.conclusion === 'at-risk') {
    const tone = r.item.lastObservation?.health === 'warning' ? 'warning' : 'critical';
    return `<span class="chip ${tone}"><span class="shape"></span>at risk</span>`;
  }
  return `<span class="chip ${r.conclusion}"><span class="shape"></span>${WORD[r.conclusion]}</span>`;
}

const nameOf = (r: Row): string => r.item.label ?? short(r.item.contractId);

/** Ledgers left after the read, only for a live binding with a determined state. */
export function ledgersLeft(r: Row): number | undefined {
  if (r.conclusion === 'undetermined' || r.binding.state !== 'live') return undefined;
  const b = r.binding;
  if (b.remainingLedgers !== undefined && Number.isInteger(b.remainingLedgers))
    return b.remainingLedgers;
  return b.observedAtLedger === undefined ? undefined : b.endsAtLedger - b.observedAtLedger;
}

/**
 * The one dominant element. Among at-risk contracts: archived first, then the
 * fewest ledgers left. With none at risk, the healthy one ending first. An
 * undetermined contract is chosen only when nothing else is determined, and
 * is then shown without a figure.
 */
export function attentionFirst(
  rows: readonly Row[],
): { readonly row: Row; readonly why: 'at-risk' | 'ends-first' | 'undetermined' } | undefined {
  const atRisk = rows.filter((r) => r.conclusion === 'at-risk');
  const archived = atRisk.find((r) => r.binding.state === 'expired');
  if (archived) return { row: archived, why: 'at-risk' };
  if (atRisk.length > 0) {
    const scored = atRisk
      .map((r) => ({ r, left: ledgersLeft(r) }))
      .sort((a, b) => (a.left ?? Infinity) - (b.left ?? Infinity));
    return { row: scored[0]!.r, why: 'at-risk' };
  }
  const healthy = rows
    .filter((r) => r.conclusion === 'healthy' && ledgersLeft(r) !== undefined)
    .sort((a, b) => ledgersLeft(a)! - ledgersLeft(b)!);
  if (healthy.length > 0) return { row: healthy[0]!, why: 'ends-first' };
  const und = rows.find((r) => r.conclusion === 'undetermined');
  return und ? { row: und, why: 'undetermined' } : undefined;
}

function actsBelow(r: Row): number | undefined {
  const a = r.item.autopilot;
  return a?.enabled === true && Number.isInteger(a.thresholdLedgers) && a.thresholdLedgers! > 0
    ? a.thresholdLedgers
    : undefined;
}

export function nextHtml(rows: readonly Row[]): string {
  const pick = attentionFirst(rows);
  if (pick === undefined) return '';
  const { row: r, why } = pick;
  const open = `<button class="secondary" type="button" data-open="${esc(r.item.contractId)}">Open</button>`;
  const label = why === 'ends-first' ? 'Ends first' : 'Needs attention first';
  const who = `<p class="label">${label}</p><p class="who">${esc(nameOf(r))}</p>`;
  if (why === 'undetermined' || r.conclusion === 'undetermined') {
    return `<div>${who}<p>${stateChip(r)}</p><p class="caption">${esc(r.why ?? 'Its expiry could not be established.')}</p></div>${open}`;
  }
  if (r.binding.state === 'expired') {
    return `<div>${who}<p><span class="next-figure ink">${esc(r.binding.word)}</span></p><p class="caption">binds on ${esc(r.binding.kind)} · restore it before it can be extended</p></div>${open}`;
  }
  const left = ledgersLeft(r);
  const caption: string[] = [];
  if (r.binding.state === 'live') {
    caption.push(`binds on ${esc(r.binding.kind)}`);
    caption.push(`ends ${esc(approxDate(r.binding.endsAt))}`);
  }
  const t = actsBelow(r);
  if (t !== undefined)
    caption.push(`autopilot acts below <span class="mono">${esc(formatCount(t))}</span>`);
  const figure =
    left === undefined
      ? stateChip(r)
      : `<span class="next-figure${why === 'ends-first' ? ' ink' : ''}">${esc(formatCount(left))}</span><span class="next-unit">ledgers left</span>`;
  return `<div>${who}<p>${figure}</p><p class="caption">${caption.join(' · ')}</p></div>${open}`;
}

/** The allowance fact: read in the browser from the chain (SAC `allowance()`). */
export type AllowanceFact =
  | { readonly kind: 'reading' }
  | { readonly kind: 'no-wallet' }
  | { readonly kind: 'unread' }
  | { readonly kind: 'none'; readonly wallet: string }
  | {
      readonly kind: 'live';
      readonly wallet: string;
      readonly amountStroops: bigint;
      readonly liveUntilLedger: number;
      readonly observedAtLedger: number;
    };

function allowanceCell(a: AllowanceFact, now: Date): string {
  const k = '<p class="k">Allowance left</p>';
  switch (a.kind) {
    case 'reading':
      return `${k}<p class="v unavailable">reading…</p>`;
    case 'no-wallet':
      return `${k}<p class="v"><a href="/allowance/">Not approved</a></p><p class="s">no wallet linked yet</p>`;
    case 'unread':
      return `${k}<p class="v"><span class="chip undetermined"><span class="shape"></span>undetermined</span></p><p class="s">the chain did not answer</p>`;
    case 'none':
      return `${k}<p class="v"><a href="/allowance/">Not approved</a></p><p class="s">for <span class="mono">${esc(short(a.wallet, 4, 4))}</span></p>`;
    case 'live':
      return `${k}<p class="v">${esc(formatCount(a.amountStroops))}</p><p class="s">stroops · until ledger <span class="mono">${esc(
        formatCount(a.liveUntilLedger),
      )}</span> (${esc(approxDateOfLedger(a.liveUntilLedger, a.observedAtLedger, now))})</p>`;
  }
}

export function factsHtml(
  rows: readonly Row[],
  allowance: AllowanceFact,
  now = new Date(),
): string {
  const n = (f: (r: Row) => boolean): number => rows.filter(f).length;
  const archived = n((r) => r.binding.state === 'expired');
  const attention = n((r) => r.conclusion === 'at-risk' && r.binding.state !== 'expired');
  const und = n((r) => r.conclusion === 'undetermined');
  const on = n((r) => r.item.autopilot?.enabled === true);
  return `<div class="fact-cell"><p class="k">Watching</p><p class="v">${esc(formatCount(rows.length))}</p><p class="s">${formatCount(attention)} ${
    attention === 1 ? 'needs' : 'need'
  } attention · ${formatCount(und)} undetermined · ${formatCount(archived)} archived</p></div>
    <div class="fact-cell"><p class="k">Autopilot</p><p class="v">${esc(formatCount(on))} of ${esc(formatCount(rows.length))}</p><p class="s">next check ${unavailable('unavailable-inline')}</p></div>
    <div class="fact-cell">${allowanceCell(allowance, now)}</div>
    <div class="fact-cell"><p class="k">Last 30 days</p><p class="v unavailable">${NOT_YET_AVAILABLE}</p></div>`;
}

/** At most this many rows on the Overview; the rest are on Contracts. */
export const OVERVIEW_ROWS = 5;

export function listHtml(rows: readonly Row[], openId?: string): string {
  const ordered = orderRows(rows).slice(0, OVERVIEW_ROWS);
  const body = ordered
    .map((r) => {
      const left = ledgersLeft(r);
      const ends =
        r.conclusion === 'undetermined'
          ? '—'
          : r.binding.state === 'live'
            ? approxDateShort(r.binding.endsAt)
            : '—';
      const id = esc(r.item.contractId);
      return `<tr data-open="${id}" tabindex="0"${r.item.contractId === openId ? ' class="open" aria-current="true"' : ''}>
        <td><div class="name"><span>${esc(r.item.label ?? 'Unlabelled')}</span><span class="id">${esc(short(r.item.contractId, 4, 4))}</span></div></td>
        <td>${stateChip(r)}</td>
        <td class="num mono">${left === undefined ? '—' : esc(formatCount(left))}</td>
        <td class="hide-m">${ends}</td>
        <td class="hide-m">${r.item.autopilot?.enabled === true ? 'on' : 'off'}</td>
        <td class="hide-m chev" aria-hidden="true">›</td>
      </tr>`;
    })
    .join('');
  const more =
    rows.length > OVERVIEW_ROWS
      ? `<p class="note">${formatCount(rows.length - OVERVIEW_ROWS)} more on <a href="/dashboard/watchlist/">Contracts</a>.</p>`
      : '';
  return `<table class="list">
      <thead><tr><th scope="col">Contract</th><th scope="col">State</th><th scope="col" class="num">Ledgers left</th><th scope="col" class="hide-m">Ends (est.)</th><th scope="col" class="hide-m">Autopilot</th><th class="hide-m"><span class="skip">Open</span></th></tr></thead>
      <tbody>${body}</tbody>
    </table>${more}`;
}

const kv = (pairs: readonly (readonly [string, string])[]): string =>
  `<dl class="kv">${pairs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

/** The side panel for one contract. No Extend now: `POST /jobs` is not built. */
export function panelHtml(r: Row): string {
  const { item } = r;
  const obs = item.lastObservation;
  const top = `<div class="panel-top"><div><h2>${esc(item.label ?? 'Unlabelled contract')}</h2><p class="mono note addr">${esc(
    item.contractId,
  )}</p></div><button class="close" type="button" data-panel-close>Close</button></div>
    <p>${stateChip(r)}</p>`;

  const facts: [string, string][] = [];
  if (r.conclusion === 'undetermined') {
    facts.push(['Why', esc(r.why ?? 'Its expiry could not be established.')]);
  } else if (r.binding.state === 'expired') {
    facts.push(['Binds on', esc(r.binding.kind)]);
    facts.push(['State', `${esc(r.binding.word)}: restore it before it can be extended`]);
  } else if (r.binding.state === 'live') {
    const left = ledgersLeft(r);
    facts.push(['Binds on', esc(r.binding.kind)]);
    if (left !== undefined)
      facts.push(['Ledgers left', `<span class="mono">${esc(formatCount(left))}</span>`]);
    facts.push([
      'Ends',
      `ledger <span class="mono">${esc(formatCount(r.binding.endsAtLedger))}</span> · ${esc(approxDateShort(r.binding.endsAt))}`,
    ]);
  }
  if (obs !== null && Number.isInteger(obs.observedAtLedger) && obs.observedAtLedger > 0)
    facts.push([
      'Read at',
      `ledger <span class="mono">${esc(formatCount(obs.observedAtLedger))}</span>${typeof obs.observedAt === 'string' ? ` · ${esc(stamp(obs.observedAt))}` : ''}`,
    ]);
  else if (
    r.bindingSource === 'browser' &&
    r.binding.state === 'live' &&
    r.binding.observedAtLedger
  )
    facts.push([
      'Read at',
      `ledger <span class="mono">${esc(formatCount(r.binding.observedAtLedger))}</span> · by this browser, not an engine check`,
    ]);
  else facts.push(['Read at', 'not checked by the engine yet']);

  const a = item.autopilot;
  const ap: [string, string][] = [];
  let actions = '';
  const forId = `/allowance/?for=${encodeURIComponent(item.contractId)}`;
  if (a?.enabled === true) {
    ap.push([
      'State',
      `on${typeof a.payerWallet === 'string' ? ` · paid by <span class="mono">${esc(short(a.payerWallet, 4, 4))}</span>` : ''}`,
    ]);
    if (Number.isInteger(a.thresholdLedgers))
      ap.push(['Act below', `<span class="mono">${esc(formatCount(a.thresholdLedgers!))}</span>`]);
    if (Number.isInteger(a.extendToLedgers))
      ap.push(['Extend to', `<span class="mono">${esc(formatCount(a.extendToLedgers!))}</span>`]);
    actions = `<div class="actions"><a class="pill secondary" href="${esc(forId)}">Edit autopilot</a></div>`;
  } else {
    ap.push(['State', 'off']);
    if (item.network === 'testnet')
      actions = `<div class="actions"><a class="pill" href="${esc(forId)}">Turn on autopilot</a></div>`;
  }

  return `${top}
    ${kv(facts)}
    <p class="panel-h">Autopilot</p>
    ${kv(ap)}
    ${actions}
    <p class="panel-h">Last runs</p>
    <p class="note unavailable">${NOT_YET_AVAILABLE}</p>
    <p><a href="/dashboard/watchlist/">Full details</a> · <button type="button" class="linkish" data-remove="${esc(
      item.contractId,
    )}">Remove</button> <span class="note" data-remove-status role="status"></span></p>`;
}
