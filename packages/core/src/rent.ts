import type { LedgerKey, RentEstimate, ScanResult, Stroops } from '@evergreen-stellar/shared-types';
import { hasExpired } from './ttl.js';

/**
 * Rent estimation (`W2-D9-01`).
 *
 * **The price comes from the network, never from a local formula.** The
 * recorded fee fixture is explicit that three measurements do not determine how
 * rent scales with size — *"do NOT fit a coefficient to this"* — and the same
 * fixture records why: an earlier reading got the right NUMBER from the wrong
 * MECHANISM (2.8x, attributed to size, when byte-identical persistent and
 * temporary entries differ by 1.95x on durability alone). A wrong mechanism
 * that predicts the right number is worse than no mechanism, because it
 * survives casual checking.
 *
 * So this module does no pricing arithmetic of its own. It asks a `RentQuoter`
 * what the chain would charge and does the one thing that IS ours to get right:
 * summing per unique ledger key.
 */

/** What extending one ledger key would cost. Priced by the network. */
export interface RentQuote {
  readonly entryKey: LedgerKey;
  readonly estimatedRentStroops: Stroops;
}

/**
 * The seam. Production asks the chain (`simulateTransaction`); tests use a
 * mock, so the model is verifiable without a network.
 */
export interface RentQuoter {
  quote(args: {
    readonly entryKeys: readonly LedgerKey[];
    readonly extendToLedgers: number;
  }): Promise<readonly RentQuote[]>;
}

export interface RentEstimateResult {
  readonly estimate: RentEstimate;
  /** Keys deliberately left out, with the reason. Never silently dropped. */
  readonly excluded: readonly {
    readonly entryKey: LedgerKey;
    readonly reason: 'already-expired' | 'no-quote-returned';
    readonly detail: string;
  }[];
}

function assertStroops(value: string, entryKey: LedgerKey): Stroops {
  // Stroops is decimal text for lossless JSON. Validate rather than trust: a
  // malformed quote must not become a plausible-looking total.
  if (!/^\d+$/.test(value)) {
    throw new Error(`Quote for ${entryKey} is not a non-negative integer of stroops: ${value}`);
  }
  return value as Stroops;
}

/**
 * Sum rent per UNIQUE ledger key.
 *
 * This is the whole correctness requirement. Contracts built from identical
 * Wasm share one `ContractCode` entry, so a per-contract sum charges it N times
 * — and it overcharges exactly the factory deployments most sensitive to cost,
 * silently, while looking arithmetically fine. `ScanResult.entries` is already
 * keyed by ledger key, so iterating IT rather than `contracts` is what makes
 * the double-count structurally impossible rather than merely avoided.
 *
 * Totals are summed as BigInt. Stroop values are decimal text precisely so
 * large sums stay lossless, and adding them as JS numbers would give that up
 * at the moment the number gets big enough to matter.
 */
export async function estimateRent(
  scan: ScanResult,
  args: {
    /**
     * One absolute target for every entry, or a per-entry map.
     *
     * **Per-entry is the correct shape for a delta request**, and getting this
     * wrong is not theoretical: a single `max` target across entries quoted the
     * shared code entry (690k remaining) up to 1.94M — a 1.25M-ledger
     * extension when 518k was asked for, and a bill of 2 XLM instead of 0.6.
     * Caught 2026-09-10 because the total was implausible, not because a test
     * failed. `extendTo` is absolute, so entries with different remaining TTL
     * need different targets to receive the same increment.
     */
    readonly extendToLedgers: number | Readonly<Record<LedgerKey, number>>;
  },
  quoter: RentQuoter,
): Promise<RentEstimateResult> {
  const uniform = typeof args.extendToLedgers === 'number' ? args.extendToLedgers : undefined;
  const perEntry = typeof args.extendToLedgers === 'number' ? undefined : args.extendToLedgers;
  const targetFor = (entryKey: LedgerKey): number | undefined => uniform ?? perEntry?.[entryKey];
  if (uniform !== undefined && (!Number.isInteger(uniform) || uniform <= 0)) {
    throw new Error('extendToLedgers must be a positive integer of ledgers');
  }

  const excluded: {
    entryKey: LedgerKey;
    reason: 'already-expired' | 'no-quote-returned';
    detail: string;
  }[] = [];
  const quotable: LedgerKey[] = [];
  let estimatedAtLedger = 0;

  for (const [entryKey, entry] of Object.entries(scan.entries)) {
    estimatedAtLedger = Math.max(estimatedAtLedger, entry.observedAtLedger);
    if (entry.ttl.status === 'known' && hasExpired(entry.ttl.remainingLedgers)) {
      // `extendTTL` cannot reach an entry past its final live ledger. Quoting
      // one would produce a number for an operation that cannot be performed.
      excluded.push({
        entryKey,
        reason: 'already-expired',
        detail: 'Already past its final live ledger — needs RestoreFootprintOp, not an extend.',
      });
      continue;
    }
    quotable.push(entryKey);
  }

  // Group by target so entries sharing one are quoted together, and entries
  // with different targets are never blended into a single request.
  const byTarget = new Map<number, LedgerKey[]>();
  for (const entryKey of quotable) {
    const target = targetFor(entryKey);
    if (target === undefined || !Number.isInteger(target) || target <= 0) {
      throw new Error(`No positive extend target supplied for ${entryKey}`);
    }
    const group = byTarget.get(target);
    if (group) group.push(entryKey);
    else byTarget.set(target, [entryKey]);
  }
  const quotes: RentQuote[] = [];
  for (const [target, entryKeys] of byTarget) {
    quotes.push(...(await quoter.quote({ entryKeys, extendToLedgers: target })));
  }

  const byKey = new Map<LedgerKey, Stroops>();
  for (const quote of quotes) {
    if (!quotable.includes(quote.entryKey)) {
      throw new Error(`Quoter returned an unrequested entry: ${quote.entryKey}`);
    }
    if (byKey.has(quote.entryKey)) {
      throw new Error(`Quoter returned two prices for ${quote.entryKey}`);
    }
    byKey.set(quote.entryKey, assertStroops(quote.estimatedRentStroops, quote.entryKey));
  }

  const estimatedRentStroopsByEntry: Record<LedgerKey, Stroops> = {};
  let total = 0n;
  for (const entryKey of quotable) {
    const price = byKey.get(entryKey);
    if (price === undefined) {
      // A missing quote is not a zero. Report the gap; do not understate a bill.
      excluded.push({
        entryKey,
        reason: 'no-quote-returned',
        detail: 'The network returned no price for this entry; the total excludes it.',
      });
      continue;
    }
    estimatedRentStroopsByEntry[entryKey] = price;
    total += BigInt(price);
  }

  return {
    estimate: {
      estimatedAtLedger,
      // The shared type carries one number; report the largest target when
      // they differ, and the per-entry prices below are authoritative.
      extendToLedgers: uniform ?? Math.max(...byTarget.keys(), 0),
      estimatedRentStroopsByEntry,
      totalEstimatedRentStroops: total.toString() as Stroops,
    },
    excluded,
  };
}

/** Stroops are 1e-7 XLM. Display only — never store or sum the float. */
export function stroopsToXlm(stroops: Stroops): string {
  const value = BigInt(stroops);
  const whole = value / 10_000_000n;
  const fraction = (value % 10_000_000n).toString().padStart(7, '0');
  return `${whole.toString()}.${fraction}`;
}
