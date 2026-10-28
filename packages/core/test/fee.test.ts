import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PROVISIONAL_HOSTED_FEE,
  PROVISIONAL_ROUTER_FEE,
  hostedFeeStroops,
  routerFeeStroops,
} from '../src/index.js';

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

// The router path (one signature, no allowance): 2% of rent, NO minimum. Fatih, 2026-10-28, #414.
describe('the provisional router-path fee', () => {
  it('🔴 is the hosted percentage with no minimum, and reads that percentage rather than repeating it', () => {
    expect(PROVISIONAL_ROUTER_FEE.minimumStroops).toBe(0n);
    expect(PROVISIONAL_ROUTER_FEE.basisPoints).toBe(PROVISIONAL_HOSTED_FEE.basisPoints);
  });

  it('🔴 holds the percentage in one place: the only literal in fee.ts is the hosted one', () => {
    // Equal values cannot prove this: a second `200n` would equal the hosted one today and
    // drift the day someone changes only one. So read the source.
    const src = readFileSync(new URL('../src/fee.ts', import.meta.url), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(src.match(/\b200n\b/g)).toHaveLength(1);
    expect(src).toMatch(
      /PROVISIONAL_ROUTER_FEE[^;]*basisPoints: PROVISIONAL_HOSTED_FEE\.basisPoints/,
    );
  });

  it('🔴 charges nothing on nothing, and no floor on a small job', () => {
    expect(routerFeeStroops(0n)).toBe(0n);
    expect(routerFeeStroops(1_000_000n)).toBe(20_000n); // 0.1 XLM of rent: below the hosted minimum
    expect(hostedFeeStroops(1_000_000n)).toBe(25_000n); // and the hosted path would charge more
  });

  it('is 2% of rent, rounded up', () => {
    expect(routerFeeStroops((127n * XLM) / 100n)).toBe(254_000n);
    expect(routerFeeStroops(1_000_001n)).toBe(20_001n); // a floor would give 20,000
    expect(routerFeeStroops(1n)).toBe(1n); // a stroop of rent still rounds up to a stroop
  });

  it('takes its numbers from the configuration it is given', () => {
    expect(routerFeeStroops(10n * XLM, { basisPoints: 500n, minimumStroops: 0n })).toBe(5_000_000n);
    expect(routerFeeStroops(10n * XLM)).toBe(2_000_000n); // the default is untouched
  });

  it('refuses negative rent', () => {
    expect(() => routerFeeStroops(-1n)).toThrow(RangeError);
  });
});
