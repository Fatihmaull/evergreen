/**
 * The watchlist's rendering logic (PH2-E3-02), against spec #350 §6 and §9a.
 *
 * Two rules decide every row:
 *
 * - **The binding expiry leads.** A contract stops working when its earliest
 *   entry does, which is usually the shared code entry, not the instance. The
 *   binding entry is `view.ts`'s `bindingEntry`, the same one the scanner uses,
 *   so the two screens cannot disagree.
 * - **Three conclusions, never two** (§9a, "the three honest states"):
 *   healthy, at risk, undetermined. A missing observation, a missing
 *   `observedAtLedger`, or `health: 'unknown'` is undetermined, never healthy.
 *
 * Pure functions, no DOM and no fetch, so they are tested with fixtures.
 */
import type {
  ContractId,
  LedgerKey,
  NetworkName,
} from '../../../../packages/shared-types/src/index';
import type { ApiOutcome } from './api';
import type { RemoveOutcome } from './watchlist';
import { report, type EntryHealth, type ScanResult } from './evergreen';
import { approxDate, esc, formatCount, stamp } from './format';
import { bindingEntry, entryView } from './view';

/** §6, verbatim in shape. Only the fields this screen renders are relied on. */
export interface WatchItem {
  readonly network: NetworkName;
  readonly contractId: ContractId;
  readonly label?: string;
  readonly addedAt: string;
  readonly scope: { readonly dataKeys: readonly LedgerKey[] } | { readonly noDataKeys: true };
  readonly autopilot:
    | { readonly enabled: false }
    | {
        readonly enabled: true;
        readonly payerWallet?: string;
        readonly thresholdLedgers?: number;
        readonly extendToLedgers?: number;
      };
  readonly extendNow: {
    readonly limitPerDay: number;
    readonly usedToday: number;
    readonly resetsAt: string;
  };
  readonly lastObservation: {
    readonly observedAtLedger: number;
    readonly observedAt: string;
    readonly scan: ScanResult;
    readonly health: EntryHealth;
  } | null;
}

export type Conclusion = 'healthy' | 'at-risk' | 'undetermined';

export type Binding =
  | { readonly state: 'expired'; readonly word: 'archived' | 'deleted'; readonly kind: string }
  | {
      readonly state: 'live';
      readonly endsAtLedger: number;
      readonly endsAt: Date | undefined;
      readonly kind: string;
      /** Ledgers left after the ledger it was read at, from `entryView`. */
      readonly remainingLedgers?: number;
      readonly observedAtLedger?: number;
    }
  | { readonly state: 'undetermined' };

export interface Row {
  readonly item: WatchItem;
  readonly conclusion: Conclusion;
  /** Why undetermined, when it is. About the contract, not about us (§9a). */
  readonly why?: string;
  readonly binding: Binding;
  /**
   * Who read the binding expiry: the engine's stored observation, or this
   * browser reading the chain because the engine has stored none yet. A
   * browser read never makes a row healthy.
   */
  readonly bindingSource?: 'engine' | 'browser';
}

function hasObservation(
  item: WatchItem,
): item is WatchItem & { lastObservation: NonNullable<WatchItem['lastObservation']> } {
  const o = item.lastObservation;
  return (
    o !== null &&
    o !== undefined &&
    Number.isInteger(o.observedAtLedger) &&
    o.observedAtLedger > 0 &&
    typeof o.observedAt === 'string' &&
    o.scan !== undefined &&
    o.scan !== null
  );
}

/** The binding expiry of one scan, through the same `bindingEntry` the scanner uses. */
export function bindingFromScan(scan: ScanResult, now = new Date()): Binding {
  try {
    const b = bindingEntry(report(scan).entries, now);
    if (b === undefined) return { state: 'undetermined' };
    const v = entryView(b, now);
    if (v.state === 'expired') return { state: 'expired', word: v.word, kind: b.entry.kind };
    if (v.state === 'live')
      return {
        state: 'live',
        endsAtLedger: v.endsAtLedger,
        endsAt: v.endsAt,
        kind: b.entry.kind,
        remainingLedgers: v.remainingLedgers,
        observedAtLedger: v.observedAtLedger,
      };
  } catch {
    // fall through
  }
  return { state: 'undetermined' };
}

/**
 * `browserScan` is this browser's own read of the chain, for a row the engine
 * has not observed yet (Stage 1: `lastObservation` is null). It fills the
 * binding expiry only. The health conclusion stays undetermined, because the
 * engine has not checked the contract and a page read is not its check.
 */
export function rowFor(item: WatchItem, now = new Date(), browserScan?: ScanResult): Row {
  if (item.lastObservation === null) {
    const binding = browserScan === undefined ? undefined : bindingFromScan(browserScan, now);
    if (binding !== undefined && binding.state !== 'undetermined') {
      return {
        item,
        conclusion: 'undetermined',
        why: 'Not checked by the engine yet. The expiry beside it is this browser reading the chain now.',
        binding,
        bindingSource: 'browser',
      };
    }
    return {
      item,
      conclusion: 'undetermined',
      why: 'Not scanned yet.',
      binding: { state: 'undetermined' },
    };
  }
  if (!hasObservation(item)) {
    // §9a: a health state without its observation is a client-side error, not a state to render.
    return {
      item,
      conclusion: 'undetermined',
      why: 'The observation behind this state is missing, so it is not shown.',
      binding: { state: 'undetermined' },
    };
  }
  const obs = item.lastObservation;
  const binding = bindingFromScan(obs.scan, now);

  if (binding.state === 'expired')
    return { item, conclusion: 'at-risk', binding, bindingSource: 'engine' };
  if (obs.health === 'warning' || obs.health === 'critical')
    return { item, conclusion: 'at-risk', binding, bindingSource: 'engine' };
  if (obs.health === 'healthy' && binding.state === 'live')
    return { item, conclusion: 'healthy', binding, bindingSource: 'engine' };
  return {
    item,
    conclusion: 'undetermined',
    why:
      obs.health === 'healthy'
        ? 'Reported healthy, but no entry with a TTL came back, so the binding expiry is unknown.'
        : "The last scan could not establish this contract's state.",
    binding,
  };
}

/**
 * Order: expired first, then undetermined (an unknown is not safe to sink to
 * the bottom), then live by binding ledger, soonest first.
 */
export function orderRows(rows: readonly Row[]): Row[] {
  const rank = (r: Row): [number, number] =>
    r.binding.state === 'expired'
      ? [0, 0]
      : r.binding.state === 'undetermined' || r.conclusion === 'undetermined'
        ? [1, 0]
        : [2, r.binding.endsAtLedger];
  return [...rows].sort((a, b) => {
    const [ra, la] = rank(a);
    const [rb, lb] = rank(b);
    return ra - rb || la - lb;
  });
}

const WORD: Record<Conclusion, string> = {
  healthy: 'healthy',
  'at-risk': 'at risk',
  undetermined: 'undetermined',
};
const CHIP: Record<Conclusion, string> = {
  healthy: 'healthy',
  'at-risk': 'critical',
  undetermined: 'undetermined',
};

/** At risk is one conclusion; the chip says how close, from the engine's own health word. */
function chipClass(r: Row): string {
  if (
    r.conclusion === 'at-risk' &&
    r.binding.state !== 'expired' &&
    r.item.lastObservation?.health === 'warning'
  )
    return 'warning';
  return CHIP[r.conclusion];
}

const LEDGERS_PER_DAY = 17_280;
const days = (ledgers: number): string => {
  const d = ledgers / LEDGERS_PER_DAY;
  return `about ${d >= 1 ? Math.round(d) : Math.round(d * 10) / 10} day${Math.round(d) === 1 ? '' : 's'}`;
};
const short = (g: string): string => `${g.slice(0, 6)}…${g.slice(-6)}`;

/**
 * Autopilot, as the API stored it. "On" is a setting, not a promise that the
 * engine has acted: with no observation the cell says the engine has not
 * stored a check of this contract, so nothing has been decided for it yet.
 */
export function autopilotCell(item: WatchItem): string {
  const a = item.autopilot;
  if (a === undefined || a === null || typeof a.enabled !== 'boolean')
    return '<span class="chip undetermined"><span class="shape"></span>undetermined</span>';
  if (!a.enabled) return '<span class="small">Off</span>';
  const parts: string[] = [];
  if (Number.isInteger(a.thresholdLedgers) && (a.thresholdLedgers as number) > 0)
    parts.push(
      `acts below <span class="mono">${esc(formatCount(a.thresholdLedgers as number))}</span> ledgers left (${days(a.thresholdLedgers as number)})`,
    );
  if (Number.isInteger(a.extendToLedgers) && (a.extendToLedgers as number) > 0)
    parts.push(
      `extends to <span class="mono">${esc(formatCount(a.extendToLedgers as number))}</span> (${days(a.extendToLedgers as number)})`,
    );
  if (typeof a.payerWallet === 'string' && a.payerWallet.length > 12)
    parts.push(`paid by <span class="mono">${esc(short(a.payerWallet))}</span>`);
  const pending =
    item.lastObservation === null
      ? '<br /><span class="small muted">No engine check of this contract is stored yet, so autopilot has not decided anything for it.</span>'
      : '';
  return `<span class="small">On</span>${parts.length ? ` <span class="small muted">${parts.join(' · ')}</span>` : ''}${pending}`;
}

export function bindingCell(b: Binding, source?: 'engine' | 'browser'): string {
  const by =
    source === 'browser'
      ? `<br /><span class="small muted">read by this browser${b.state === 'live' && b.observedAtLedger !== undefined ? ` at ledger <span class="mono">${esc(formatCount(b.observedAtLedger))}</span>` : ''}, not an engine check</span>`
      : '';
  if (b.state === 'expired')
    return `<span class="chip expired"><span class="shape"></span>${b.word}</span> <span class="small muted">${esc(b.kind)} entry</span>${by}`;
  if (b.state === 'live') {
    const left =
      b.remainingLedgers !== undefined && Number.isInteger(b.remainingLedgers)
        ? ` · <span class="mono">${esc(formatCount(b.remainingLedgers))}</span> ledgers left (${days(b.remainingLedgers)})`
        : '';
    return `ledger <span class="mono">${esc(formatCount(b.endsAtLedger))}</span> <span class="small muted">${esc(approxDate(b.endsAt))}${left} · ${esc(b.kind)} entry</span>${by}`;
  }
  return '<span class="chip undetermined"><span class="shape"></span>undetermined</span>';
}

function coverage(item: WatchItem): string {
  return 'noDataKeys' in item.scope
    ? 'instance and code only'
    : `${formatCount(item.scope.dataKeys.length)} data key${item.scope.dataKeys.length === 1 ? '' : 's'} declared`;
}

export function rowHtml(r: Row): string {
  const { item } = r;
  const obs = item.lastObservation;
  const seen =
    obs !== null && r.why === undefined
      ? `ledger <span class="mono">${esc(formatCount(obs.observedAtLedger))}</span>, ${esc(stamp(obs.observedAt))}`
      : obs !== null && Number.isInteger(obs.observedAtLedger) && obs.observedAtLedger > 0
        ? `ledger <span class="mono">${esc(formatCount(obs.observedAtLedger))}</span>`
        : '—';
  const name = item.label
    ? `${esc(item.label)} <span class="small muted mono">${esc(item.contractId.slice(0, 6))}…${esc(item.contractId.slice(-4))}</span>`
    : `<span class="mono">${esc(item.contractId.slice(0, 6))}…${esc(item.contractId.slice(-4))}</span>`;
  return `<tr>
      <td>${bindingCell(r.binding, r.bindingSource)}</td>
      <td><span class="chip ${chipClass(r)}"><span class="shape"></span>${WORD[r.conclusion]}</span>${r.why ? ` <span class="small muted">${esc(r.why)}</span>` : ''}</td>
      <td>${name}</td>
      <td class="small">${seen}</td>
      <td class="small muted">${esc(coverage(item))}</td>
      <td>${autopilotCell(item)}</td>
      <td><button type="button" class="btn" data-remove-network="${esc(item.network)}" data-remove-contract="${esc(item.contractId)}">Remove</button> <span class="small" data-remove-status role="status"></span></td>
    </tr>`;
}

export function tableHtml(
  items: readonly WatchItem[],
  now = new Date(),
  browserScans: ReadonlyMap<string, ScanResult> = new Map(),
): string {
  if (items.length === 0) {
    return '<p class="muted">Your watchlist is empty. Add a contract from <a href="/dashboard/scanner/">the scanner</a>.</p>';
  }
  const rows = orderRows(items.map((i) => rowFor(i, now, browserScans.get(i.contractId))));
  return `<div class="table-wrap"><table>
      <thead><tr><th scope="col">Binding expiry</th><th scope="col">Health</th><th scope="col">Contract</th><th scope="col">Last observed</th><th scope="col">Coverage</th><th scope="col">Autopilot</th><th scope="col">Remove</th></tr></thead>
      <tbody>${rows.map(rowHtml).join('')}</tbody></table></div>
    <p class="small muted">Each row is the engine's last scan, not now: the ledger it was read at is beside it. Ledgers are the truth, dates are a convenience. A scan without declared data keys covers the instance and code only, and absence is not health.</p>`;
}

/** `GET /watchlist` answered `NOT_FOUND` or `METHOD_NOT_ALLOWED` in the §9 envelope. */
export const ROUTE_NOT_AVAILABLE =
  'The watchlist route is not available on this API yet. This says nothing about any contract. <a href="/dashboard/scanner/">The scanner</a> reads the chain directly and works now.';

/** `UPSTREAM_UNAVAILABLE` on `GET /watchlist`: what the API said, and no cause (§9). */
export const GET_UPSTREAM_UNAVAILABLE_TEXT =
  'The API answered, but could not complete this, so the watchlist could not be read. This is about us, not your contracts.';

/** `DELETE` answered `NOT_FOUND`: no such live item for this account. Claims no cause. */
export const REMOVE_NOTHING_TO_REMOVE_TEXT = 'Nothing to remove for this account.';

/** Only shown for a 200 `{ items: [] }`: the API answered an authenticated session. */
export const SIGNED_IN_EMPTY = 'Signed in. Nothing watched yet.';

const undeterminedBox = (sentence: string): string =>
  `<div class="verdict undetermined"><div class="row"><span class="chip undetermined"><span class="shape"></span>undetermined</span></div><p class="headline">${sentence}</p></div>`;

/**
 * The whole screen from one `GET /watchlist` outcome.
 *
 * No example data is ever shown here. When the API is absent the screen says
 * so and shows nothing about any contract, because a list of plausible rows
 * under an "Example data" label is still a picture of health nobody measured.
 * The examples live in the tests' fixtures instead.
 */
export function watchlistScreenHtml(
  outcome: ApiOutcome<{ items?: unknown }>,
  now = new Date(),
  browserScans: ReadonlyMap<string, ScanResult> = new Map(),
): string {
  if (outcome.kind === 'ok') {
    const items = outcome.data?.items;
    if (!Array.isArray(items)) {
      return undeterminedBox(
        'The API answered, but not with a watchlist this page can read. We could not establish this.',
      );
    }
    // A 200 with a list is the API answering an authenticated session, which is
    // the only thing "signed in" rests on here. It says nothing about contracts.
    return items.length === 0
      ? `<p class="small" role="status">${SIGNED_IN_EMPTY}</p>${tableHtml([], now)}`
      : tableHtml(items as WatchItem[], now, browserScans);
  }
  if (outcome.kind === 'unavailable') {
    return undeterminedBox(
      outcome.reason === 'network'
        ? 'The Evergreen API did not answer, so there is no watchlist to show. This says nothing about your contracts: it is about us.'
        : 'The Evergreen API is not available on this site yet, so there is no watchlist to show. This says nothing about any contract. <a href="/dashboard/scanner/">The scanner</a> reads the chain directly and works now.',
    );
  }
  if (outcome.code === 'UNAUTHENTICATED') {
    return '<div class="card card-pad"><p>A watchlist belongs to a signed-in session, and this browser has none. Nothing is shown.</p><p class="small muted"><a href="/dashboard/scanner/">The scanner</a> needs no session.</p></div>';
  }
  if (outcome.code === 'NOT_FOUND' || outcome.code === 'METHOD_NOT_ALLOWED') {
    // The API answered in its own envelope, but not with this route. That is all
    // it says: no cause, no date for when the route will exist.
    return undeterminedBox(ROUTE_NOT_AVAILABLE);
  }
  if (outcome.code === 'UPSTREAM_UNAVAILABLE') {
    return undeterminedBox(GET_UPSTREAM_UNAVAILABLE_TEXT);
  }
  if (outcome.code === 'RATE_LIMITED') {
    const s = outcome.retryAfterSeconds;
    return undeterminedBox(
      s === undefined
        ? 'Too many attempts. Try again later.'
        : `Too many attempts. Try again in ${Math.max(1, Math.ceil(s / 60))} minute(s).`,
    );
  }
  return undeterminedBox('We could not establish this.');
}

/**
 * What a row says after `DELETE /watchlist/...` answers. Only `removed` (a 204)
 * takes the row away; every other answer leaves the row and says what the API
 * did and did not confirm.
 * Returns `undefined` for `removed`, because the row is simply gone.
 */
export function removeOutcomeText(outcome: RemoveOutcome): string | undefined {
  if (outcome.kind === 'removed') return undefined;
  if (outcome.kind === 'unavailable') {
    return outcome.reason === 'network'
      ? 'The Evergreen API did not answer. Nothing was removed.'
      : 'The Evergreen API is not available on this site yet. Nothing was removed.';
  }
  if (outcome.code === 'UNAUTHENTICATED') {
    return 'This browser is signed out, so nothing was removed. Sign in and try again.';
  }
  if (outcome.code === 'RATE_LIMITED') {
    const s = outcome.retryAfterSeconds;
    return s === undefined
      ? 'Too many attempts. Nothing was removed. Try again later.'
      : `Too many attempts. Nothing was removed. Try again in ${Math.max(1, Math.ceil(s / 60))} minute(s).`;
  }
  if (outcome.code === 'NOT_FOUND') return REMOVE_NOTHING_TO_REMOVE_TEXT;
  // Not "it is still listed": a failed call does not establish that either way.
  return `The API did not confirm this removal (${outcome.code}, HTTP ${outcome.status}).`;
}
