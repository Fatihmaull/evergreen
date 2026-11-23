/**
 * PH2-E4-01: run the tenant plan in dry-run only.
 *
 * `runTenantPlan` builds configs with `mode: 'dry-run'` and a policy signer
 * reference, no secret. The pull estimate is left unset, so `checkBudget`
 * stays `'undetermined'` until the retry margin exists. Nothing here submits.
 */
import type { LedgerEntryReader } from '@evergreen-stellar/core';
import { runTenantPlan } from '@evergreen/engine/dist/tenant-run.js';
import type { TenantPlan } from '@evergreen/engine/dist/tenants.js';
import type { TenantRunDeps, TenantRunReport } from '@evergreen/engine/dist/tenant-run.js';

export async function dryRunTenantPlans(
  plans: readonly TenantPlan[],
  reader: LedgerEntryReader,
  runId: string,
  runDeadlineMs?: number,
  run: (
    plans: readonly TenantPlan[],
    deps: TenantRunDeps,
  ) => Promise<TenantRunReport> = runTenantPlan,
): Promise<TenantRunReport> {
  return run(plans, { reader, runId, ...(runDeadlineMs === undefined ? {} : { runDeadlineMs }) });
}
