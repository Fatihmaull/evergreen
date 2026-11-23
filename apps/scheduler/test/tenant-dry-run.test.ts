import { describe, expect, it } from 'vitest';
import type { LedgerEntryReader } from '@evergreen-stellar/core';
import type { EvergreenConfig } from '@evergreen-stellar/shared-types';
import { runTenantPlan } from '@evergreen/engine/dist/tenant-run.js';
import type { TenantPlan } from '@evergreen/engine/dist/tenants.js';
import type { TenantRunDeps } from '@evergreen/engine/dist/tenant-run.js';
import { dryRunTenantPlans } from '../src/tenant-dry-run.js';

const reader: LedgerEntryReader = {
  read: async () => ({ latestLedger: 1, entries: [] }),
};

const plan: TenantPlan = {
  network: 'testnet',
  payerAccount: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  items: [
    {
      userId: '00000000-0000-4000-8000-000000000001',
      contractId: 'C'.padEnd(56, 'A'),
      scope: { noDataKeys: true },
      thresholdLedgers: 1000n,
      extendToLedgers: 5000n,
      budget: { perJobMax: 10n, per30dRemaining: 20n },
    },
  ],
};

describe('dryRunTenantPlans', () => {
  it('does not pass a pull estimate', async () => {
    const seen: TenantRunDeps[] = [];
    await dryRunTenantPlans([plan], reader, 'tick-1', undefined, async (plans, deps) => {
      seen.push(deps);
      return { runId: deps.runId, tenants: [], warnings: [], plans };
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.estimate).toBeUndefined();
    expect(seen[0]!.runId).toBe('tick-1');
  });

  it('hands the engine a dry-run config and never a secret', async () => {
    const modes: string[] = [];
    await dryRunTenantPlans([plan], reader, 'tick-2', undefined, (plans, deps) =>
      runTenantPlan(plans, {
        ...deps,
        engine: async (_reader, config: EvergreenConfig) => {
          modes.push(config.mode);
          expect(JSON.stringify(config)).not.toMatch(/secret/i);
          expect(config.payers['tenant']).toEqual({
            signer: 'policy',
            signerRef: `hosted:${plan.payerAccount}`,
          });
          return {
            scan: { contracts: [], issues: [] },
            decisions: [],
            liveness: { entries: [] },
            health: { entries: [] },
            mode: 'dry-run',
          } as Awaited<ReturnType<NonNullable<TenantRunDeps['engine']>>>;
        },
      }),
    );
    expect(modes).toEqual(['dry-run']);
  });
});
