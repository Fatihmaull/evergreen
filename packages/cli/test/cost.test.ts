import { describe, expect, it } from 'vitest';
import type { Stroops } from '@evergreen-stellar/shared-types';
import { approximateXlm, formatCost, type CostLine } from '../src/cost.js';

function cost(over: Partial<CostLine> = {}): CostLine {
  return {
    totalStroops: '8212414' as Stroops,
    rentStroops: '8188798' as Stroops,
    otherStroops: '23616' as Stroops,
    entryCount: 2,
    additionalLedgers: 518_400,
    cappedEntryCount: 0,
    maxEntryTtl: 3_110_400,
    pricedAtLedger: 4_600_544,
    rentByEntry: { instanceKey: '80000' as Stroops, codeKey: '8108798' as Stroops },
    ...over,
  };
}

describe('approximateXlm — never a figure the method cannot support', () => {
  it('rounds to two significant figures', () => {
    // Simulated rent moved ~18% against a real fee one day apart. Printing
    // 0.8212414 XLM would imply seven significant figures from that.
    expect(approximateXlm('8212414' as Stroops)).toBe('about 0.82 XLM');
    expect(approximateXlm('318803' as Stroops)).toBe('about 0.032 XLM');
  });

  it('says "about", so the imprecision is in the words not just the digits', () => {
    expect(approximateXlm('8212414' as Stroops)).toContain('about');
  });

  it('reports a genuine zero as zero, not as "about 0"', () => {
    expect(approximateXlm('0' as Stroops)).toBe('0 XLM');
  });
});

describe('formatCost — total leads, rent breaks out underneath', () => {
  const out = formatCost(cost()).join('\n');

  it('puts the total first and says what it is', () => {
    const total = out.indexOf('total');
    const rent = out.indexOf('rent');
    expect(total).toBeGreaterThan(-1);
    expect(total).toBeLessThan(rent);
    // Someone funding a bot account is deciding with this number.
    expect(out).toContain('what leaves the account');
  });

  it('breaks out rent and fees beneath it', () => {
    expect(out).toContain('rent');
    expect(out).toContain('non-refundable resource + base fee');
  });

  it('gives exact stroops alongside the approximation', () => {
    // The rounded figure is for deciding; the exact one is for reconciling.
    expect(out).toContain('8,212,414 stroops');
  });

  it('states the variance rather than implying it by rounding alone', () => {
    expect(out).toContain('varies with network state');
    expect(out).toContain('~18%');
    expect(out).toContain('not a quoted price');
  });

  it('names the read-then-submit gap so a discrepancy is not read as a bug', () => {
    expect(out).toContain('the ledger advances before');
  });

  it('🔴 names BOTH quantities the gap moves, and says they go opposite ways', () => {
    // One phrase covering two quantities is the alertThresholdOn/expiresOn
    // collision again. `--ledgers 1000` measured +1,002 on absolute expiry in
    // the live proof, while remaining TTL lands UNDER target — both true, in
    // opposite directions. A note saying only "under the target" makes a user
    // comparing the promise to the receipt conclude one is a bug.
    expect(out).toContain('REMAINING TTL');
    expect(out).toContain('UNDER target');
    expect(out).toContain('ABSOLUTE EXPIRY');
    expect(out).toContain('PAST the request');
  });

  it('names the dominant entry when one entry is most of the bill', () => {
    // 99% of this bill is the shared code entry — the same entry N contracts
    // depend on. A total alone hides that.
    expect(out).toContain('% of that rent is one entry');
    expect(out).toContain('shared between contracts');
  });

  it('does not single out an entry when the bill is evenly split', () => {
    const even = formatCost(
      cost({
        rentByEntry: { a: '50' as Stroops, b: '50' as Stroops },
        rentStroops: '100' as Stroops,
      }),
    ).join('\n');
    expect(even).not.toContain('% of that rent is one entry');
  });
});

describe('formatCost — capping is announced, never silent', () => {
  it('🔴 says the request was capped and that entries get less than asked', () => {
    // Silently returning a smaller extension while reporting success is the
    // same shortfall shape as passing a delta where a target belongs.
    const out = formatCost(cost({ cappedEntryCount: 1 })).join('\n');
    expect(out).toContain('CAPPED at the operation maximum of 3,110,399 ledgers');
    expect(out).toContain('less than requested');
  });

  it('says nothing about capping when nothing was capped', () => {
    expect(formatCost(cost()).join('\n')).not.toContain('CAPPED');
  });

  it('pluralises the capped count correctly', () => {
    expect(formatCost(cost({ cappedEntryCount: 1 })).join('\n')).toContain('1 entry was');
    expect(formatCost(cost({ cappedEntryCount: 3 })).join('\n')).toContain('3 entries were');
  });
});
