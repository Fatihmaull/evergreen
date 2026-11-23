import { readFileSync } from 'node:fs';
import { lowestPassingActionWindowLedgers, schedulerGapCheck } from '@evergreen-stellar/core';
import { describe, expect, it } from 'vitest';

/**
 * K19 (Fatih, 2026-11-04) set `THRESHOLD_FLOOR_LEDGERS` to exactly 4 x the worst observed scheduler
 * gap + 1. **Departure, 2026-11-23 (CEF, under Fatih's standing authority, #645):** that left a
 * one-ledger margin, so the floor is now 4329 = 4 x 1082 + 1 (about 6 hours), which still passes the 4x rule at twice the
 * worst gap. K19's value stays the lower bound this test enforces.
 * The worst gap on record is production's 45-minute gap of 2026-11-03, 541 ledgers (measured by
 * DevOps). A floor below the published one would let the API accept an act threshold that DoD-2's
 * scheduler check (`schedulerGapCheck`, strict) then fails. This test reads the deployed values, so
 * lowering one without lowering the gap is a failing test, not a silent change.
 */
const WORST_GAP_LEDGERS = 541;
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const floors = [...wrangler.matchAll(/"THRESHOLD_FLOOR_LEDGERS":\s*"(\d+)"/g)].map((m) =>
  Number(m[1]),
);

describe('the configured THRESHOLD_FLOOR_LEDGERS', () => {
  it('is set for production and preview, and nowhere else', () => {
    expect(floors).toHaveLength(2);
  });

  it.each([0, 1])(
    '🔴 value %#: is 4329, at or above K19, and passes the 4x rule at twice the worst gap',
    (i) => {
      const floor = floors[i]!;
      expect(floor).toBe(lowestPassingActionWindowLedgers(2 * WORST_GAP_LEDGERS));
      expect(floor).toBe(4_329);
      expect(lowestPassingActionWindowLedgers(WORST_GAP_LEDGERS)).toBe(2_165);
      expect(floor).toBeGreaterThanOrEqual(lowestPassingActionWindowLedgers(WORST_GAP_LEDGERS));
      expect(schedulerGapCheck(WORST_GAP_LEDGERS, floor)?.passes).toBe(true);
      expect(schedulerGapCheck(2 * WORST_GAP_LEDGERS, floor)?.passes).toBe(true);
      expect(schedulerGapCheck(2 * WORST_GAP_LEDGERS + 1, floor)?.passes).toBe(false);
    },
  );
});
