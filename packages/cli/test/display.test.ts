import { describe, expect, it } from 'vitest';
import type { LedgerEntryTTL, ScanResult } from '@evergreen-stellar/shared-types';
import { EXIT_BELOW_THRESHOLD, exitCodeFor, formatHuman, healthReport } from '../src/scan.js';

const NOW = new Date('2026-09-10T00:00:00Z');
const THRESHOLD = 17_280;
/** ANSI SGR sequences, written as escapes so this file stays free of control bytes. */
const SGR = new RegExp(String.fromCharCode(27) + '\\[\\d+m', 'g');

function entry(over: Partial<LedgerEntryTTL> & { remaining?: number }): LedgerEntryTTL {
  const { remaining = 100_000, ...rest } = over;
  return {
    kind: 'persistent',
    endBehavior: 'archived',
    contracts: ['CONTRACT_A'],
    observedAtLedger: 1_000_000,
    ttl: { status: 'known', endsAtLedger: 1_000_000 + remaining, remainingLedgers: remaining },
    ...rest,
  } as LedgerEntryTTL;
}

function scan(entries: Record<string, LedgerEntryTTL>): ScanResult {
  return {
    network: 'testnet',
    contracts: [{ id: 'CONTRACT_A' }],
    entries,
    issues: [],
    coverage: { mode: 'known-keys', dataKeysSuppliedByContract: { CONTRACT_A: 0 } },
  };
}

const fmt = (r: ScanResult, color = false): string =>
  formatHuman(r, NOW, { color, thresholdLedgers: THRESHOLD });

describe('display — states are words first, colour second', () => {
  it('prints the state word with colour disabled', () => {
    expect(fmt(scan({ K: entry({ remaining: 100_000 }) }))).toContain('HEALTHY');
  });

  it('prints the SAME word when colour is on — colour is never the only carrier', () => {
    // A reader who is colour-blind, piping to a file, or looking at a
    // screenshot must get the same information as one at a colour terminal.
    const plain = fmt(scan({ K: entry({ remaining: 100 }) }), false);
    const painted = fmt(scan({ K: entry({ remaining: 100 }) }), true);
    expect(plain).toContain('WARNING');
    expect(painted).toContain('WARNING');
    expect(painted.replace(SGR, '')).toBe(plain);
  });

  it('emits no escape codes at all by default', () => {
    expect(SGR.test(fmt(scan({ K: entry({ remaining: 100 }) })))).toBe(false);
  });
});

describe('display — sharing is stated, never left to inference', () => {
  it('names how many other contracts a shared entry takes down', () => {
    const out = fmt(
      scan({ K: entry({ remaining: 100, kind: 'code', contracts: ['A', 'B', 'C'] }) }),
    );
    expect(out).toContain('shared with 2 other contracts');
    expect(out).toContain('they fail together');
    expect(out).toContain('CRITICAL');
  });

  it('uses the singular for exactly one other contract', () => {
    const out = fmt(scan({ K: entry({ remaining: 100, kind: 'code', contracts: ['A', 'B'] }) }));
    expect(out).toContain('shared with 1 other contract —');
  });

  it('says a lone CODE entry may still be shared invisibly', () => {
    // The failure this prevents: a single-contract scan cannot know who else
    // built from the same Wasm, and silence would read as proof of exclusivity.
    // Confirmed against the real chain — guinea-pigs A, B and C share one code
    // entry, and a scan of A alone sees exactly one contract on it.
    const out = fmt(scan({ K: entry({ remaining: 500_000, kind: 'code', contracts: ['A'] }) }));
    expect(out).toContain('shared by every contract built from the same Wasm');
    expect(out).toContain('cannot be');
  });

  it('does not add that caveat to instance entries, which are per-contract', () => {
    const out = fmt(scan({ K: entry({ remaining: 500_000, kind: 'instance', contracts: ['A'] }) }));
    expect(out).not.toContain('shared by every contract built from the same Wasm');
  });
});

describe('display — the summary never overstates', () => {
  it('reports the worst entry, not an average', () => {
    const out = fmt(
      scan({
        A: entry({ remaining: 900_000 }),
        B: entry({ remaining: 800_000 }),
        C: entry({ remaining: 100, kind: 'code', contracts: ['X', 'Y'] }),
      }),
    );
    expect(out).toContain('Worst entry health: CRITICAL');
    expect(out).toContain('1 shared entry');
  });

  it('reports UNKNOWN rather than healthy when a TTL could not be read', () => {
    const out = fmt(
      scan({
        A: entry({ remaining: 900_000 }),
        B: { ...entry({}), ttl: { status: 'unavailable' } } as LedgerEntryTTL,
      }),
    );
    expect(out).toContain('Worst entry health: UNKNOWN');
  });

  it('states the threshold it graded against', () => {
    expect(fmt(scan({ K: entry({ remaining: 100_000 }) }))).toContain('threshold 17,280 ledgers');
  });
});

describe('--json health block — magnitude lives here, not in the exit code', () => {
  // ADR-006 § Considered and declined: blast radius must NOT reach the exit
  // code. Exit codes signal category, not magnitude, and a new code silently
  // breaks consumers matching the old set. These tests pin both halves — the
  // data is present in JSON, and the exit code stays inside the agreed set.
  const sharedScan = scan({
    lone: entry({ remaining: 100 }),
    sharedKey: entry({ remaining: 100, kind: 'code', contracts: ['A', 'B', 'C'] }),
  });

  it('reports blast radius as a BOUND and sharing as a three-valued status', () => {
    const report = healthReport(sharedScan, THRESHOLD);
    expect(report.byEntry.sharedKey?.blastRadiusAtLeast).toBe(3);
    expect(report.byEntry.sharedKey?.sharingStatus).toBe('shared');
    expect(report.byEntry.lone?.blastRadiusAtLeast).toBe(1);
    // A persistent entry is genuinely exclusive; only code entries are unknowable.
    expect(report.byEntry.lone?.sharingStatus).toBe('exclusive');
  });

  it('grades the shared entry critical and the lone one warning at identical TTL', () => {
    const report = healthReport(sharedScan, THRESHOLD);
    expect(report.byEntry.sharedKey?.health).toBe('critical');
    expect(report.byEntry.lone?.health).toBe('warning');
    expect(report.worst).toBe('critical');
    expect(report.sharedEntryCount).toBe(1);
  });

  it('states the threshold it graded against, so the report is self-describing', () => {
    expect(healthReport(sharedScan, THRESHOLD).thresholdLedgers).toBe(THRESHOLD);
  });

  it('omits `worst` rather than claiming health for an empty scan', () => {
    const report = healthReport(scan({}), THRESHOLD);
    expect(report.worst).toBeUndefined();
    expect(report.sharedEntryCount).toBe(0);
  });

  it('🔴 does NOT change the exit code for a shared entry — same category, same code', () => {
    // The declined design would have returned a distinct code here. Both of
    // these are "below threshold"; the difference is urgency, which the output
    // carries. A consumer matching `-eq 1` must keep seeing both.
    const loneScan = scan({ lone: entry({ remaining: 100 }) });
    expect(exitCodeFor(sharedScan, THRESHOLD)).toBe(exitCodeFor(loneScan, THRESHOLD));
    expect(exitCodeFor(sharedScan, THRESHOLD)).toBe(EXIT_BELOW_THRESHOLD);
  });

  it('keeps every ScanResult key untouched — the block is additive', () => {
    // An existing consumer reading `entries` or `issues` must be unaffected.
    const envelope = { ...sharedScan, health: healthReport(sharedScan, THRESHOLD) };
    for (const key of Object.keys(sharedScan)) {
      expect(envelope[key as keyof typeof envelope]).toEqual(
        sharedScan[key as keyof typeof sharedScan],
      );
    }
  });
});

describe('W2-D10-03 — an absent entry names both causes', () => {
  it('offers restore AND never-deployed, because a scan cannot tell them apart', () => {
    const out = formatHuman(
      {
        network: 'testnet',
        contracts: [{ id: 'CONTRACT_A' }],
        entries: {},
        issues: [
          {
            kind: 'entry-not-found',
            contracts: ['CONTRACT_A'],
            message: 'No entry returned. Absence is not proof of archival or deletion.',
          },
        ],
      },
      NOW,
      { thresholdLedgers: THRESHOLD },
    );
    expect(out).toContain('RestoreFootprintOp');
    expect(out).toContain('never existed');
    // It must not assert either cause — the scan does not know which.
    expect(out).toContain('cannot distinguish them');
  });

  it('does not attach that guidance to unrelated issue kinds', () => {
    const out = formatHuman(
      {
        network: 'testnet',
        contracts: [{ id: 'CONTRACT_A' }],
        entries: {},
        issues: [{ kind: 'rpc-error', contracts: ['CONTRACT_A'], message: 'timeout' }],
      },
      NOW,
      { thresholdLedgers: THRESHOLD },
    );
    expect(out).not.toContain('RestoreFootprintOp');
  });
});
