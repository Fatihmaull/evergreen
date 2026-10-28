import { describe, expect, it } from 'vitest';
import { PROVISIONAL_HOSTED_FEE, hostedFeeStroops } from '../src/index.js';

const XLM = 10_000_000n;

// PH2-E5-03: fee = max(2% × rent, 25,000 stroops), Fatih, 2026-10-27, #414. PROVISIONAL.
describe('the provisional hosted fee', () => {
  it('is 2% with a 25,000-stroop minimum, as named configuration', () => {
    expect(PROVISIONAL_HOSTED_FEE).toEqual({ basisPoints: 200n, minimumStroops: 25_000n });
  });

  it('🔴 matches the table Fatih posted on #414', () => {
    // Rent charged → fee, from the simulated mainnet jobs.
    expect(hostedFeeStroops((127n * XLM) / 100n)).toBe(254_000n); // 1.27 XLM → 0.0254 XLM
    expect(hostedFeeStroops((331n * XLM) / 100n)).toBe(662_000n); // 3.31 XLM → 0.066 XLM
    expect(hostedFeeStroops((619n * XLM) / 100n)).toBe(1_238_000n); // 6.19 XLM → 0.124 XLM
    expect(hostedFeeStroops((404n * XLM) / 10n)).toBe(8_080_000n); // 40.4 XLM → 0.81 XLM
  });

  it('🔴 the minimum binds below 0.125 XLM of rent and not above', () => {
    expect(hostedFeeStroops(0n)).toBe(25_000n);
    expect(hostedFeeStroops(1_249_999n)).toBe(25_000n);
    expect(hostedFeeStroops(1_250_000n)).toBe(25_000n); // exactly the crossover: 2% is 25,000
    expect(hostedFeeStroops(1_250_001n)).toBe(25_001n);
  });

  it('🔴 rounds the percentage part up, never down', () => {
    // 1,250,001 × 2% = 25,000.02: a floor would give 25,000.
    expect(hostedFeeStroops(1_250_001n)).toBe(25_001n);
    // 2,000,001 × 2% = 40,000.02
    expect(hostedFeeStroops(2_000_001n)).toBe(40_001n);
    expect(hostedFeeStroops(2_000_000n)).toBe(40_000n); // exact stays exact
  });

  it('is exact beyond what a JS number can hold', () => {
    const rent = 10n ** 30n + 1n;
    expect(hostedFeeStroops(rent)).toBe((rent * 200n + 9_999n) / 10_000n);
    expect(hostedFeeStroops(rent)).toBe(2n * 10n ** 28n + 1n);
  });

  it('🔴 refuses negative rent and negative configuration', () => {
    expect(() => hostedFeeStroops(-1n)).toThrow(RangeError);
    expect(() => hostedFeeStroops(1n, { basisPoints: -1n, minimumStroops: 0n })).toThrow(
      RangeError,
    );
    expect(() => hostedFeeStroops(1n, { basisPoints: 1n, minimumStroops: -1n })).toThrow(
      RangeError,
    );
  });

  it('takes its numbers from the configuration, so changing them changes the fee', () => {
    const higher = { basisPoints: 500n, minimumStroops: 30_000n };
    expect(hostedFeeStroops(0n, higher)).toBe(30_000n);
    expect(hostedFeeStroops(10n * XLM, higher)).toBe(5_000_000n);
    expect(hostedFeeStroops(10n * XLM)).toBe(2_000_000n); // the default is untouched
  });
});
