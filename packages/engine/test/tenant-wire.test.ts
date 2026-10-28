import { describe, expect, it } from 'vitest';
import { planTenants, tenantPlanToWire } from '../src/tenants.js';
import { row } from './tenant-fixtures.js';

describe('tenantPlanToWire', () => {
  const big = 123456789012345678901234567890n;
  const [plan] = planTenants([row({ budgetPerJobMax: big, budgetPer30dMax: big })], new Map());

  it('raw plan is not JSON-safe (bigint)', () => {
    expect(() => JSON.stringify(plan)).toThrow(TypeError);
  });

  it('wire form stringifies, with exact decimal strings and no loss', () => {
    const json = JSON.stringify(tenantPlanToWire(plan!));
    const back = JSON.parse(json) as ReturnType<typeof tenantPlanToWire>;
    expect(back.items[0]!.budget.perJobMax).toBe('123456789012345678901234567890');
    expect(back.items[0]!.budget.per30dRemaining).toBe('0');
    expect(back.items[0]!.thresholdLedgers).toBe('1000');
    expect(back.items[0]!.extendToLedgers).toBe('5000');
    expect(BigInt(back.items[0]!.budget.perJobMax)).toBe(big);
    expect(back).toMatchObject({ network: 'testnet', payerAccount: plan!.payerAccount });
    expect(json).not.toMatch(/e\+|\d\.\d/);
  });
});
