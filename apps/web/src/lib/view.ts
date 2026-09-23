/**
 * The only place in the web app that reads a raw TTL.
 *
 * WHY THIS FILE EXISTS. When an entry is archived the RPC still returns it,
 * with `liveUntilLedgerSeq: 0`. Core faithfully reports what it was given —
 * `ttl.status: 'known'`, `endsAtLedger: 0`, `remainingLedgers: 0 - observed` —
 * and its assessment layer then says `isExpired: true` with the sentence to
 * print. Every renderer that reached past the assessment for the raw numbers
 * printed `-4,810,562 ledgers` and `~Dec 18, 2025` instead: a confident, precise,
 * entirely wrong answer with no error. That is the failure this product exists
 * to name, and it arrived in its own interface the day guinea-pig B expired.
 *
 * Those figures are artefacts of a zero, not data. There is nothing to show, so
 * this returns a shape with nowhere to put them rather than a labelled lie.
 *
 * A test (`test/raw-ttl-is-confined.test.ts`) fails if any other file under
 * `src/` reads `ttl.remainingLedgers`, `ttl.endsAtLedger` or calls
 * `estimateEndsAt`. Fix the class here, once.
 *
 * ---
 *
 * WHAT THIS IS COUPLED TO, AND WHAT SHOULD HAPPEN WHEN THAT CHANGES
 *
 * This file is a workaround for a defect in core that is not ours to fix.
 *
 * **The coupling.** For an archived entry the RPC still returns the entry, with
 * `liveUntilLedgerSeq: 0`. Core passes that through as
 * `ttl.status: 'known'`, `endsAtLedger: 0`, `remainingLedgers: 0 - observed` —
 * a value it does not know, reported as one it does. `entryView` keys on
 * `hasExpired(ttl.remainingLedgers) || assessment.isExpired` and then refuses
 * to render `endsAtLedger` or any date derived from it, because both are the
 * arithmetic of that zero rather than measurements. The real end ledger comes
 * from `ops/crossing-schedule.json`, which recorded it before the chain
 * stopped being able to.
 *
 * **When core is fixed** — reporting an archived entry as its own state rather
 * than as a `known` TTL of zero — this file's handling changes meaning
 * silently, and that is the hazard worth writing down. Specifically:
 *
 *   - If core adds a distinct status (say `ttl.status: 'expired'`), the
 *     `status !== 'known'` branch above will start catching archived entries
 *     and return `unread` for them. `unread` and `archived` are different
 *     answers, and the dashboard would quietly start giving the wrong one.
 *     The fix is to map that status to the `expired` branch, not to leave it.
 *   - If core keeps `known` but reports the true final ledger, the
 *     `KNOWN_ENDS` lookup becomes redundant rather than wrong — prefer core's
 *     value and keep the schedule only as a fallback for subjects it lacks.
 *   - If core starts throwing on archived entries, none of this runs and the
 *     scan fails instead. That would be worse than today and should be argued
 *     against.
 *
 * Raised on #194 when the browser fix landed; it is the CLI/engine track's
 * call. Whoever changes this: the test file named above renders an archived
 * entry from a recorded scan, so it will tell you which of the three happened.
 */
import { estimateEndsAt, hasExpired, type AssessedEntry } from './evergreen';

/**
 * Final ledgers for our own contracts, injected at build time from
 * `ops/crossing-schedule.json` — which declares itself the single source of
 * truth for the crossings and is the only place these were measured before the
 * chain stopped reporting them.
 *
 * It exists because the chain forgets: once an entry is archived its
 * `liveUntilLedgerSeq` reads 0, so the ledger it actually ended at is no longer
 * readable from a scan. For a stranger's contract we therefore say so rather
 * than inventing one.
 */
import knownEndsData from '../../data/known-ends.json';

const KNOWN_ENDS: Record<
  string,
  { readonly instance?: number; readonly persistent?: number; readonly endsOn?: string }
> = knownEndsData;

export const KNOWN_ENDS_SOURCE = 'ops/crossing-schedule.json';

export type EntryView =
  | {
      readonly state: 'expired';
      /** `archived` or `deleted` — which end this entry kind actually has. */
      readonly word: 'archived' | 'deleted';
      /** Core's own sentence, printed verbatim. Never reworded here. */
      readonly reason: string;
      readonly observedAtLedger: number;
      /** Only when a committed measurement recorded it. The chain no longer can. */
      readonly endedAtLedger?: number;
      readonly endedOn?: string;
    }
  | {
      readonly state: 'live';
      readonly remainingLedgers: number;
      readonly endsAtLedger: number;
      readonly endsAt: Date | undefined;
      readonly observedAtLedger: number;
    }
  | { readonly state: 'unread'; readonly observedAtLedger: number };

function knownEndFor(e: AssessedEntry): { ledger?: number | undefined; on?: string | undefined } {
  const kind = e.entry.kind;
  if (kind !== 'instance' && kind !== 'persistent') return {};
  for (const id of e.entry.contracts) {
    const known = KNOWN_ENDS[id];
    if (known === undefined) continue;
    const ledger = kind === 'instance' ? known.instance : known.persistent;
    if (typeof ledger === 'number') return { ledger, on: known.endsOn };
  }
  return {};
}

/** Raw TTL in, renderable state out. Reuses core's `hasExpired` and its reason. */
export function entryView(e: AssessedEntry, now = new Date()): EntryView {
  const ttl = e.entry.ttl;
  const observedAtLedger = e.entry.observedAtLedger;

  if (ttl.status !== 'known') return { state: 'unread', observedAtLedger };

  // `hasExpired` is core's, not a local `< 0`: remaining 0 is the final LIVE
  // ledger, and re-deriving that boundary is how it gets got wrong.
  if (hasExpired(ttl.remainingLedgers) || e.assessment.isExpired) {
    const known = knownEndFor(e);
    return {
      state: 'expired',
      word: e.entry.endBehavior === 'deleted' ? 'deleted' : 'archived',
      reason: e.assessment.reason,
      observedAtLedger,
      ...(known.ledger === undefined ? {} : { endedAtLedger: known.ledger }),
      ...(known.on === undefined ? {} : { endedOn: known.on }),
    };
  }

  return {
    state: 'live',
    remainingLedgers: ttl.remainingLedgers,
    endsAtLedger: ttl.endsAtLedger,
    endsAt: estimateEndsAt(ttl, now),
    observedAtLedger,
  };
}

/**
 * The entry that decides the contract's fate.
 *
 * An expired entry binds absolutely — the contract is already not working, and
 * no live entry's date changes that. Previously this ranked by `endsAtLedger`
 * and reached the same answer only because the fabricated value happened to be
 * `0`, which is smaller than every real ledger. Right answer, wrong reason, and
 * it would have stopped being the right answer the moment the zero changed.
 */
export function bindingEntry(
  entries: readonly AssessedEntry[],
  now = new Date(),
): AssessedEntry | undefined {
  const views = entries.map((e) => ({ e, v: entryView(e, now) }));
  const expired = views.filter((x) => x.v.state === 'expired');
  if (expired.length > 0) return expired[0]!.e;
  const live = views.filter(
    (x): x is { e: AssessedEntry; v: Extract<EntryView, { state: 'live' }> } =>
      x.v.state === 'live',
  );
  if (live.length === 0) return undefined;
  return live.reduce((a, b) => (a.v.endsAtLedger <= b.v.endsAtLedger ? a : b)).e;
}
