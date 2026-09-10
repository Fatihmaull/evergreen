import type { LedgerEntryTTL, TTLObservation } from '@evergreen-stellar/shared-types';

/**
 * TTL math. Pure — no SDK, no I/O, no clock.
 *
 * The boundary is INCLUSIVE and this is the single easiest thing to get wrong
 * here. `endsAtLedger` is the entry's final *live* ledger, so:
 *
 *   remainingLedgers === 0   -> still live, on its last ledger
 *   remainingLedgers < 0     -> expired
 *
 * Observed on testnet 2026-09-06 (`W1-D4-13`): an entry was present at ledger
 * 4,529,810 with remaining 0 and absent at 4,529,811. See
 * `docs/SOROBAN-PRIMER.md`. A `<= 0` guard reports a live entry as dead — wrong
 * by one ledger, in the dangerous direction, and silently.
 */

/**
 * Ledgers close at ~5s on testnet (measured over 100,000 ledgers, 2026-09-05).
 *
 * A bare number cannot say how well it is known. Prefer `MEASURED_TESTNET_CADENCE`
 * and `projectEnd` below, which carry provenance and a band; this stays for the
 * simple display path and is the single place the figure is written down.
 */
export const SECONDS_PER_LEDGER = 5;

export function observeTTL(args: {
  liveUntilLedgerSeq: number | undefined;
  observedAtLedger: number;
}): TTLObservation {
  // Absent for entry types that carry no TTL. Never fabricate a zero: "unknown"
  // and "expiring now" must not collapse into the same value.
  if (args.liveUntilLedgerSeq === undefined) return { status: 'unavailable' };
  return {
    status: 'known',
    endsAtLedger: args.liveUntilLedgerSeq,
    remainingLedgers: args.liveUntilLedgerSeq - args.observedAtLedger,
  };
}

export function isLive(ttl: TTLObservation): boolean | undefined {
  if (ttl.status === 'unavailable') return undefined;
  return ttl.remainingLedgers >= 0;
}

/**
 * Wall-clock estimate for display only. Never store this — the truth is a
 * ledger number, and cadence is measured rather than guaranteed.
 */
export function estimateEndsAt(ttl: TTLObservation, now: Date): Date | undefined {
  if (ttl.status === 'unavailable') return undefined;
  return new Date(now.getTime() + ttl.remainingLedgers * SECONDS_PER_LEDGER * 1000);
}

/**
 * Sum rent-bearing work per UNIQUE entry. Contracts built from identical Wasm
 * share one `ContractCode` entry, so counting per contract overcharges a
 * factory deployment by N. See `docs/SOROBAN-PRIMER.md`.
 */
export function uniqueEntryCount(entries: Readonly<Record<string, LedgerEntryTTL>>): number {
  return Object.keys(entries).length;
}

/**
 * ── Ledger cadence ────────────────────────────────────────────────────────
 *
 * A cadence is MEASURED, never guaranteed. Ledgers close at roughly five
 * seconds, but "roughly" is doing real work: at the protocol maximum of
 * 3,110,400 ledgers, a 0.02% cadence error moves a projected end date by more
 * than ten hours. A projection that hides that is precise-looking and wrong.
 *
 * So cadence travels with its provenance and its uncertainty, and every
 * projection derived from it carries a band rather than a bare instant.
 */
export interface LedgerCadence {
  readonly secondsPerLedger: number;
  /** How this number was obtained. Measurements age; assumptions never were true. */
  readonly source: 'measured' | 'assumed';
  /**
   * Half-width of the plausible band, in seconds per ledger. Never zero — a
   * cadence nobody has bounded is not a cadence anybody knows exactly.
   */
  readonly uncertaintySecondsPerLedger: number;
  /** Provenance, carried so a projection can explain where its number came from. */
  readonly basis: string;
}

/**
 * Testnet cadence as actually observed, with the honest width of that claim.
 *
 * Two independent measurements exist: 5.000 s/ledger over a 100,000-ledger
 * Horizon sample (2026-09-05) and 5.0008 s/ledger over 16.3 hours. The spread
 * between them — 0.0008 s/ledger — is the uncertainty we can defend. It is a
 * SPREAD BETWEEN TWO MEASUREMENTS, not a confidence interval: two points bound
 * a range, they do not give a variance, exactly as three points did not give a
 * rent coefficient (`docs/SOROBAN-PRIMER.md`).
 */
export const MEASURED_TESTNET_CADENCE: LedgerCadence = {
  secondsPerLedger: SECONDS_PER_LEDGER,
  source: 'measured',
  uncertaintySecondsPerLedger: 0.0008,
  basis:
    '100,000-ledger Horizon sample 2026-09-05 (5.000 s) and an independent 16.3 h ' +
    're-measurement (5.0008 s); the band is the spread between two measurements, not a variance',
};

/** One observed ledger close, as Horizon and RPC report it. */
export interface LedgerCloseSample {
  readonly ledgerSeq: number;
  /** Close time in whole epoch SECONDS — the chain reports integers, not millis. */
  readonly closeTimeSeconds: number;
}

/**
 * Derive cadence from observed closes. Pure: callers fetch the samples, this
 * does the arithmetic, so the measurement is testable without a network.
 *
 * The point estimate comes from the endpoints, where per-ledger noise cancels.
 * The band is the wider of two honest floors:
 *
 *   - the observed spread of per-interval rates, which is what DRIFT looks like;
 *   - a quantization floor of 1/N s/ledger, because close times are whole
 *     seconds, so a window of N ledgers cannot resolve cadence finer than that.
 *
 * The floor is why two samples never report zero uncertainty. A single interval
 * cannot bound drift, and reporting 0 would be the confidently-wrong answer.
 */
export function measureCadence(samples: readonly LedgerCloseSample[]): LedgerCadence {
  const sorted = [...new Map(samples.map((s) => [s.ledgerSeq, s])).values()]
    .filter(
      (s) =>
        Number.isInteger(s.ledgerSeq) && s.ledgerSeq >= 0 && Number.isFinite(s.closeTimeSeconds),
    )
    .sort((a, b) => a.ledgerSeq - b.ledgerSeq);

  if (sorted.length < 2) {
    throw new Error('measureCadence needs at least two distinct ledger close samples');
  }

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const spanLedgers = last.ledgerSeq - first.ledgerSeq;
  const spanSeconds = last.closeTimeSeconds - first.closeTimeSeconds;
  if (spanLedgers <= 0 || spanSeconds <= 0) {
    throw new Error('measureCadence needs samples that advance in both ledger and time');
  }

  const secondsPerLedger = spanSeconds / spanLedgers;

  let widestDeviation = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]!;
    const current = sorted[i]!;
    const intervalLedgers = current.ledgerSeq - previous.ledgerSeq;
    const rate = (current.closeTimeSeconds - previous.closeTimeSeconds) / intervalLedgers;
    widestDeviation = Math.max(widestDeviation, Math.abs(rate - secondsPerLedger));
  }

  // Close times are whole seconds, so both endpoints carry +/-0.5 s of rounding.
  const quantizationFloor = 1 / spanLedgers;

  return {
    secondsPerLedger,
    source: 'measured',
    uncertaintySecondsPerLedger: Math.max(widestDeviation, quantizationFloor),
    basis:
      `${sorted.length} closes across ${spanLedgers.toLocaleString()} ledgers ` +
      `(${first.ledgerSeq.toLocaleString()}-${last.ledgerSeq.toLocaleString()})`,
  };
}

/**
 * ── Projection ────────────────────────────────────────────────────────────
 *
 * What happens to an entry, when, and whether it can be recovered afterwards.
 *
 * Deliberately NOT called `projectedArchiveDate`, which is wrong twice:
 * *archive* is false for temporary entries, which are DELETED, and *date*
 * invites storing a wall-clock value where the truth is a ledger number. When
 * and what-happens are kept apart because they genuinely are apart.
 */
export type EndProjection =
  | {
      /** No TTL metadata: unknown, never a fabricated "expiring now". */
      readonly status: 'unavailable';
      readonly endBehavior: LedgerEntryTTL['endBehavior'];
      readonly isRestorableAfterEnd: boolean;
    }
  | {
      readonly status: 'known';
      /** Final LIVE ledger, inclusive. The truth; store this, not a date. */
      readonly endsAtLedger: number;
      readonly remainingLedgers: number;
      readonly endBehavior: LedgerEntryTTL['endBehavior'];
      /** Zero remaining is still live. Expiry begins at -1. */
      readonly isLive: boolean;
      /**
       * Whether the entry can be brought back after it ends. Archived entries
       * can be restored; temporary entries are gone. Machine-readable so no
       * display path has to re-derive it and get it wrong — telling a user
       * that restorable data is "gone" is a documented UX bug in this project.
       */
      readonly isRestorableAfterEnd: boolean;
      /** Display edge only. NEVER store this: cadence drifts, ledgers do not. */
      readonly estimatedEndsAt: Date;
      /** Band implied by cadence uncertainty; earliest <= estimated <= latest. */
      readonly earliestEndsAt: Date;
      readonly latestEndsAt: Date;
      readonly cadence: LedgerCadence;
    };

/**
 * Project when an entry's final live ledger closes, and what happens then.
 *
 * `estimatedEndsAt` is when ledger `endsAtLedger` is expected to close. The
 * entry is live THROUGH that ledger; it is gone once the next one closes. That
 * is the inclusive boundary in wall-clock form, and it is the same off-by-one
 * that `remainingLedgers <= 0` gets wrong in ledger form.
 *
 * A negative `remainingLedgers` projects into the past, which is correct: the
 * entry already ended, and the estimate says roughly when.
 */
export function projectEnd(
  entry: {
    readonly ttl: TTLObservation;
    readonly endBehavior: LedgerEntryTTL['endBehavior'];
  },
  now: Date,
  cadence: LedgerCadence = MEASURED_TESTNET_CADENCE,
): EndProjection {
  const isRestorableAfterEnd = entry.endBehavior === 'archived';

  if (entry.ttl.status === 'unavailable') {
    return { status: 'unavailable', endBehavior: entry.endBehavior, isRestorableAfterEnd };
  }
  if (!(cadence.secondsPerLedger > 0)) {
    throw new Error('Cadence must be a positive number of seconds per ledger');
  }
  if (!(cadence.uncertaintySecondsPerLedger >= 0)) {
    throw new Error('Cadence uncertainty cannot be negative');
  }

  const { endsAtLedger, remainingLedgers } = entry.ttl;
  const at = (secondsPerLedger: number): number =>
    now.getTime() + remainingLedgers * secondsPerLedger * 1000;

  const estimate = at(cadence.secondsPerLedger);
  // A slower cadence pushes a FUTURE end later and an already-past end earlier,
  // so the bounds swap sign with remainingLedgers. Take the extremes, not the
  // arms, or an expired entry reports an inverted band.
  const slow = at(cadence.secondsPerLedger + cadence.uncertaintySecondsPerLedger);
  const fast = at(cadence.secondsPerLedger - cadence.uncertaintySecondsPerLedger);

  return {
    status: 'known',
    endsAtLedger,
    remainingLedgers,
    endBehavior: entry.endBehavior,
    isLive: remainingLedgers >= 0,
    isRestorableAfterEnd,
    estimatedEndsAt: new Date(estimate),
    earliestEndsAt: new Date(Math.min(slow, fast)),
    latestEndsAt: new Date(Math.max(slow, fast)),
    cadence,
  };
}
