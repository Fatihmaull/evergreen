/**
 * PH2-E4-04 Stage 2 prep: due items -> per-payer extend requests, dry run only.
 * No network: global fetch throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantItem, TenantPlan } from '@evergreen/engine/dist/tenants.js';
import type { DueVerdict } from '../src/due.js';
import {
  dryRunSubmitter,
  planExtendRequests,
  submitPlan,
  summariseWouldSubmit,
  type ExtendSubmitter,
} from '../src/extend-plan.js';

const item = (contractId: string, perJobMax = 100n, per30dRemaining = 1000n): TenantItem => ({
  userId: 'u1',
  contractId,
  scope: { noDataKeys: true },
  thresholdLedgers: 17_280n,
  extendToLedgers: 535_680n,
  budget: { perJobMax, per30dRemaining },
});
const plan = (payerAccount: string, items: TenantItem[]): TenantPlan => ({
  network: 'testnet',
  payerAccount,
  items,
});

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is not allowed in tests');
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('planExtendRequests', () => {
  it('keeps only due items with budget, one request per payer, and counts every skip', () => {
    const a = item('CA'),
      b = item('CB'),
      c = item('CC'),
      d = item('CD'),
      e = item('CE', 0n),
      f = item('CF', 50n, 20n),
      g = item('CG');
    const plans = [plan('GA', [a, b, c, d, e]), plan('GB', [f, g])];
    const v = new Map<TenantItem, DueVerdict>([
      [a, 'due'],
      [b, 'not-due'],
      [c, 'expired'],
      [d, 'undetermined'],
      [e, 'due'],
      [f, 'due'],
      // g has no verdict: undetermined, never due.
    ]);
    const p = planExtendRequests(plans, v);
    expect(p.requests.map((r) => [r.payerAccount, r.items.map((i) => i.contractId)])).toEqual([
      ['GA', ['CA']],
      ['GB', ['CF']],
    ]);
    // The cap is the lower of the per-job max and what is left of the 30-day budget.
    expect(p.requests[1]!.items[0]!.perJobMaxStroops).toBe(20n);
    expect(p.skipped).toEqual({ 'not-due': 1, expired: 1, undetermined: 2, 'no-budget': 1 });
  });

  it('a payer with nothing due produces no request', () => {
    const a = item('CA');
    expect(planExtendRequests([plan('GA', [a])], new Map([[a, 'not-due']])).requests).toEqual([]);
  });

  it('the summary carries counts only, no payer, user or contract', () => {
    const a = item('CA');
    const s = summariseWouldSubmit(planExtendRequests([plan('GA', [a])], new Map([[a, 'due']])));
    expect(s).toEqual({
      dryRun: true,
      payers: 1,
      items: 1,
      skipped: { 'not-due': 0, expired: 0, undetermined: 0, 'no-budget': 0 },
    });
    expect(JSON.stringify(s)).not.toMatch(/GA|CA|u1/);
  });
});

describe('submitPlan', () => {
  const a = item('CA');
  const p = planExtendRequests([plan('GA', [a])], new Map([[a, 'due']]));

  it('the dry-run submitter records the request and moves nothing', async () => {
    const s = dryRunSubmitter();
    expect(await submitPlan(p, s)).toEqual([{ action: 'dry-run', items: 1 }]);
    expect(s.seen).toHaveLength(1);
  });

  it('guard removal: a live submitter is refused before any submit', async () => {
    const submit = vi.fn();
    const live: ExtendSubmitter = { mode: 'live', submit };
    await expect(submitPlan(p, live)).rejects.toThrow('STAGE2_LIVE_SUBMIT_REFUSED');
    expect(submit).not.toHaveBeenCalled();
  });
});
