import { describe, expect, it } from 'vitest';
import {
  MIN_ACTION_RUNS_IN_WINDOW,
  belowGapMargin,
  gapMarginHolds,
  gapMarginLedgers,
} from '../src/index.js';

describe('gap margin (4 x worst gap)', () => {
  it('reads the multiplier from MIN_ACTION_RUNS_IN_WINDOW, which is 4', () => {
    expect(MIN_ACTION_RUNS_IN_WINDOW).toBe(4);
    expect(gapMarginLedgers(540n)).toBe(2160n);
    expect(gapMarginLedgers(0n)).toBe(0n);
  });

  it('refuses a negative gap (a reset, not a gap)', () => {
    expect(() => gapMarginLedgers(-1n)).toThrow(RangeError);
  });

  it('holds only strictly below the lowest act threshold', () => {
    expect(gapMarginHolds(540n, 2161n)).toBe(true);
    expect(gapMarginHolds(540n, 2160n)).toBe(false);
    expect(gapMarginHolds(540n, 2159n)).toBe(false);
    expect(gapMarginHolds(540n, 17280n)).toBe(true);
  });

  it('is undefined, never true, when an input is unknown', () => {
    expect(gapMarginHolds(undefined, 17280n)).toBeUndefined();
    expect(gapMarginHolds(540n, undefined)).toBeUndefined();
  });

  it('marks ledgers left strictly below the margin as at risk', () => {
    expect(belowGapMargin(2159n, 540n)).toBe(true);
    expect(belowGapMargin(2160n, 540n)).toBe(false);
    expect(belowGapMargin(undefined, 540n)).toBeUndefined();
    expect(belowGapMargin(100n, undefined)).toBeUndefined();
  });
});
