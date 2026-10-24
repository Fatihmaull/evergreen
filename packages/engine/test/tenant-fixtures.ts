import type { AutopilotItemRow } from '../src/tenants.js';

export const G = (c: string): string => `G${c.repeat(55)}`;
export const C = (c: string): string => `C${c.repeat(55)}`;
export const U1 = '00000000-0000-4000-8000-000000000001';
export const U2 = '00000000-0000-4000-8000-000000000002';

export function row(over: Partial<AutopilotItemRow> = {}): AutopilotItemRow {
  return {
    userId: U1,
    network: 'testnet',
    contractId: C('A'),
    scope: { noDataKeys: true },
    autopilotEnabled: true,
    removed: false,
    payerNetwork: 'testnet',
    payerAccount: G('A'),
    thresholdLedgers: 1000n,
    extendToLedgers: 5000n,
    budgetPerJobMax: 100n,
    budgetPer30dMax: 300n,
    ...over,
  };
}
