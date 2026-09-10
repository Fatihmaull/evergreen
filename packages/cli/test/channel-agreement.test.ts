import { describe, expect, it } from 'vitest';
import type { LedgerEntryTTL, ScanResult } from '@evergreen-stellar/shared-types';
import { coverageIssues } from '@evergreen-stellar/core';
import { formatHuman, healthReport } from '../src/scan.js';

/**
 * The human channel and the machine channel must never disagree about what is
 * KNOWN.
 *
 * They did. For the same scan the human output printed two caveats — coverage
 * limited, sharing unknown — while the JSON reported `issues: []`,
 * `isShared: false` and `blastRadius: 1`. The code that ACTS got the confident
 * version; the person who does not act got the honest one.
 *
 * These are properties, not snapshots. Snapshot tests of both channels would
 * have passed happily while the two disagreed, because each snapshot only ever
 * compares a channel against its own past self.
 */

const NOW = new Date('2026-09-10T00:00:00Z');
const THRESHOLD = 17_280;

function entry(over: Partial<LedgerEntryTTL> & { remaining?: number } = {}): LedgerEntryTTL {
  const { remaining = 500_000, ...rest } = over;
  return {
    kind: 'instance',
    endBehavior: 'archived',
    contracts: ['C1'],
    observedAtLedger: 1_000_000,
    ttl: { status: 'known', endsAtLedger: 1_000_000 + remaining, remainingLedgers: remaining },
    ...rest,
  } as LedgerEntryTTL;
}

/** Mirrors what the CLI emits: scan issues plus the caveats, one merged list. */
function envelope(scan: ScanResult): ScanResult {
  return { ...scan, issues: [...scan.issues, ...coverageIssues(scan)] };
}

function scan(
  entries: Record<string, LedgerEntryTTL>,
  coverage?: ScanResult['coverage'],
): ScanResult {
  return {
    network: 'testnet',
    contracts: [{ id: 'C1' }],
    entries,
    issues: [],
    ...(coverage === undefined ? {} : { coverage }),
  };
}

/** Any line the human renderer flags with a caveat marker. */
function humanWarnings(text: string): string[] {
  return text.split('\n').filter((l) => l.includes('⚠') || l.includes('unread'));
}

const CASES: [string, ScanResult][] = [
  [
    'lone code entry — sharing cannot be determined',
    scan(
      { code: entry({ kind: 'code' }) },
      { mode: 'known-keys', dataKeysSuppliedByContract: { C1: 1 } },
    ),
  ],
  [
    'no data keys supplied — coverage is bounded',
    scan({ inst: entry() }, { mode: 'known-keys', dataKeysSuppliedByContract: { C1: 0 } }),
  ],
  [
    'both at once',
    scan(
      { inst: entry(), code: entry({ kind: 'code' }) },
      { mode: 'known-keys', dataKeysSuppliedByContract: { C1: 0 } },
    ),
  ],
];

describe('🔴 whenever the human channel warns, the machine channel must too', () => {
  it.each(CASES)('%s', (_label, raw) => {
    const merged = envelope(raw);
    const human = formatHuman(merged, NOW, { thresholdLedgers: THRESHOLD });
    expect(humanWarnings(human).length).toBeGreaterThan(0);
    // The property: a caveat visible to a person is visible to a program.
    expect(merged.issues.length).toBeGreaterThan(0);
  });

  it('and stays quiet in BOTH channels when there is nothing to caveat', () => {
    // Without this the property is satisfiable by warning about everything,
    // always — which would be the testnet guard that refused every deploy.
    const clean = envelope(
      scan(
        { inst: entry() },
        {
          mode: 'known-keys',
          dataKeysSuppliedByContract: { C1: 0 },
          noDataKeysDeclaredByContract: { C1: true },
        },
      ),
    );
    expect(clean.issues).toEqual([]);
    expect(humanWarnings(formatHuman(clean, NOW, { thresholdLedgers: THRESHOLD }))).toEqual([]);
  });
});

describe('🔴 the machine channel never reports a negative it cannot verify', () => {
  it('reports UNDETERMINED, not exclusive, for a code entry seen from one contract', () => {
    // The chain does not index reverse dependencies from one contract query, so
    // "not shared" is unverifiable by construction here — `false` would be an
    // unknown rendered as a negative.
    const report = healthReport(scan({ code: entry({ kind: 'code' }) }), THRESHOLD);
    expect(report.byEntry.code?.sharingStatus).toBe('undetermined');
  });

  it('DOES report exclusive for an instance entry, which is knowable', () => {
    // Instance/persistent/temporary keys derive from the contract itself, so one
    // contract is the whole census. A guard that answers "unknown" to everything
    // is as useless as one that answers "no".
    const report = healthReport(scan({ inst: entry() }), THRESHOLD);
    expect(report.byEntry.inst?.sharingStatus).toBe('exclusive');
  });

  it('flags that sharedEntryCount is a floor while anything is undetermined', () => {
    const report = healthReport(scan({ code: entry({ kind: 'code' }) }), THRESHOLD);
    expect(report.sharedEntryCount).toBe(0);
    // A consumer must not read that zero as "nothing is shared".
    expect(report.undeterminedSharingCount).toBe(1);
  });

  it('names blast radius as a lower bound, not a measurement', () => {
    const report = healthReport(scan({ code: entry({ kind: 'code' }) }), THRESHOLD);
    expect(report.byEntry.code).toHaveProperty('blastRadiusAtLeast');
    expect(report.byEntry.code).not.toHaveProperty('blastRadius');
    expect(report.byEntry.code).not.toHaveProperty('isShared');
  });

  it('still reports a genuinely shared entry as shared', () => {
    const report = healthReport(
      scan({ code: entry({ kind: 'code', contracts: ['A', 'B', 'C'] }) }),
      THRESHOLD,
    );
    expect(report.byEntry.code?.sharingStatus).toBe('shared');
    expect(report.byEntry.code?.blastRadiusAtLeast).toBe(3);
    expect(report.sharedEntryCount).toBe(1);
    expect(report.undeterminedSharingCount).toBe(0);
  });
});
