import { describe, expect, it } from 'vitest';
import { estimateEndsAt, isLive, observeTTL } from '../src/ttl.js';

describe('observeTTL — the inclusive boundary', () => {
  // Observed on testnet 2026-09-06 (W1-D4-13): present at 4,529,810 with
  // remaining 0, absent at 4,529,811. These two tests encode that observation.
  it('reports remainingLedgers 0 on the final live ledger — still alive', () => {
    const ttl = observeTTL({ liveUntilLedgerSeq: 4_529_810, observedAtLedger: 4_529_810 });
    expect(ttl).toEqual({ status: 'known', endsAtLedger: 4_529_810, remainingLedgers: 0 });
    expect(isLive(ttl)).toBe(true);
  });

  it('reports remainingLedgers -1 on the first dead ledger — expired', () => {
    const ttl = observeTTL({ liveUntilLedgerSeq: 4_529_810, observedAtLedger: 4_529_811 });
    expect(ttl).toMatchObject({ remainingLedgers: -1 });
    expect(isLive(ttl)).toBe(false);
  });

  it('subtracts plainly, with no off-by-one', () => {
    // Stellar's own worked example: current 5, live-until 15 -> TTL 10.
    expect(observeTTL({ liveUntilLedgerSeq: 15, observedAtLedger: 5 })).toMatchObject({
      remainingLedgers: 10,
    });
  });
});

describe('observeTTL — absent TTL is unknown, not zero', () => {
  it('returns unavailable when liveUntilLedgerSeq is missing', () => {
    const ttl = observeTTL({ liveUntilLedgerSeq: undefined, observedAtLedger: 100 });
    expect(ttl.status).toBe('unavailable');
  });

  it('does not fabricate a remaining count for an unavailable TTL', () => {
    const ttl = observeTTL({ liveUntilLedgerSeq: undefined, observedAtLedger: 100 });
    // The dangerous failure is "unknown" silently rendering as "expiring now".
    expect(ttl.remainingLedgers).toBeUndefined();
    expect(isLive(ttl)).toBeUndefined();
  });
});

describe('estimateEndsAt', () => {
  it('derives wall clock at the display edge only', () => {
    const ttl = observeTTL({ liveUntilLedgerSeq: 1_017_280, observedAtLedger: 1_000_000 });
    const at = estimateEndsAt(ttl, new Date('2026-09-08T00:00:00Z'));
    // 17,280 ledgers x 5s = exactly one day.
    expect(at?.toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });

  it('returns undefined rather than a date when TTL is unavailable', () => {
    const ttl = observeTTL({ liveUntilLedgerSeq: undefined, observedAtLedger: 1 });
    expect(estimateEndsAt(ttl, new Date())).toBeUndefined();
  });
});
