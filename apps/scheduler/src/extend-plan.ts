/**
 * Stage 2 prep of PH2-E4-04 (docs/PH2-E4-04-SCHEDULER-DESIGN.md §3): turns the due items of a
 * tick into the **would-submit set**, one extend request per payer (design §3, "a message per
 * payer"), and defines the interface the PH2-E4-02 money path will implement.
 *
 * **Nothing here signs, holds a key, enqueues, writes or calls the network.** The only
 * submitter in this package is `dryRunSubmitter`, which records counts and returns. The real
 * submitter (preflight → pull → extend → reconcile → refund) is Rakha's PH2-E4-02; until it
 * exists, Stage 2 stays dry-run. Decisions this file does not make, because they are open:
 * - the job key / autopilot window (`jobs.autopilot_window`, design §7, Rakha's call);
 * - the fee and the pull amount (PH2-E4-02; here only the user's per-job cap is carried);
 * - expired entries: an extend cannot revive them (restore is separate), so they are skipped.
 */
import type { TenantItem, TenantPlan } from '@evergreen/engine/dist/tenants.js';
import type { DueVerdict } from './due.js';

/** One item the money path would extend. */
export interface ExtendItem {
  readonly userId: string;
  readonly contractId: string;
  readonly scope: unknown;
  readonly extendToLedgers: bigint;
  /** Stroops: the user's per-job cap. The real pull amount is PH2-E4-02's to compute. */
  readonly perJobMaxStroops: bigint;
}

/** One message per payer (design §3). */
export interface ExtendRequest {
  readonly network: TenantPlan['network'];
  readonly payerAccount: string;
  readonly items: readonly ExtendItem[];
}

export type SkipReason = 'not-due' | 'expired' | 'undetermined' | 'no-budget';

export interface ExtendPlan {
  readonly requests: readonly ExtendRequest[];
  readonly skipped: Readonly<Record<SkipReason, number>>;
}

/** What PH2-E4-02 implements. Not implemented in this package except as a dry run. */
export interface ExtendSubmitter {
  readonly mode: 'dry-run' | 'live';
  submit(request: ExtendRequest): Promise<SubmitOutcome>;
}

export type SubmitOutcome = { readonly action: 'dry-run'; readonly items: number };

/** Due items with budget left, grouped per payer. Items are never merged across payers. */
export function planExtendRequests(
  plans: readonly TenantPlan[],
  verdicts: ReadonlyMap<TenantItem, DueVerdict>,
): ExtendPlan {
  const skipped: Record<SkipReason, number> = {
    'not-due': 0,
    expired: 0,
    undetermined: 0,
    'no-budget': 0,
  };
  const requests: ExtendRequest[] = [];
  for (const plan of plans) {
    const items: ExtendItem[] = [];
    for (const item of plan.items) {
      // A missing verdict is undetermined, never due.
      const v = verdicts.get(item) ?? 'undetermined';
      if (v !== 'due') {
        skipped[v] += 1;
        continue;
      }
      if (item.budget.perJobMax === 0n || item.budget.per30dRemaining === 0n) {
        skipped['no-budget'] += 1;
        continue;
      }
      const cap =
        item.budget.perJobMax < item.budget.per30dRemaining
          ? item.budget.perJobMax
          : item.budget.per30dRemaining;
      items.push({
        userId: item.userId,
        contractId: item.contractId,
        scope: item.scope,
        extendToLedgers: item.extendToLedgers,
        perJobMaxStroops: cap,
      });
    }
    if (items.length > 0)
      requests.push({ network: plan.network, payerAccount: plan.payerAccount, items });
  }
  return { requests, skipped };
}

/** The would-submit set as a tick logs it: counts only, never a user, contract or payer. */
export interface WouldSubmitSummary {
  readonly dryRun: true;
  readonly payers: number;
  readonly items: number;
  readonly skipped: Readonly<Record<SkipReason, number>>;
}

export function summariseWouldSubmit(plan: ExtendPlan): WouldSubmitSummary {
  return {
    dryRun: true,
    payers: plan.requests.length,
    items: plan.requests.reduce((n, r) => n + r.items.length, 0),
    skipped: { ...plan.skipped },
  };
}

/** The only submitter in this package: records what would be submitted, does nothing else. */
export function dryRunSubmitter(): ExtendSubmitter & { readonly seen: ExtendRequest[] } {
  const seen: ExtendRequest[] = [];
  return {
    mode: 'dry-run',
    seen,
    submit(request) {
      seen.push(request);
      return Promise.resolve({ action: 'dry-run', items: request.items.length });
    },
  };
}

/**
 * Hands each request to the submitter. Refuses a non-dry-run submitter: going live is a
 * separate, reviewed change after PH2-E4-02, not a flag.
 */
export async function submitPlan(
  plan: ExtendPlan,
  submitter: ExtendSubmitter,
): Promise<readonly SubmitOutcome[]> {
  if (submitter.mode !== 'dry-run') throw new Error('STAGE2_LIVE_SUBMIT_REFUSED');
  const out: SubmitOutcome[] = [];
  for (const r of plan.requests) out.push(await submitter.submit(r));
  return out;
}
