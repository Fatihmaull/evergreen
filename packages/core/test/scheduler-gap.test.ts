import { describe, expect, it } from 'vitest';
import {
  MIN_ACTION_RUNS_IN_WINDOW,
  lowestPassingActionWindowLedgers,
  marginLedgers,
  schedulerGapCheck,
  tickGapsLedgers,
  worstGapLedgers,
} from '../src/index.js';

// DoD-2 (Fatih, 2026-10-28): 4 × the worst observed gap, in ledgers, is below the lowest
// act window in use. A 15-minute tick is about 180 ledgers (5 s each).
describe('the scheduler gap, in ledgers', () => {
  it('is the differences between consecutive ticks', () => {
    expect(tickGapsLedgers([1000, 1180, 1360, 1900])).toEqual([180, 180, 540]);
  });

  it('🔴 is empty, not zero, when fewer than two ticks exist: nothing has been measured', () => {
    expect(tickGapsLedgers([])).toEqual([]);
    expect(tickGapsLedgers([1000])).toEqual([]);
    expect(worstGapLedgers([])).toBeUndefined();
    expect(schedulerGapCheck(undefined, 17_280)).toBeUndefined();
  });

  it('allows two ticks in the same ledger (a manual dispatch beside a cron tick)', () => {
    expect(tickGapsLedgers([1000, 1000, 1180])).toEqual([0, 180]);
  });

  it('🔴 refuses a ledger that goes down: a testnet reset or ticks out of order', () => {
    expect(() => tickGapsLedgers([5000, 5180, 40])).toThrow(/not in ledger order/);
    expect(() => tickGapsLedgers([5000, 4999])).toThrow(RangeError);
  });

  it.each([[0], [-1], [1.5], [Number.NaN], [2 ** 60]])('🔴 refuses %s as a ledger', (bad) => {
    expect(() => tickGapsLedgers([1000, bad])).toThrow(RangeError);
  });

  it('takes the worst gap', () => {
    expect(worstGapLedgers([180, 540, 180])).toBe(540);
    expect(worstGapLedgers([0])).toBe(0);
  });

  it('refuses a malformed gap rather than reporting a worst of it', () => {
    expect(() => worstGapLedgers([180, -1])).toThrow(RangeError);
    expect(() => worstGapLedgers([180, 1.5])).toThrow(RangeError);
  });
});

describe('what four runs of margin come to', () => {
  it('reads the four from core, not from a second literal', () => {
    expect(MIN_ACTION_RUNS_IN_WINDOW).toBe(4);
    expect(marginLedgers(540)).toBe(540 * MIN_ACTION_RUNS_IN_WINDOW);
  });

  it('🔴 passes only when 4 × the worst gap is STRICTLY below the lowest window', () => {
    // worst 540 → margin 2,160
    expect(schedulerGapCheck(540, 2_161)).toEqual({ passes: true, marginLedgers: 2_160 });
    expect(schedulerGapCheck(540, 2_160)).toEqual({ passes: false, marginLedgers: 2_160 });
    expect(schedulerGapCheck(540, 2_159)).toEqual({ passes: false, marginLedgers: 2_160 });
  });

  it('🔴 fails a 17,000-ledger gap against the 17,280 default, which the old wording would have passed', () => {
    expect(schedulerGapCheck(17_000, 17_280)).toEqual({ passes: false, marginLedgers: 68_000 });
    expect(schedulerGapCheck(4_319, 17_280)?.passes).toBe(true); // 17,276 < 17,280
    expect(schedulerGapCheck(4_320, 17_280)?.passes).toBe(false); // 17,280 is not below 17,280
  });

  it('🔴 the published floor is the smallest window that passes, and one less does not', () => {
    for (const worst of [180, 540, 4_319]) {
      const floor = lowestPassingActionWindowLedgers(worst);
      expect(floor).toBe(worst * 4 + 1);
      expect(schedulerGapCheck(worst, floor)?.passes).toBe(true);
      expect(schedulerGapCheck(worst, floor - 1)?.passes).toBe(false);
    }
  });

  it('a worst gap of 0 needs no margin: the floor is one ledger, the smallest valid window', () => {
    expect(lowestPassingActionWindowLedgers(0)).toBe(1);
    expect(schedulerGapCheck(0, 1)?.passes).toBe(true);
  });

  it('refuses a window that is not a ledger count', () => {
    expect(() => schedulerGapCheck(180, 0)).toThrow(RangeError);
    expect(() => schedulerGapCheck(180, 1.5)).toThrow(RangeError);
    expect(() => marginLedgers(-1)).toThrow(RangeError);
  });
});
