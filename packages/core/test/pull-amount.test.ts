import { describe, expect, it } from 'vitest';
import { PROVISIONAL_ROUTER_FEE, pullAmountStroops } from '../src/index.js';

// PH2-E4-02: pull = simulated rent + hostedFee(simulated rent) + absolute retry margin.
// Margin values below are test inputs only; the real size is undetermined.

describe('pullAmountStroops', () => {
  it.each([
    // simulatedRent, margin, fee, total
    [0n, 0n, 25_000n, 25_000n], // zero rent → the minimum
    [1_000_000n, 0n, 25_000n, 1_025_000n], // 2% = 20,000 < minimum
    [1_250_000n, 0n, 25_000n, 1_275_000n], // 2% = exactly 25,000 (boundary)
    [1_250_001n, 0n, 25_001n, 1_275_002n], // 25,000.02 → ceiling 25,001
    [10_000_000n, 6_100n, 200_000n, 10_206_100n], // percentage branch, margin passes through
  ])('rent %s + margin %s → fee %s, total %s', (rent, margin, fee, total) => {
    expect(pullAmountStroops({ simulatedRentStroops: rent, retryMarginStroops: margin })).toEqual({
      rentStroops: rent,
      feeStroops: fee,
      marginStroops: margin,
      totalStroops: total,
    });
  });

  it('is undefined (undetermined) when the margin is not configured, even for a valid rent', () => {
    expect(
      pullAmountStroops({ simulatedRentStroops: 1_000_000n, retryMarginStroops: undefined }),
    ).toBeUndefined();
  });

  it('throws on a negative rent', () => {
    expect(() => pullAmountStroops({ simulatedRentStroops: -1n, retryMarginStroops: 0n })).toThrow(
      RangeError,
    );
  });

  it('throws on a negative rent even with no margin configured', () => {
    expect(() =>
      pullAmountStroops({ simulatedRentStroops: -1n, retryMarginStroops: undefined }),
    ).toThrow(RangeError);
  });

  it('throws on a negative margin; a zero margin is allowed', () => {
    expect(() =>
      pullAmountStroops({ simulatedRentStroops: 1_000_000n, retryMarginStroops: -1n }),
    ).toThrow(/margin cannot be negative/);
    expect(
      pullAmountStroops({ simulatedRentStroops: 1_000_000n, retryMarginStroops: 0n })?.totalStroops,
    ).toBe(1_025_000n);
  });

  it('honours a custom fee config (router fee: 2%, no minimum)', () => {
    expect(
      pullAmountStroops(
        { simulatedRentStroops: 1_000_000n, retryMarginStroops: 5n },
        PROVISIONAL_ROUTER_FEE,
      ),
    ).toEqual({
      rentStroops: 1_000_000n,
      feeStroops: 20_000n,
      marginStroops: 5n,
      totalStroops: 1_020_005n,
    });
  });
});
