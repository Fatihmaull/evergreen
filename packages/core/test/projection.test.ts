import { describe, expect, it } from 'vitest';
import {
  MEASURED_TESTNET_CADENCE,
  measureCadence,
  observeTTL,
  projectEnd,
  type LedgerCadence,
  type LedgerCloseSample,
} from '../src/ttl.js';

const NOW = new Date('2026-09-10T00:00:00.000Z');

/** A cadence with no uncertainty, so a test can isolate the point estimate. */
const EXACT: LedgerCadence = {
  secondsPerLedger: 5,
  source: 'assumed',
  uncertaintySecondsPerLedger: 0,
  basis: 'test fixture — exact by construction, never true of a real chain',
};

function archived(liveUntilLedgerSeq: number | undefined, observedAtLedger: number) {
  return {
    ttl: observeTTL({ liveUntilLedgerSeq, observedAtLedger }),
    endBehavior: 'archived' as const,
  };
}

function deleted(liveUntilLedgerSeq: number | undefined, observedAtLedger: number) {
  return {
    ttl: observeTTL({ liveUntilLedgerSeq, observedAtLedger }),
    endBehavior: 'deleted' as const,
  };
}

describe('projectEnd — the inclusive boundary, in wall-clock form', () => {
  it('projects a zero-remaining entry to now and still reports it LIVE', () => {
    // The ledger-form trap is `remainingLedgers <= 0`. This is its wall-clock
    // twin: an entry whose estimate lands on "now" has not expired.
    const p = projectEnd(archived(4_529_810, 4_529_810), NOW, EXACT);
    expect(p.status).toBe('known');
    if (p.status !== 'known') return;
    expect(p.remainingLedgers).toBe(0);
    expect(p.isLive).toBe(true);
    expect(p.estimatedEndsAt.toISOString()).toBe(NOW.toISOString());
  });

  it('projects the first dead ledger into the past and reports it NOT live', () => {
    const p = projectEnd(archived(4_529_810, 4_529_811), NOW, EXACT);
    if (p.status !== 'known') throw new Error('expected known');
    expect(p.remainingLedgers).toBe(-1);
    expect(p.isLive).toBe(false);
    expect(p.estimatedEndsAt.getTime()).toBe(NOW.getTime() - 5_000);
  });

  it('converts a full day of ledgers to exactly a day', () => {
    const p = projectEnd(archived(1_017_280, 1_000_000), NOW, EXACT);
    if (p.status !== 'known') throw new Error('expected known');
    // 17,280 ledgers x 5s = 24h.
    expect(p.estimatedEndsAt.toISOString()).toBe('2026-09-11T00:00:00.000Z');
  });
});

describe('projectEnd — archived and deleted are different fates', () => {
  it('marks an archived entry restorable', () => {
    const p = projectEnd(archived(200, 100), NOW, EXACT);
    expect(p.endBehavior).toBe('archived');
    expect(p.isRestorableAfterEnd).toBe(true);
  });

  it('marks a temporary entry UNRECOVERABLE — never "archived"', () => {
    // Telling a user their persistent data is "gone" when it is restorable is a
    // documented UX bug here; the inverse — calling a deletion an archival —
    // is the one that loses data. One field cannot describe both fates.
    const p = projectEnd(deleted(200, 100), NOW, EXACT);
    expect(p.endBehavior).toBe('deleted');
    expect(p.isRestorableAfterEnd).toBe(false);
  });
});

describe('projectEnd — an entry with no TTL is unknown, not expiring', () => {
  it('returns unavailable rather than fabricating a date', () => {
    const p = projectEnd(archived(undefined, 100), NOW, EXACT);
    expect(p.status).toBe('unavailable');
    expect(p).not.toHaveProperty('estimatedEndsAt');
    expect(p).not.toHaveProperty('remainingLedgers');
  });

  it('still reports the end BEHAVIOR, which does not depend on TTL', () => {
    // Durability is a property of the entry, known even when its TTL is not.
    expect(projectEnd(deleted(undefined, 100), NOW, EXACT).isRestorableAfterEnd).toBe(false);
    expect(projectEnd(archived(undefined, 100), NOW, EXACT).isRestorableAfterEnd).toBe(true);
  });
});

describe('projectEnd — ledger close-time drift', () => {
  it('widens the band with the horizon, and materially so at the protocol max', () => {
    // 3,110,400 ledgers is max_entry_ttl — exactly 180 days. At +/-0.0008 s
    // per ledger that band is over an hour wide, which is the whole reason a
    // projection reports a band instead of a bare instant.
    const p = projectEnd(archived(3_110_400, 0), NOW, MEASURED_TESTNET_CADENCE);
    if (p.status !== 'known') throw new Error('expected known');
    const spreadMinutes = (p.latestEndsAt.getTime() - p.earliestEndsAt.getTime()) / 60_000;
    expect(spreadMinutes).toBeGreaterThan(60);
    expect(p.earliestEndsAt.getTime()).toBeLessThan(p.estimatedEndsAt.getTime());
    expect(p.latestEndsAt.getTime()).toBeGreaterThan(p.estimatedEndsAt.getTime());
  });

  it('keeps the band ordered for an ALREADY EXPIRED entry', () => {
    // Bounds swap sign with remainingLedgers. Naively assigning slow->latest
    // inverts the band in the past, so earliest would exceed latest.
    const p = projectEnd(archived(0, 100_000), NOW, MEASURED_TESTNET_CADENCE);
    if (p.status !== 'known') throw new Error('expected known');
    expect(p.remainingLedgers).toBeLessThan(0);
    expect(p.earliestEndsAt.getTime()).toBeLessThanOrEqual(p.estimatedEndsAt.getTime());
    expect(p.estimatedEndsAt.getTime()).toBeLessThanOrEqual(p.latestEndsAt.getTime());
  });

  it('collapses the band only when the caller asserts zero uncertainty', () => {
    const p = projectEnd(archived(100_000, 0), NOW, EXACT);
    if (p.status !== 'known') throw new Error('expected known');
    expect(p.earliestEndsAt.getTime()).toBe(p.latestEndsAt.getTime());
  });

  it('carries its cadence so a projection can say where its number came from', () => {
    const p = projectEnd(archived(200, 100), NOW, MEASURED_TESTNET_CADENCE);
    if (p.status !== 'known') throw new Error('expected known');
    expect(p.cadence.source).toBe('measured');
    expect(p.cadence.basis).toContain('100,000-ledger');
  });

  it('refuses a nonsensical cadence rather than projecting from it', () => {
    expect(() => projectEnd(archived(200, 100), NOW, { ...EXACT, secondsPerLedger: 0 })).toThrow();
    expect(() =>
      projectEnd(archived(200, 100), NOW, { ...EXACT, uncertaintySecondsPerLedger: -1 }),
    ).toThrow();
  });
});

describe('measureCadence', () => {
  const evenly = (count: number, rate: number, start = 1_000_000): LedgerCloseSample[] =>
    Array.from({ length: count }, (_, i) => ({
      ledgerSeq: start + i * 100,
      closeTimeSeconds: 1_757_462_400 + Math.round(i * 100 * rate),
    }));

  it('recovers a steady rate from its endpoints', () => {
    const c = measureCadence(evenly(50, 5));
    expect(c.secondsPerLedger).toBeCloseTo(5, 6);
    expect(c.source).toBe('measured');
  });

  it('never claims zero uncertainty, even from a perfectly regular sample', () => {
    // The failure this guards is a projection that looks exact because the
    // sample happened to be clean. Close times are whole seconds; a finite
    // window cannot resolve cadence more finely than 1/N.
    const c = measureCadence(evenly(50, 5));
    expect(c.uncertaintySecondsPerLedger).toBeGreaterThan(0);
  });

  it('reports a WIDER band for drifting closes than for steady ones', () => {
    const steady = measureCadence(evenly(20, 5));
    const drifting = measureCadence([
      { ledgerSeq: 1_000_000, closeTimeSeconds: 1_757_462_400 },
      { ledgerSeq: 1_000_100, closeTimeSeconds: 1_757_462_900 }, // 5.0 s
      { ledgerSeq: 1_000_200, closeTimeSeconds: 1_757_463_600 }, // 7.0 s — stall
      { ledgerSeq: 1_000_300, closeTimeSeconds: 1_757_464_000 }, // 4.0 s — catch-up
    ]);
    expect(drifting.uncertaintySecondsPerLedger).toBeGreaterThan(
      steady.uncertaintySecondsPerLedger,
    );
  });

  it('is order-independent and ignores duplicate ledger sequences', () => {
    const forward = measureCadence(evenly(10, 5));
    const shuffled = measureCadence([...evenly(10, 5)].reverse());
    expect(shuffled.secondsPerLedger).toBeCloseTo(forward.secondsPerLedger, 9);
    const withDupes = measureCadence([...evenly(10, 5), ...evenly(10, 5)]);
    expect(withDupes.secondsPerLedger).toBeCloseTo(forward.secondsPerLedger, 9);
  });

  it('refuses samples that cannot support a rate', () => {
    expect(() => measureCadence([])).toThrow(/at least two/);
    expect(() => measureCadence([{ ledgerSeq: 1, closeTimeSeconds: 100 }])).toThrow(/at least two/);
    expect(() =>
      measureCadence([
        { ledgerSeq: 5, closeTimeSeconds: 500 },
        { ledgerSeq: 9, closeTimeSeconds: 400 }, // time runs backwards
      ]),
    ).toThrow(/advance/);
  });

  it('agrees with the recorded testnet cadence to within its own band', () => {
    // Docs are not the network: this pins the constant against a measurement
    // rather than restating it. If they ever disagree, that is a finding.
    const c = measureCadence(evenly(200, 5));
    expect(Math.abs(c.secondsPerLedger - MEASURED_TESTNET_CADENCE.secondsPerLedger)).toBeLessThan(
      MEASURED_TESTNET_CADENCE.uncertaintySecondsPerLedger + c.uncertaintySecondsPerLedger,
    );
  });
});
