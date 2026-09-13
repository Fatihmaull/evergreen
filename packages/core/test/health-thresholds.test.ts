import { describe, expect, it } from 'vitest';
import type { LedgerEntryTTL } from '@evergreen-stellar/shared-types';
import { assessEntryWithThresholds, resolveHealthThresholds } from '../src/health.js';

const defaults = { bumpWhenRemainingLedgersBelow: 17280, extendToLedgers: 518400 };
const horizons = { warnBelowLedgers: 120960, criticalBelowLedgers: 17280 };
function entry(
  remaining: number | undefined,
  kind: 'instance' | 'temporary' | 'code' = 'instance',
): LedgerEntryTTL {
  const lifecycle =
    kind === 'temporary'
      ? { kind, endBehavior: 'deleted' as const }
      : { kind, endBehavior: 'archived' as const };
  return {
    ...lifecycle,
    contracts: kind === 'code' ? ['A', 'B'] : ['A'],
    observedAtLedger: 5000000,
    ttl:
      remaining === undefined
        ? { status: 'unavailable' }
        : { status: 'known', endsAtLedger: 5000000 + remaining, remainingLedgers: remaining },
  };
}
describe('resolveHealthThresholds — explicit policy and legacy inheritance', () => {
  it('preserves legacy action while supplying the early warning horizon', () => {
    expect(resolveHealthThresholds(defaults)).toEqual(horizons);
    expect(defaults).not.toHaveProperty('warnBelowLedgers');
  });
  it('widens an omitted warning for a legacy high action override', () => {
    expect(resolveHealthThresholds(defaults, { bumpWhenRemainingLedgersBelow: 1500000 })).toEqual({
      warnBelowLedgers: 1500000,
      criticalBelowLedgers: 1500000,
    });
  });
  it('inherits an explicitly configured global warning', () => {
    expect(
      resolveHealthThresholds(
        { ...defaults, warnBelowLedgers: 60480 },
        { bumpWhenRemainingLedgersBelow: 8640 },
      ),
    ).toEqual({ warnBelowLedgers: 60480, criticalBelowLedgers: 8640 });
  });
  it('lets a contract override both horizons', () => {
    expect(
      resolveHealthThresholds(
        { ...defaults, warnBelowLedgers: 60480 },
        { warnBelowLedgers: 1000, bumpWhenRemainingLedgersBelow: 100 },
      ),
    ).toEqual({ warnBelowLedgers: 1000, criticalBelowLedgers: 100 });
  });
  it('never silently widens an explicit global warning for a higher contract action', () => {
    expect(() =>
      resolveHealthThresholds(
        { ...defaults, warnBelowLedgers: 120960 },
        { bumpWhenRemainingLedgersBelow: 1500000 },
      ),
    ).toThrow(/warnBelowLedgers/);
  });
  it('rejects an explicit contract warning below its inherited action', () => {
    expect(() => resolveHealthThresholds(defaults, { warnBelowLedgers: 100 })).toThrow(
      /warnBelowLedgers/,
    );
  });
  it('accepts equal horizons and explicit zero rather than treating zero as omitted', () => {
    expect(
      resolveHealthThresholds(defaults, { warnBelowLedgers: 0, bumpWhenRemainingLedgersBelow: 0 }),
    ).toEqual({ warnBelowLedgers: 0, criticalBelowLedgers: 0 });
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid warning %s',
    (value) => {
      expect(() => resolveHealthThresholds(defaults, { warnBelowLedgers: value })).toThrow(
        /warnBelowLedgers/,
      );
    },
  );
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid action %s',
    (value) => {
      expect(() =>
        resolveHealthThresholds(defaults, { bumpWhenRemainingLedgersBelow: value }),
      ).toThrow(/criticalBelowLedgers/);
    },
  );
});
describe('assessEntryWithThresholds — impact is not spending authority', () => {
  it.each([
    [120961, 'healthy', false, false],
    [120960, 'warning', false, false],
    [17281, 'warning', false, false],
    [17280, 'critical', true, false],
    [0, 'critical', true, false],
    [-1, 'critical', true, true],
    [undefined, 'unknown', false, false],
  ] as const)('assesses remaining %s as %s', (remaining, health, needsAction, isExpired) => {
    expect(assessEntryWithThresholds(entry(remaining), horizons)).toMatchObject({
      health,
      needsAction,
      isExpired,
    });
  });
  it.each(['temporary', 'code'] as const)(
    'keeps %s impact severe without action in warning-only interval',
    (kind) => {
      const assessment = assessEntryWithThresholds(entry(50000, kind), horizons);
      expect(assessment).toMatchObject({
        health: 'critical',
        needsAction: false,
        isExpired: false,
      });
      expect(assessment.reason).toMatch(/above.*action threshold/i);
    },
  );
  it('preserves non-restorable guidance for expired temporary data', () => {
    const assessment = assessEntryWithThresholds(entry(-1, 'temporary'), horizons);
    expect(assessment.reason).toMatch(/not recoverable/i);
  });
  it.each([
    { warnBelowLedgers: 100, criticalBelowLedgers: 200 },
    { warnBelowLedgers: NaN, criticalBelowLedgers: 0 },
  ])('refuses invalid direct assessment thresholds %j', (thresholds) => {
    expect(() => assessEntryWithThresholds(entry(10), thresholds)).toThrow();
  });
});
