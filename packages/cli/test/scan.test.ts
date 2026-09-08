import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@evergreen/shared-types';
import {
  EXIT_BELOW_THRESHOLD,
  EXIT_ERROR,
  EXIT_OK,
  exitCodeFor,
  formatHuman,
} from '../src/scan.js';

const KEY = 'AAAABgAAAAEbase64key';

function result(over: Partial<ScanResult> = {}): ScanResult {
  return { network: 'testnet', contracts: [{ id: 'C1' }], entries: {}, issues: [], ...over };
}

const healthy = result({
  entries: {
    [KEY]: {
      kind: 'instance',
      endBehavior: 'archived',
      contracts: ['C1'],
      observedAtLedger: 1_000_000,
      ttl: { status: 'known', endsAtLedger: 1_100_000, remainingLedgers: 100_000 },
    },
  },
});

// The exit code is the GitHub Action's entire interface to this system
// (docs/ARCHITECTURE.md). These assert it in both directions: it must return
// zero when healthy AND non-zero when not. A code only ever observed passing
// has not been tested.
describe('exitCodeFor — the Action contract', () => {
  it('returns 0 for a healthy scan above threshold', () => {
    expect(exitCodeFor(healthy, 17_280)).toBe(EXIT_OK);
  });

  it('returns non-zero when an entry is below threshold', () => {
    const low = result({
      entries: {
        [KEY]: {
          ...healthy.entries[KEY]!,
          ttl: { status: 'known', endsAtLedger: 1_000_100, remainingLedgers: 100 },
        },
      },
    });
    expect(exitCodeFor(low, 17_280)).toBe(EXIT_BELOW_THRESHOLD);
  });

  it('returns 0 on the final live ledger — remaining 0 is not below threshold 0', () => {
    // The inclusive boundary reaching the exit code. A `<= 0` guard anywhere in
    // this path would fail a contract that is still alive.
    const lastLedger = result({
      entries: {
        [KEY]: {
          ...healthy.entries[KEY]!,
          ttl: { status: 'known', endsAtLedger: 1_000_000, remainingLedgers: 0 },
        },
      },
    });
    expect(exitCodeFor(lastLedger, 0)).toBe(EXIT_OK);
  });

  it('returns 2 for a transport failure, distinct from below-threshold', () => {
    const failed = result({ issues: [{ kind: 'rpc-error', contracts: ['C1'], message: 'boom' }] });
    expect(exitCodeFor(failed, 17_280)).toBe(EXIT_ERROR);
  });

  it('does not report healthy when the scan was partial', () => {
    const partial = result({
      ...healthy,
      issues: [{ kind: 'entry-not-found', contracts: ['C2'], message: 'absent' }],
    });
    expect(exitCodeFor(partial, 17_280)).not.toBe(EXIT_OK);
  });

  it('ignores entries with no TTL rather than treating them as expiring', () => {
    const noTtl = result({
      entries: {
        [KEY]: { ...healthy.entries[KEY]!, ttl: { status: 'unavailable' } },
      },
    });
    expect(exitCodeFor(noTtl, 17_280)).toBe(EXIT_OK);
  });
});

describe('formatHuman', () => {
  it('says "no TTL metadata" rather than printing zero ledgers', () => {
    const noTtl = result({
      entries: {
        [KEY]: { ...healthy.entries[KEY]!, ttl: { status: 'unavailable' } },
      },
    });
    const out = formatHuman(noTtl, new Date('2026-09-08T00:00:00Z'));
    expect(out).toContain('no TTL metadata');
    expect(out).not.toMatch(/remaining:\s+0 ledgers/);
  });

  it('marks a partial scan so it cannot read as a clean bill of health', () => {
    const partial = result({
      ...healthy,
      issues: [{ kind: 'entry-not-found', contracts: ['C2'], message: 'absent' }],
    });
    expect(formatHuman(partial, new Date())).toContain('PARTIAL');
  });
});
