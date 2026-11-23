/**
 * Step 2 of /allowance/ (components.md § "B, C, D"): the cap is prefilled from
 * the watchlist, not typed. Pure functions only; the page does the reads.
 *
 * A row's rent is the in-browser simulation of one extend, the same
 * `quoteRent` the scanner's cost read uses, asked for **Extend to** more
 * ledgers. That is the most one extend can add (from an entry at zero), so the
 * cap leans high rather than low; an unused pull is refunded. A row whose rent could not be
 * simulated, or was simulated only in part, is left out of the cap and says
 * so. It is never filled with a guess: a cap sized on a partial rent runs out
 * after the first pull.
 */
import { needsAction } from '../../../../packages/core/src/index';
import type { ContractRent } from './allowance-cap';
import { esc, formatCount, short } from './format';
import type { WatchItem } from './watchlist-view';

/**
 * The extend target used when a watch item has none stored (every row that is
 * still Off). 518,400 ledgers, about 30 days: `evergreen.config.example.json`'s
 * `extendToLedgers` and the scanner's default rent horizon. Proposed to DES on
 * 2026-11-23; the item's own setting wins when it has one.
 */
export const DEFAULT_EXTEND_TO_LEDGERS = 518_400;

/**
 * **Act below** when the item has none: 17,280 ledgers, about 1 day, the CLI's
 * and the example config's `bumpWhenRemainingLedgersBelow` (components.md
 * § "B, C, D", #648). The API refuses a value under its own floor; the page
 * never raises it silently.
 */
export const DEFAULT_THRESHOLD_LEDGERS = 17_280;

/** components.md § "The default of 2" (DES, 2026-11-23). A default, not a limit. */
export const DEFAULT_EXTENDS_TO_COVER = '2';

export type RentState =
  | { readonly kind: 'simulating' }
  | { readonly kind: 'ok'; readonly stroops: bigint; readonly atLedger: number }
  | { readonly kind: 'partial'; readonly excluded: number }
  | { readonly kind: 'failed' };

export interface CapRow {
  readonly item: WatchItem;
  readonly checked: boolean;
  readonly rent: RentState;
  /** Act below, ledgers. `undefined` when what was typed is not a whole number above zero. */
  readonly thresholdLedgers: number | undefined;
  /** Extend to, ledgers. The rent is simulated to this. `undefined` as above. */
  readonly extendToLedgers: number | undefined;
}

/** A whole number of ledgers above zero, or undefined. Nothing is coerced. */
export function parseLedgers(text: string): number | undefined {
  const t = text.trim().replace(/,/g, '');
  if (!/^[1-9]\d*$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** Why a row's two settings cannot be used, in the API's own terms, or undefined. */
export function settingsProblem(row: CapRow): string | undefined {
  if (row.thresholdLedgers === undefined || row.extendToLedgers === undefined)
    return 'Act below and Extend to must be whole numbers of ledgers above zero.';
  // The API's rule (extendToLedgers above thresholdLedgers), in core's words:
  // an extend that lands at or under Act below would act again at once.
  if (needsAction(row.extendToLedgers, row.thresholdLedgers))
    return 'Extend to must be more than Act below.';
  return undefined;
}

function thresholdFor(item: WatchItem): number {
  const a = item.autopilot;
  if (a?.enabled === true && Number.isInteger(a.thresholdLedgers) && (a.thresholdLedgers ?? 0) > 0)
    return a.thresholdLedgers as number;
  return DEFAULT_THRESHOLD_LEDGERS;
}

/** The extend horizon one pull pays for: the item's own `extendToLedgers`, or the default. */
export function extendToFor(item: WatchItem): number {
  const a = item.autopilot;
  if (a?.enabled === true && Number.isInteger(a.extendToLedgers) && (a.extendToLedgers ?? 0) > 0)
    return a.extendToLedgers as number;
  return DEFAULT_EXTEND_TO_LEDGERS;
}

/**
 * Rows this wallet can pay for: testnet only, and either autopilot is off or
 * this wallet is already its payer. The `?for=` contract comes first and is
 * the only one checked to start with.
 */
export function capRows(
  items: readonly WatchItem[],
  account: string,
  forContract: string | undefined,
): CapRow[] {
  const eligible = items.filter(
    (i) =>
      i.network === 'testnet' &&
      i.autopilot !== undefined &&
      i.autopilot !== null &&
      (i.autopilot.enabled === false || i.autopilot.payerWallet === account),
  );
  const first = eligible.filter((i) => i.contractId === forContract);
  const rest = eligible.filter((i) => i.contractId !== forContract);
  return [...first, ...rest].map((item) => ({
    item,
    checked: item.contractId === forContract,
    rent: { kind: 'simulating' },
    thresholdLedgers: thresholdFor(item),
    extendToLedgers: extendToFor(item),
  }));
}

/** What goes into `estimateAllowanceCap`: checked rows whose rent was fully simulated. */
export function capContracts(rows: readonly CapRow[], extendsToCover: bigint): ContractRent[] {
  return rows
    .filter((r) => r.checked && r.rent.kind === 'ok' && settingsProblem(r) === undefined)
    .map((r) => ({
      simulatedRentStroops: (r.rent as { stroops: bigint }).stroops,
      hostedActions: extendsToCover,
    }));
}

function rentCell(rent: RentState): string {
  switch (rent.kind) {
    case 'simulating':
      return '<span class="small muted">simulating…</span>';
    case 'ok':
      return `<span class="mono">${esc(formatCount(Number(rent.stroops)))} stroops</span><br /><span class="small muted">simulated at ledger <span class="mono">${esc(formatCount(rent.atLedger))}</span></span>`;
    case 'partial':
      return `<span class="small">Rent could only be simulated for part of this contract (${rent.excluded} entr${rent.excluded === 1 ? 'y' : 'ies'} left out), so it is left out of the cap.</span>`;
    case 'failed':
      return '<span class="small">Rent could not be simulated, so this contract is left out of the cap.</span>';
  }
}

function ledgersField(
  kind: 'threshold' | 'extend-to',
  index: number,
  value: number | undefined,
  label: string,
): string {
  return `<input class="mono" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" size="9" data-cap-${kind}="${index}" aria-label="${esc(label)}" value="${value === undefined ? '' : String(value)}" />`;
}

/** Whether a row's box can be ticked: fully simulated rent and usable settings. */
export function rowUsable(row: CapRow): boolean {
  return row.rent.kind === 'ok' && settingsProblem(row) === undefined;
}

/**
 * The rent cell of one row. The page swaps only this cell and the row's box
 * after a simulation or a settings change, never the inputs, so a number being
 * typed in another row keeps its value and its focus (DES review, #651).
 * `cover` is the row's coverage sentence (`coverageSentence`), when there is one.
 */
export function rowRentHtml(row: CapRow, cover?: string): string {
  const problem = settingsProblem(row);
  if (problem !== undefined)
    return `<span class="small">${esc(problem)} This contract is left out of the cap.</span>`;
  const line =
    cover === undefined
      ? ''
      : `<br /><span class="small muted" data-cap-cover>${esc(cover)}</span>`;
  return `${rentCell(row.rent)}${line}`;
}

export function capRowsHtml(rows: readonly CapRow[]): string {
  if (rows.length === 0) {
    return '<p class="small muted">No contract on your watchlist can be paid for by this wallet. Add one from <a href="/dashboard/scanner/">the scanner</a>, or enter rent by hand below.</p>';
  }
  return `<div class="table-wrap"><table>
      <thead><tr><th scope="col">Include</th><th scope="col">Contract</th><th scope="col">Act below, ledgers left</th><th scope="col">Extend to, ledgers</th><th scope="col">Rent, one extend</th></tr></thead>
      <tbody>${rows
        .map((r, index) => {
          const usable = rowUsable(r);
          const who = r.item.label ?? r.item.contractId;
          const name = r.item.label
            ? `${esc(r.item.label)} <span class="small muted mono">${esc(short(r.item.contractId))}</span>`
            : `<span class="mono" title="${esc(r.item.contractId)}">${esc(short(r.item.contractId))}</span>`;
          return `<tr data-cap-index="${index}">
            <td><input type="checkbox" data-cap-row="${index}" aria-label="Include ${esc(who)}"${r.checked && usable ? ' checked' : ''}${usable ? '' : ' disabled'} /></td>
            <td>${name}</td>
            <td>${ledgersField('threshold', index, r.thresholdLedgers, `Act below, ${who}`)}</td>
            <td>${ledgersField('extend-to', index, r.extendToLedgers, `Extend to, ${who}`)}</td>
            <td data-cap-rent>${rowRentHtml(r)}</td>
          </tr>`;
        })
        .join('')}</tbody></table></div>
    <p class="small muted">Act below is when the engine extends: at or under that many ledgers left. Extend to is how far one extend reaches, and the rent is simulated to it. Autopilot uses both for this contract once it is on. The ledgers are the rule; about 17,280 ledgers is a day.</p>`;
}
