/**
 * Stage 2 of PH2-E4-04: the money step of a tick. After the heartbeat and the evaluation, it
 * enqueues one autopilot job per due item and then resumes or starts open jobs, oldest first,
 * through PH2-E4-02's `runHostedJob`. Open jobs include `extend-now` jobs the API queued (Fatih,
 * 2026-11-24, option A): same money path, the item's own budget and `extendToLedgers`, and
 * core's daily limit counted from the database.
 *
 * **Dry-run is the default.** `HOSTED_MODE=live` is honoured only with a valid `ENGINE_SECRET`;
 * otherwise the step counts what it would enqueue and touches neither the database nor the chain.
 * The retry margin has no default: unset, every live preflight fails `margin-unset` and nothing is
 * pulled.
 *
 * **Bounded (DevOps, 2026-11-23).** At most `maxJobs` jobs per tick, and no job starts after
 * `deadlineMs`. A job interrupted by the end of an invocation resumes from persisted state next
 * tick. One engine account signs everything, so jobs run one after another.
 *
 * The summary is counts only: no payer, user, contract or key.
 */
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import {
  runHostedJob,
  type HostedChain,
  type HostedJobCounts,
  type HostedJobOutcome,
  type HostedJobSnapshot,
  hostedJobCounts,
} from '@evergreen/engine/dist/money-path.js';
import { checkBudget, type TenantItem, type TenantPlan } from '@evergreen/engine/dist/tenants.js';
import type { ExtendPlan } from './extend-plan.js';
import {
  autopilotWindow,
  enqueueAutopilotJobs,
  extendNowUsedToday,
  loadJob,
  openJobs,
  saveStatements,
  type EnqueueItem,
  type Query,
  type Transaction,
} from './hosted-store.js';

export interface HostedEnv {
  HOSTED_MODE?: string;
  ENGINE_SECRET?: string;
  ALLOWANCE_RETRY_MARGIN_STROOPS?: string;
  HOSTED_MAX_JOBS_PER_TICK?: string;
}

export interface HostedConfig {
  readonly mode: 'dry-run' | 'live';
  /** Present only in live mode. */
  readonly engine?: Keypair;
  readonly retryMarginStroops: bigint | undefined;
  readonly maxJobs: number;
  readonly deadlineMs: number;
}

export const DEFAULT_MAX_JOBS_PER_TICK = 3;
export const MONEY_STEP_DEADLINE_MS = 300_000;

/** Reads the money step's settings. Anything malformed falls back to the safe side. */
export function parseHostedConfig(env: HostedEnv): HostedConfig {
  const marginText = env.ALLOWANCE_RETRY_MARGIN_STROOPS;
  const retryMarginStroops =
    marginText !== undefined && /^\d{1,15}$/.test(marginText) ? BigInt(marginText) : undefined;
  const maxText = env.HOSTED_MAX_JOBS_PER_TICK;
  const max = maxText !== undefined && /^\d{1,2}$/.test(maxText) ? Number(maxText) : NaN;
  const maxJobs = max >= 1 && max <= 10 ? max : DEFAULT_MAX_JOBS_PER_TICK;
  const base = { retryMarginStroops, maxJobs, deadlineMs: MONEY_STEP_DEADLINE_MS };
  const secret = env.ENGINE_SECRET;
  if (
    env.HOSTED_MODE !== 'live' ||
    secret === undefined ||
    !StrKey.isValidEd25519SecretSeed(secret)
  )
    return { mode: 'dry-run', ...base };
  return { mode: 'live', engine: Keypair.fromSecret(secret), ...base };
}

export interface HostedStageInput {
  readonly observedLedger: number;
  readonly plans: readonly TenantPlan[];
  readonly extendPlan: ExtendPlan;
}

export interface HostedStageDeps {
  readonly config: HostedConfig;
  readonly query: Query;
  readonly transaction: Transaction;
  /** Builds the chain port for one job (live only). Throws if the item's entries cannot be read. */
  readonly chainFor: (job: HostedJobSnapshot, item: TenantItem) => Promise<HostedChain>;
  readonly now?: () => number;
}

export interface HostedStageSummary extends HostedJobCounts {
  /** Due items with budget that this tick would hand to the money path. */
  readonly due: number;
  readonly enqueued: number;
  /** Open jobs skipped because their item is no longer in the plan. Needs an operator. */
  readonly orphaned: number;
  readonly deadlineHit: boolean;
}

const key = (userId: string, contractId: string): string => `${userId}\u0000${contractId}`;

export async function runHostedStage(
  input: HostedStageInput,
  deps: HostedStageDeps,
): Promise<HostedStageSummary> {
  const { config } = deps;
  const now = deps.now ?? Date.now;
  const started = now();
  const due: EnqueueItem[] = input.extendPlan.requests.flatMap((request) =>
    request.items.map((item) => ({
      userId: item.userId,
      contractId: item.contractId,
      payerAccount: request.payerAccount,
    })),
  );
  const empty = { due: due.length, enqueued: 0, orphaned: 0, deadlineHit: false };
  if (config.mode !== 'live') return { ...hostedJobCounts([]), ...empty };

  const enqueued = await enqueueAutopilotJobs(
    deps.query,
    due,
    autopilotWindow(input.observedLedger),
  );
  const items = new Map<string, TenantItem>();
  for (const plan of input.plans)
    for (const item of plan.items) items.set(key(item.userId, item.contractId), item);

  const outcomes: HostedJobOutcome[] = [];
  let orphaned = 0;
  let deadlineHit = false;
  for (const job of await openJobs(deps.query, config.maxJobs)) {
    if (now() - started >= config.deadlineMs) {
      deadlineHit = true;
      break;
    }
    const item = items.get(key(job.userId, job.contractId));
    if (item === undefined) {
      // Autopilot was turned off or the item removed. A queued job never pulled, so it is
      // closed without touching the chain; a pulled one needs its money back by an operator.
      // A submitted pull may already have landed. Closing it here would drop the
      // refund. It is orphaned, same as a confirmed pull, until an operator finishes it.
      if (job.pullTxHash === null && job.pullSubmittedHash === null) {
        await deps.transaction(saveStatements({ ...job, status: 'preflight-failed' }, []));
      } else orphaned += 1;
      continue;
    }
    try {
      const chain = await deps.chainFor(job, item);
      outcomes.push(
        await runHostedJob({
          mode: 'live',
          retryMarginStroops: config.retryMarginStroops,
          chain,
          budget: (estimate) => checkBudget(item, estimate),
          extendNowUsedToday: () => extendNowUsedToday(deps.query, job),
          load: () => loadJob(deps.query, job.id),
          save: (next, rows) => deps.transaction(saveStatements(next, rows)),
        }),
      );
    } catch {
      outcomes.push({
        jobId: job.id,
        mode: 'live',
        status: 'failed',
        submitted: false,
        refunded: false,
        shortfallStroops: 0n,
        code: 'INTERNAL',
        userNotice: null,
        operatorAlert: null,
      });
    }
  }
  return {
    ...hostedJobCounts(outcomes),
    dryRun: false,
    due: due.length,
    enqueued,
    orphaned,
    deadlineHit,
  };
}
