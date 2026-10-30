/**
 * Stage 1 of PH2-E4-04 (docs/PH2-E4-04-SCHEDULER-DESIGN.md §3): evaluation, **read-only and
 * dry-run**. It reads the autopilot plan with the engine's own queries (`PgTenantStore`,
 * `planTenantsFromStore`, #440) under the scheduler role's grants from migration 0008, and
 * reports what it found. It enqueues nothing, signs nothing and writes nothing; acting on the
 * plan is Stage 2, after PH2-E4-02.
 *
 * The engine is imported by file, not through its index: the index also exports the email and
 * webhook channels, which import `node:crypto`, and this package is a Worker with no Node types.
 * The three files used here are pure.
 *
 * **Two locks against a write, independent of each other.**
 * 1. `readOnlyQuery` refuses any statement that is not a single SELECT before it reaches the
 *    driver (`EVAL_WRITE_REFUSED`). The 0008 grants let this role INSERT into `jobs` and
 *    `fee_ledger` for Stage 2, so the database alone would not stop an evaluation that wrote.
 * 2. The database: under 0008 the role cannot write `watch_items`, `wallets` or `users` at all.
 */
import { PgTenantStore, type TenantQuery } from '@evergreen/engine/dist/pg-tenant-store.js';
import { planTenantsFromStore } from '@evergreen/engine/dist/tenant-store.js';
import type { TenantPlan } from '@evergreen/engine/dist/tenants.js';
import type { LedgerEntryReader } from '@evergreen-stellar/core';
import { countVerdicts, dueVerdicts, timedReader, type DueCounts, type RpcTiming } from './due.js';
import {
  planExtendRequests,
  summariseWouldSubmit,
  type WouldSubmitSummary,
} from './extend-plan.js';

export type EvaluationErrorCode = 'EVAL_WRITE_REFUSED' | 'EVAL_DB_FAILED';

export class EvaluationError extends Error {
  constructor(readonly code: EvaluationErrorCode) {
    super(code);
    this.name = 'EvaluationError';
  }
}

/** Anything that changes state, takes a lock or calls a sequence. Matched as whole words. */
const WRITE_WORDS =
  /\b(insert|update|delete|truncate|merge|upsert|alter|drop|create|grant|revoke|copy|call|do|lock|set|reset|nextval|setval|vacuum|refresh|comment|listen|notify|execute|prepare)\b/i;

/** True only for one statement that starts with SELECT and carries no write word. */
export function isReadOnlyStatement(sql: string): boolean {
  const text = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();
  if (!/^select\b/i.test(text)) return false;
  if (text.replace(/;\s*$/, '').includes(';')) return false;
  return !WRITE_WORDS.test(text);
}

/** Wraps a query so only read-only statements reach the database. */
export function readOnlyQuery(query: TenantQuery): TenantQuery {
  return (sql, params) => {
    if (!isReadOnlyStatement(sql)) return Promise.reject(new EvaluationError('EVAL_WRITE_REFUSED'));
    return query(sql, params);
  };
}

/** What a tick logs: counts only, never a user id, contract or payer. */
export interface EvaluationSummary {
  readonly dryRun: true;
  /** Payers with at least one eligible autopilot item. */
  readonly payers: number;
  /** Eligible autopilot items across all payers. */
  readonly items: number;
  /** Items whose 30-day budget has nothing left, including undetermined spend (fails closed). */
  readonly itemsWithoutBudget: number;
  /** Stage 1b: due-ness from the chain. Absent when no reader was given. */
  readonly due?: DueCounts;
  /** Stage 1b: how long the chain reads took this tick. Absent when no reader was given. */
  readonly rpc?: RpcTiming;
  /** Stage 2 prep: what would be handed to PH2-E4-02, counts only. Absent with no reader. */
  readonly wouldSubmit?: WouldSubmitSummary;
}

export function summarise(plans: readonly TenantPlan[]): EvaluationSummary {
  let items = 0;
  let itemsWithoutBudget = 0;
  for (const plan of plans) {
    for (const item of plan.items) {
      items += 1;
      if (item.budget.per30dRemaining === 0n || item.budget.perJobMax === 0n)
        itemsWithoutBudget += 1;
    }
  }
  return { dryRun: true, payers: plans.length, items, itemsWithoutBudget };
}

/** Reads the testnet plan through the read-only wrapper. A database failure is reported by code only. */
export async function evaluate(
  query: TenantQuery,
  reader?: LedgerEntryReader,
  now: () => number = Date.now,
): Promise<{ readonly plans: readonly TenantPlan[]; readonly summary: EvaluationSummary }> {
  const store = new PgTenantStore(readOnlyQuery(query));
  let plans: TenantPlan[];
  try {
    plans = await planTenantsFromStore(store, 'testnet');
  } catch (error) {
    if (error instanceof EvaluationError) throw error;
    // Driver and row-shape errors can carry connection details: keep the code only.
    throw new EvaluationError('EVAL_DB_FAILED');
  }
  const summary = summarise(plans);
  if (reader === undefined) return { plans, summary };
  // core's scan turns a failed read into an issue (so the item is undetermined), never a throw.
  const timed = timedReader(reader, now);
  const verdicts = await dueVerdicts(plans, timed.reader);
  const wouldSubmit = summariseWouldSubmit(planExtendRequests(plans, verdicts));
  return {
    plans,
    summary: { ...summary, due: countVerdicts(verdicts), rpc: timed.timing(), wouldSubmit },
  };
}
