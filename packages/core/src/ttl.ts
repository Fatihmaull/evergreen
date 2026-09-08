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

/** Ledgers close at ~5s on testnet (measured over 100,000 ledgers, 2026-09-05). */
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
