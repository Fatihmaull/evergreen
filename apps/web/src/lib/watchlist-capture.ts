/**
 * PH2-E3-02 evidence capture: the five things Fatih looks at on
 * `/dashboard/watchlist/` once the first engine observation lands (checklist,
 * "Step 7, second look"), printed as pass / fail / undetermined from the
 * `GET /watchlist` answer.
 *
 * Read-only and pure. It goes through the page's own `rowFor` and `rowHtml`, so
 * it says what the page would render for that JSON. It is NOT a screenshot of
 * what is on screen: the screenshot with the address bar stays the evidence.
 * The live scan for item 5 is the caller's, so this module touches no network.
 */
import { report, type ScanResult } from './evergreen';
import { formatCount } from './format';
import { entryView } from './view';
import { bindingFromScan, rowFor, rowHtml, type Binding, type WatchItem } from './watchlist-view';

/** Guinea-pig A, the project's own working subject (checklist, Part B). */
export const GUINEA_PIG_A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';

export type Status = 'pass' | 'fail' | 'undetermined';

export interface Line {
  readonly n: 1 | 2 | 3 | 4 | 5;
  readonly label: string;
  readonly status: Status;
  readonly detail: string;
}

export interface ItemReport {
  readonly contractId: string;
  /** False when the engine has stored no observation: not the time to run this. */
  readonly observed: boolean;
  readonly lines: readonly Line[];
}

/** What the caller's live scan of the same contract produced. */
export type Live = { readonly binding: Binding } | { readonly error: string };

const LABELS = {
  1: 'State chip, no "why" line',
  2: 'Observation ledger beside the state',
  3: 'Binding expiry names the earliest entry',
  4: 'Source is the engine, not this browser',
  5: 'Binding agrees with the scanner now',
} as const;

function line(n: Line['n'], status: Status, detail: string): Line {
  return { n, label: LABELS[n], status, detail };
}

function describe(b: Binding): string {
  if (b.state === 'live') return `${b.kind} entry, ends at ledger ${formatCount(b.endsAtLedger)}`;
  if (b.state === 'expired') return `${b.kind} entry, ${b.word}`;
  return 'undetermined';
}

/**
 * The earliest end among the scan's own entries, recomputed here by a plain
 * minimum rather than by `bindingEntry`, so item 3 is not the page agreeing
 * with itself. An expired entry binds absolutely.
 */
function earliest(
  scan: ScanResult,
  now: Date,
): { kind: string; endsAtLedger?: number } | undefined {
  const views = report(scan).entries.map((e) => ({ kind: e.entry.kind, v: entryView(e, now) }));
  const expired = views.find((x) => x.v.state === 'expired');
  if (expired) return { kind: expired.kind };
  let best: { kind: string; endsAtLedger: number } | undefined;
  for (const x of views) {
    if (x.v.state !== 'live') continue;
    if (best === undefined || x.v.endsAtLedger < best.endsAtLedger)
      best = { kind: x.kind, endsAtLedger: x.v.endsAtLedger };
  }
  return best;
}

export function captureItem(item: WatchItem, now: Date, live: Live | undefined): ItemReport {
  const obs = item.lastObservation;
  if (obs === null || obs === undefined) {
    return {
      contractId: item.contractId,
      observed: false,
      lines: [
        line(
          1,
          'undetermined',
          'No engine observation is stored for this contract yet, so there is nothing to check.',
        ),
      ],
    };
  }

  const row = rowFor(item, now);
  const html = rowHtml(row);
  const lines: Line[] = [];

  // 1. A state chip, and no "why" line.
  if (row.conclusion !== 'undetermined' && row.why === undefined)
    lines.push(line(1, 'pass', `chip reads ${row.conclusion}`));
  else
    lines.push(
      line(
        1,
        'fail',
        `chip reads ${row.conclusion}${row.why ? `, with the line "${row.why}"` : ''}. Report it; do not pass it.`,
      ),
    );

  // 2. The observation ledger beside the state.
  const shown = `ledger <span class="mono">${formatCount(obs.observedAtLedger)}</span>`;
  if (
    Number.isInteger(obs.observedAtLedger) &&
    obs.observedAtLedger > 0 &&
    typeof obs.observedAt === 'string' &&
    html.includes(shown)
  )
    lines.push(line(2, 'pass', `ledger ${formatCount(obs.observedAtLedger)}, ${obs.observedAt}`));
  else
    lines.push(
      line(
        2,
        'fail',
        'a state with no observation ledger beside it is a P0 (§9a), not a display bug.',
      ),
    );

  // 3. The binding is the earliest entry; for guinea-pig A that is the code entry.
  const min = earliest(obs.scan, now);
  const b = row.binding;
  if (b.state === 'undetermined' || min === undefined) {
    lines.push(line(3, 'fail', 'the page shows no binding expiry for this observation.'));
  } else {
    const same =
      b.kind === min.kind && (b.state === 'expired' || b.endsAtLedger === min.endsAtLedger);
    const a = item.contractId === GUINEA_PIG_A;
    if (!same)
      lines.push(
        line(
          3,
          'fail',
          `the page shows the ${b.kind} entry, but the earliest end in the scan is the ${min.kind} entry.`,
        ),
      );
    else if (a && b.kind !== 'code')
      lines.push(
        line(
          3,
          'fail',
          `guinea-pig A should bind on the shared code entry, but the page names the ${b.kind} entry.`,
        ),
      );
    else lines.push(line(3, 'pass', describe(b) + (a ? ' (guinea-pig A: code, as expected)' : '')));
  }

  // 4. The engine is the source; the browser-read line is absent.
  if (row.bindingSource === 'engine' && !html.includes('read by this browser'))
    lines.push(line(4, 'pass', 'bindingSource is engine; no "read by this browser" line'));
  else
    lines.push(
      line(
        4,
        'fail',
        `bindingSource is ${row.bindingSource ?? 'unset'}; the row is not on an engine read.`,
      ),
    );

  // 5. The binding agrees with a scan taken now.
  if (live === undefined) lines.push(line(5, 'undetermined', 'no live scan was taken.'));
  else if ('error' in live)
    lines.push(line(5, 'undetermined', `the live scan did not complete: ${live.error}`));
  else {
    const l = live.binding;
    if (l.state === 'undetermined' || b.state === 'undetermined')
      lines.push(line(5, 'undetermined', `engine ${describe(b)}; scanner ${describe(l)}.`));
    else if (
      l.state === b.state &&
      l.kind === b.kind &&
      (l.state === 'expired' || (b.state === 'live' && l.endsAtLedger === b.endsAtLedger))
    )
      lines.push(line(5, 'pass', `both read ${describe(b)}`));
    else
      lines.push(
        line(
          5,
          'undetermined',
          `engine: ${describe(b)}. scanner now: ${describe(l)}. An extension may have landed after ledger ${formatCount(obs.observedAtLedger)}; read the scanner by eye before calling this a fault.`,
        ),
      );
  }

  return { contractId: item.contractId, observed: true, lines };
}

export type Verdict = 'ready-pass' | 'fail' | 'undetermined' | 'not-time';

/** One word for the whole answer: all pass, any fail, or not time yet. */
export function verdict(reports: readonly ItemReport[]): Verdict {
  if (reports.length === 0 || reports.every((r) => !r.observed)) return 'not-time';
  const lines = reports.filter((r) => r.observed).flatMap((r) => r.lines);
  if (lines.some((l) => l.status === 'fail')) return 'fail';
  if (lines.some((l) => l.status === 'undetermined')) return 'undetermined';
  return 'ready-pass';
}

export { bindingFromScan };
