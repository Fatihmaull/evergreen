import { describe, expect, it } from 'vitest';
import type { LedgerEntryTTL } from '@evergreen-stellar/shared-types';
import { assessEntry, worstHealth } from '../src/health.js';

const THRESHOLD = 17_280;

function entry(
  over: {
    remaining?: number | undefined;
    contracts?: string[];
    kind?: LedgerEntryTTL['kind'];
    endBehavior?: LedgerEntryTTL['endBehavior'];
  } = {},
): LedgerEntryTTL {
  const remaining = 'remaining' in over ? over.remaining : 100_000;
  const kind = over.kind ?? 'persistent';
  const endBehavior = over.endBehavior ?? (kind === 'temporary' ? 'deleted' : 'archived');
  return {
    kind,
    endBehavior,
    contracts: over.contracts ?? ['CONTRACT_A'],
    observedAtLedger: 1_000_000,
    ttl:
      remaining === undefined
        ? { status: 'unavailable' }
        : { status: 'known', endsAtLedger: 1_000_000 + remaining, remainingLedgers: remaining },
  } as LedgerEntryTTL;
}

describe('assessEntry — blast radius changes what critical means', () => {
  it('grades a lone low archived entry as WARNING — recoverable, affects one contract', () => {
    const a = assessEntry(entry({ remaining: 100 }), THRESHOLD);
    expect(a.health).toBe('warning');
    expect(a.blastRadius).toBe(1);
    expect(a.isShared).toBe(false);
  });

  it('🔴 grades the SAME TTL as CRITICAL once the entry is shared', () => {
    // The rule that motivates the whole task: a shared code entry at 3 days is
    // not one contract at 3 days, it is N contracts at 3 days. Identical
    // remaining ledgers, different severity, because the blast radius differs.
    const shared = assessEntry(
      entry({ remaining: 100, kind: 'code', contracts: ['A', 'B', 'C', 'D'] }),
      THRESHOLD,
    );
    expect(shared.health).toBe('critical');
    expect(shared.blastRadius).toBe(4);
    expect(shared.reason).toContain('4 contracts');
  });

  it('🔴 grades a low TEMPORARY entry critical — deletion is unrecoverable', () => {
    const a = assessEntry(entry({ remaining: 100, kind: 'temporary' }), THRESHOLD);
    expect(a.health).toBe('critical');
    expect(a.reason).toContain('DELETED');
  });

  it('grades an expired archived entry critical and points at RESTORE, not extend', () => {
    const a = assessEntry(entry({ remaining: -5 }), THRESHOLD);
    expect(a.health).toBe('critical');
    expect(a.isExpired).toBe(true);
    expect(a.reason).toContain('RestoreFootprintOp');
  });

  it('does not tell a user that deleted temporary data can be restored', () => {
    // Reporting archived and deleted identically is a documented UX bug here.
    const a = assessEntry(entry({ remaining: -5, kind: 'temporary' }), THRESHOLD);
    expect(a.reason).toContain('not recoverable');
    expect(a.reason).not.toContain('Restore');
  });
});

describe('assessEntry — the boundaries', () => {
  it('grades an entry above threshold healthy', () => {
    expect(assessEntry(entry({ remaining: THRESHOLD + 1 }), THRESHOLD).health).toBe('healthy');
  });

  it('grades an entry EXACTLY at the threshold as needing action', () => {
    // Follows the floor policy rather than restating it.
    const a = assessEntry(entry({ remaining: THRESHOLD }), THRESHOLD);
    expect(a.needsAction).toBe(true);
    expect(a.health).not.toBe('healthy');
  });

  it('grades an entry on its final live ledger as low, not expired', () => {
    const a = assessEntry(entry({ remaining: 0 }), THRESHOLD);
    expect(a.isExpired).toBe(false);
    expect(a.needsAction).toBe(true);
  });
});

describe('assessEntry — unknown is its own state', () => {
  it('grades unreadable TTL as UNKNOWN, never healthy', () => {
    const a = assessEntry(entry({ remaining: undefined }), THRESHOLD);
    expect(a.health).toBe('unknown');
    expect(a.reason).toContain('not healthy');
  });

  it('does not claim an unknown entry needs action either — it claims nothing', () => {
    const a = assessEntry(entry({ remaining: undefined }), THRESHOLD);
    expect(a.needsAction).toBe(false);
    expect(a.isExpired).toBe(false);
  });

  it('still reports blast radius for an unknown entry', () => {
    // How many contracts depend on it does not require reading its TTL.
    expect(
      assessEntry(entry({ remaining: undefined, contracts: ['A', 'B'] }), THRESHOLD).blastRadius,
    ).toBe(2);
  });
});

describe('worstHealth', () => {
  it('reports critical over everything else', () => {
    const assessments = [
      assessEntry(entry({ remaining: 500_000 }), THRESHOLD),
      assessEntry(entry({ remaining: 100 }), THRESHOLD),
      assessEntry(entry({ remaining: 100, contracts: ['A', 'B'] }), THRESHOLD),
    ];
    expect(worstHealth(assessments)).toBe('critical');
  });

  it('ranks UNKNOWN worse than warning — an unread entry is not a mild one', () => {
    const assessments = [
      assessEntry(entry({ remaining: 100 }), THRESHOLD),
      assessEntry(entry({ remaining: undefined }), THRESHOLD),
    ];
    expect(worstHealth(assessments)).toBe('unknown');
  });

  it('returns undefined for an empty scan rather than claiming health', () => {
    expect(worstHealth([])).toBeUndefined();
  });

  it('reports healthy only when every entry is healthy', () => {
    expect(worstHealth([assessEntry(entry({ remaining: 500_000 }), THRESHOLD)])).toBe('healthy');
  });
});
