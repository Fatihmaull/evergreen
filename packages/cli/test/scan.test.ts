import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@evergreen-stellar/shared-types';
import { isLive } from '@evergreen-stellar/core';
import {
  EXIT_BELOW_THRESHOLD,
  EXIT_ERROR,
  EXIT_INCOMPLETE,
  EXIT_OK,
  exitCodeFor,
  formatHuman,
} from '../src/index.js';

const KEY = 'AAAABgAAAAEbase64key';

function result(over: Partial<ScanResult> = {}): ScanResult {
  return {
    network: 'testnet',
    contracts: [{ id: 'C1' }],
    entries: {},
    issues: [],
    coverage: {
      mode: 'known-keys',
      dataKeysSuppliedByContract: { C1: 0 },
      noDataKeysDeclaredByContract: { C1: true },
    },
    ...over,
  };
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

// Exit codes summarize health for CI. JSON retains mixed findings; neither authorizes a bump.
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

  it('flags the final live ledger at threshold 0 — still alive, but out of margin', () => {
    // UPDATED 2026-09-10 with the floor policy. This previously asserted EXIT_OK,
    // correctly, under the old `remaining < threshold` rule.
    //
    // The two boundaries are both visible here and they do not contradict:
    // remaining 0 is still LIVE (protocol — `isLive` is inclusive at zero), and
    // it also NEEDS ACTION (policy — `needsAction` is inclusive at the
    // threshold). A threshold of 0 means "act once remaining reaches 0", which
    // is the last ledger anything can still be done. Under the old rule this
    // configuration only acted at remaining < 0, i.e. after the entry was
    // already gone — a threshold that fires exclusively when it is too late.
    const lastLedger = result({
      entries: {
        [KEY]: {
          ...healthy.entries[KEY]!,
          ttl: { status: 'known', endsAtLedger: 1_000_000, remainingLedgers: 0 },
        },
      },
    });
    expect(exitCodeFor(lastLedger, 0)).toBe(EXIT_BELOW_THRESHOLD);
    // Still live, though: the exit code says "act", never "already dead".
    expect(isLive(lastLedger.entries[KEY]!.ttl)).toBe(true);
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

  it('reports unavailable TTL as incomplete, not as healthy or low TTL', () => {
    const noTtl = result({
      entries: {
        [KEY]: { ...healthy.entries[KEY]!, ttl: { status: 'unavailable' } },
      },
    });
    expect(exitCodeFor(noTtl, 17_280)).toBe(EXIT_INCOMPLETE);
  });

  it('does not report a new covered scan healthy when TTL is unavailable', () => {
    const noTtl = result({
      entries: { [KEY]: { ...healthy.entries[KEY]!, ttl: { status: 'unavailable' } } },
      coverage: { mode: 'known-keys', dataKeysSuppliedByContract: { C1: 1 } },
    });
    expect(exitCodeFor(noTtl, 17_280)).toBe(EXIT_INCOMPLETE);
  });

  // ADR-006 amendment (2026-09-10). Undeclared scope is no longer incomplete by
  // default — only a caller who opted into being held to it gets 3. The cases
  // below are Rakha's original coverage, moved behind the flag rather than
  // dropped: every one of them still fails closed for the CI caller.
  it('treats a legacy producer without coverage as answerable by default', () => {
    const legacy: ScanResult = {
      network: healthy.network,
      contracts: healthy.contracts,
      entries: healthy.entries,
      issues: [],
    };
    expect(exitCodeFor(legacy, 17_280)).toBe(EXIT_OK);
    expect(exitCodeFor(legacy, 17_280, { requireDeclaredScope: true })).toBe(EXIT_INCOMPLETE);
  });

  it.each([undefined, -1, 1.5, NaN, 0])(
    'reports unknown or invalid data-key count %s as incomplete only when scope is required',
    (count) => {
      const coverage = {
        mode: 'known-keys' as const,
        dataKeysSuppliedByContract: count === undefined ? {} : { C1: count },
      };
      expect(exitCodeFor({ ...healthy, coverage }, 17_280)).toBe(EXIT_OK);
      expect(exitCodeFor({ ...healthy, coverage }, 17_280, { requireDeclaredScope: true })).toBe(
        EXIT_INCOMPLETE,
      );
    },
  );

  // The reason the default changed, stated as a test so it cannot quietly revert.
  it('lets a stranger scanning an unknown contract reach 0 without asserting anything', () => {
    const thirdParty = result({
      entries: healthy.entries,
      coverage: { mode: 'known-keys', dataKeysSuppliedByContract: { C1: 0 } },
    });
    // No --no-data-keys: they did not write this contract and cannot know.
    expect(exitCodeFor(thirdParty, 17_280)).toBe(EXIT_OK);
  });

  it('still reports a degraded read as incomplete, with or without the flag', () => {
    const missing = result({
      entries: healthy.entries,
      coverage: { mode: 'known-keys', dataKeysSuppliedByContract: { C1: 1 } },
      issues: [{ kind: 'entry-not-found', contracts: ['C1'], message: 'no entry returned' }],
    });
    expect(exitCodeFor(missing, 17_280)).toBe(EXIT_INCOMPLETE);
    expect(exitCodeFor(missing, 17_280, { requireDeclaredScope: true })).toBe(EXIT_INCOMPLETE);
  });

  it('does not accept an empty assertion contradicting a positive count', () => {
    expect(
      exitCodeFor(
        {
          ...healthy,
          coverage: {
            mode: 'known-keys',
            dataKeysSuppliedByContract: { C1: 1 },
            noDataKeysDeclaredByContract: { C1: true },
          },
        },
        17_280,
        { requireDeclaredScope: true },
      ),
    ).toBe(EXIT_INCOMPLETE);
  });

  it.each(['entry-not-found', 'unsupported-executable'] as const)(
    'reports %s as incomplete',
    (kind) => {
      expect(
        exitCodeFor(
          { ...healthy, issues: [{ kind, contracts: ['C1'], message: 'unobserved' }] },
          17_280,
        ),
      ).toBe(EXIT_INCOMPLETE);
    },
  );

  it('prioritizes incomplete over low TTL, and errors over both without erasing findings', () => {
    const mixed = result({
      entries: {
        [KEY]: {
          ...healthy.entries[KEY]!,
          ttl: { status: 'known', endsAtLedger: 1_000_001, remainingLedgers: 1 },
        },
      },
      issues: [{ kind: 'entry-not-found', contracts: ['C1'], message: 'absent' }],
    });
    const saved = JSON.stringify(mixed);
    expect(exitCodeFor(mixed, 17_280)).toBe(EXIT_INCOMPLETE);
    expect(JSON.stringify(mixed)).toBe(saved);
    expect(
      exitCodeFor(
        {
          ...mixed,
          issues: [...mixed.issues, { kind: 'rpc-error', contracts: ['C1'], message: 'failed' }],
        },
        17_280,
      ),
    ).toBe(EXIT_ERROR);
  });

  it('empty observations stay incomplete even with an explicit empty declaration', () => {
    expect(exitCodeFor(result(), 17_280)).toBe(EXIT_INCOMPLETE);
  });

  it('reports malformed responses as errors rather than healthy/low TTL', () => {
    expect(
      exitCodeFor(
        result({ issues: [{ kind: 'invalid-response', contracts: ['C1'], message: 'invalid' }] }),
        17_280,
      ),
    ).toBe(EXIT_ERROR);
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
