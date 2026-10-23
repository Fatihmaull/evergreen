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
  readonly autopilot: { readonly enabled: boolean };
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
    }
  | { readonly state: 'undetermined' };

export interface Row {
  readonly item: WatchItem;
  readonly conclusion: Conclusion;
  /** Why undetermined, when it is. About the contract, not about us (§9a). */
  readonly why?: string;
  readonly binding: Binding;
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

export function rowFor(item: WatchItem, now = new Date()): Row {
  if (item.lastObservation === null) {
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
  let binding: Binding = { state: 'undetermined' };
  try {
    const b = bindingEntry(report(obs.scan).entries, now);
    if (b !== undefined) {
      const v = entryView(b, now);
      if (v.state === 'expired') binding = { state: 'expired', word: v.word, kind: b.entry.kind };
      else if (v.state === 'live')
        binding = {
          state: 'live',
          endsAtLedger: v.endsAtLedger,
          endsAt: v.endsAt,
          kind: b.entry.kind,
        };
    }
  } catch {
    binding = { state: 'undetermined' };
  }

  if (binding.state === 'expired') return { item, conclusion: 'at-risk', binding };
  if (obs.health === 'warning' || obs.health === 'critical')
    return { item, conclusion: 'at-risk', binding };
  if (obs.health === 'healthy' && binding.state === 'live')
    return { item, conclusion: 'healthy', binding };
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

function bindingCell(b: Binding): string {
  if (b.state === 'expired')
    return `<span class="chip expired"><span class="shape"></span>${b.word}</span> <span class="small muted">${esc(b.kind)} entry</span>`;
  if (b.state === 'live')
    return `ledger <span class="mono">${esc(formatCount(b.endsAtLedger))}</span> <span class="small muted">${esc(approxDate(b.endsAt))} · ${esc(b.kind)} entry</span>`;
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
      <td>${bindingCell(r.binding)}</td>
      <td><span class="chip ${CHIP[r.conclusion]}"><span class="shape"></span>${WORD[r.conclusion]}</span>${r.why ? ` <span class="small muted">${esc(r.why)}</span>` : ''}</td>
      <td>${name}</td>
      <td class="small">${seen}</td>
      <td class="small muted">${esc(coverage(item))}</td>
      <td><button type="button" class="btn" data-remove-network="${esc(item.network)}" data-remove-contract="${esc(item.contractId)}">Remove</button> <span class="small" data-remove-status role="status"></span></td>
    </tr>`;
}

export function tableHtml(items: readonly WatchItem[], now = new Date()): string {
  if (items.length === 0) {
    return '<p class="muted">Your watchlist is empty. Add a contract from <a href="/dashboard/scanner/">the scanner</a>.</p>';
  }
  const rows = orderRows(items.map((i) => rowFor(i, now)));
  return `<div class="table-wrap"><table>
      <thead><tr><th scope="col">Binding expiry</th><th scope="col">Health</th><th scope="col">Contract</th><th scope="col">Last observed</th><th scope="col">Coverage</th><th scope="col">Remove</th></tr></thead>
      <tbody>${rows.map(rowHtml).join('')}</tbody></table></div>
    <p class="small muted">Each row is the engine's last scan, not now: the ledger it was read at is beside it. Ledgers are the truth, dates are a convenience. A scan without declared data keys covers the instance and code only, and absence is not health.</p>`;
}

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
): string {
  if (outcome.kind === 'ok') {
    const items = outcome.data?.items;
    if (!Array.isArray(items)) {
      return undeterminedBox(
        'The API answered, but not with a watchlist this page can read. We could not establish this.',
      );
    }
    return tableHtml(items as WatchItem[], now);
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
  if (outcome.code === 'UPSTREAM_UNAVAILABLE') {
    return undeterminedBox(
      'The API answered, but its database or RPC did not, so the watchlist could not be read. This is about us, not your contracts.',
    );
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
 * takes the row away; every other answer says the contract is still listed.
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
  return `The API did not remove this (${outcome.code}, HTTP ${outcome.status}). It is still on your watchlist.`;
}
