/**
 * The scheduler Worker's handlers (PH2-E4-04 Stage 0). Kept apart from `index.ts` so
 * they can be tested without the Workers runtime.
 *
 * - `scheduled`: the cron tick. Production only, every 15 minutes (Fatih, 2026-10-28).
 * - `POST /tick`: a manual tick, for the preview scheduler, which has **no cron**
 *   (the Neon allowance is per project, so two branches ticking would not fit). It is
 *   **off unless `TICK_TOKEN` is set**, answers only to that bearer token, and is the
 *   only thing here that takes a request.
 * - `GET /health`: the service and the deployed commit, as the API reports it (#460).
 *
 * Nothing here signs or submits. The money step (`Runtime.hostedJobs`, src/hosted-run.ts) does,
 * only with `HOSTED_MODE=live` and `ENGINE_SECRET`.
 */
import type { TenantPlan } from '@evergreen/engine/dist/tenants.js';
import type { TenantRunReport } from '@evergreen/engine/dist/tenant-run.js';
import { EvaluationError, type EvaluationSummary } from './evaluate.js';
import type { ExtendPlan } from './extend-plan.js';
import type { HostedEnv, HostedStageInput, HostedStageSummary } from './hosted-run.js';
import type { ObserveSummary } from './observe.js';
import type { SweepEnv, SweepTickCounts } from './sweep.js';
import { TickError } from './tick.js';

export const SERVICE = 'evergreen-scheduler';

export interface Env extends HostedEnv, SweepEnv {
  /** Secret. The scheduler's own role, never the owner's (docs/ops/neon-migrations.md). */
  DATABASE_URL?: string;
  /** Optional override; the RPC must still report the testnet passphrase. */
  SOROBAN_RPC_URL?: string;
  /** Secret. Turns the manual `POST /tick` on; unset, that route does not exist. */
  TICK_TOKEN?: string;
  ENVIRONMENT?: string;
  /** Injected by the deploy workflow, as for the API. */
  DEPLOY_COMMIT?: string;
}

export interface Runtime {
  readonly runTick: () => Promise<{ readonly observedLedger: number; readonly rpcMs?: number }>;
  /**
   * Stage 1: the read-only, dry-run evaluation, run after the heartbeat is recorded. Absent
   * means Stage 0 only. Its failure never fails the tick: the heartbeat already measured the gap.
   */
  readonly evaluate?: () => Promise<{
    readonly summary: EvaluationSummary;
    readonly plans: readonly TenantPlan[];
    readonly extendPlan?: ExtendPlan;
  }>;
  /**
   * PH2-E4-01: dry-run tenant run after evaluation. No estimate, so nothing is pulled.
   * Absent on a Stage 0 tick. A failure here never fails the tick.
   */
  readonly dryRunTenants?: (plans: readonly TenantPlan[]) => Promise<TenantRunReport>;
  /**
   * Stage 2 (PH2-E4-04 over PH2-E4-02's money path): enqueue due items, then resume or start
   * open jobs. Dry-run unless `HOSTED_MODE=live` with an engine key (src/hosted-run.ts). Only
   * counts are logged: no payer, user or contract. A failure never fails the tick.
   */
  readonly hostedJobs?: (input: HostedStageInput) => Promise<HostedStageSummary>;
  /**
   * PH2-E4-03. Absent means the tick does not sweep. When present, counts only.
   * Dry-run unless `SWEEP_MODE=live`. The buffer is `SWEEP_BUFFER_STROOPS`.
   * A failure never fails the tick.
   */
  readonly sweep?: () => Promise<SweepTickCounts>;
  /**
   * Engine observations (src/observe.ts): appends one `observations` row per watched testnet
   * contract it could read. Runs last on every tick that recorded a heartbeat, whatever the
   * earlier stages did. Counts only are logged. A failure never fails the tick.
   */
  readonly observe?: () => Promise<ObserveSummary>;
  readonly log: (entry: Readonly<Record<string, unknown>>) => void;
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

/** A full 40-character lowercase git SHA, or `undetermined`; never a guess (see the API's `deployedCommit`). */
export function deployedCommit(env: Env): string {
  const value = env.DEPLOY_COMMIT;
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : 'undetermined';
}

const environmentOf = (env: Env): string => env.ENVIRONMENT ?? 'undetermined';

/**
 * Compares the presented token with the expected one without leaking where they
 * differ or how long the expected one is: both are hashed to a fixed length first.
 */
export async function tokenMatches(presented: string | null, expected: string): Promise<boolean> {
  if (presented === null || expected === '') return false;
  const digest = async (text: string): Promise<Uint8Array> =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [a, b] = await Promise.all([digest(presented), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Runs the evaluation and logs counts or a code. A fault of ours (not an EvaluationError) is rethrown. */
async function evaluateStep(
  env: Env,
  evaluate: NonNullable<Runtime['evaluate']>,
  runtime: Runtime,
  trigger: 'cron' | 'manual',
): Promise<
  | Awaited<ReturnType<NonNullable<Runtime['evaluate']>>>
  | { readonly ok: false; readonly code: string }
> {
  try {
    const result = await evaluate();
    runtime.log({
      event: 'scheduler.evaluate',
      trigger,
      environment: environmentOf(env),
      ...result.summary,
    });
    return result;
  } catch (error) {
    if (!(error instanceof EvaluationError)) throw error;
    runtime.log({
      event: 'scheduler.evaluate_failed',
      trigger,
      environment: environmentOf(env),
      code: error.code,
    });
    return { ok: false as const, code: error.code };
  }
}

/** Dry-run tenant pass. Counts only. A tenant failure stays in the report; a bug is rethrown. */
async function tenantStep(
  env: Env,
  dryRunTenants: NonNullable<Runtime['dryRunTenants']>,
  plans: readonly TenantPlan[],
  runtime: Runtime,
  trigger: 'cron' | 'manual',
): Promise<void> {
  try {
    const report = await dryRunTenants(plans);
    let ok = 0;
    let failed = 0;
    let skipped = 0;
    for (const tenant of report.tenants) {
      if (tenant.status === 'ok') ok += 1;
      else if (tenant.status === 'failed') failed += 1;
      else skipped += 1;
    }
    runtime.log({
      event: 'scheduler.tenants',
      trigger,
      environment: environmentOf(env),
      dryRun: true,
      submitted: 0,
      ok,
      failed,
      skipped,
    });
  } catch (error) {
    if (error instanceof TypeError || error instanceof ReferenceError) throw error;
    runtime.log({
      event: 'scheduler.tenants_failed',
      trigger,
      environment: environmentOf(env),
      code: 'TENANT_RUN_FAILED',
    });
  }
}

/** Money path counts. A bug is rethrown. Any other failure stays off the heartbeat. */
async function moneyStep(
  env: Env,
  hostedJobs: NonNullable<Runtime['hostedJobs']>,
  input: HostedStageInput,
  runtime: Runtime,
  trigger: 'cron' | 'manual',
): Promise<void> {
  try {
    const counts = await hostedJobs(input);
    runtime.log({
      event: 'scheduler.money',
      trigger,
      environment: environmentOf(env),
      dryRun: counts.dryRun,
      due: counts.due,
      enqueued: counts.enqueued,
      jobs: counts.jobs,
      submitted: counts.submitted,
      refunded: counts.refunded,
      shortfall: counts.shortfall,
      preflightFailed: counts.preflightFailed,
      failed: counts.failed,
      orphaned: counts.orphaned,
      deadlineHit: counts.deadlineHit,
    });
  } catch (error) {
    if (error instanceof TypeError || error instanceof ReferenceError) throw error;
    runtime.log({
      event: 'scheduler.money_failed',
      trigger,
      environment: environmentOf(env),
      code: 'MONEY_PATH_FAILED',
    });
  }
}

/** Sweep counts. A bug is rethrown. Any other failure stays off the heartbeat. */
async function sweepStep(
  env: Env,
  sweep: NonNullable<Runtime['sweep']>,
  runtime: Runtime,
  trigger: 'cron' | 'manual',
): Promise<void> {
  try {
    const counts = await sweep();
    runtime.log({
      event: 'scheduler.sweep',
      trigger,
      environment: environmentOf(env),
      dryRun: counts.dryRun,
      reason: counts.reason,
      inFlight: counts.inFlight,
      amount: counts.amount,
      submitted: counts.submitted,
    });
  } catch (error) {
    if (error instanceof TypeError || error instanceof ReferenceError) throw error;
    runtime.log({
      event: 'scheduler.sweep_failed',
      trigger,
      environment: environmentOf(env),
      code: 'SWEEP_FAILED',
    });
  }
}

/** Observation counts. A bug is rethrown. Any other failure stays off the heartbeat. */
async function observeStep(
  env: Env,
  observe: NonNullable<Runtime['observe']>,
  runtime: Runtime,
  trigger: 'cron' | 'manual',
): Promise<void> {
  try {
    const counts = await observe();
    runtime.log({
      event: 'scheduler.observe',
      trigger,
      environment: environmentOf(env),
      contracts: counts.contracts,
      written: counts.written,
      skipped: counts.skipped,
    });
  } catch (error) {
    if (error instanceof TypeError || error instanceof ReferenceError) throw error;
    runtime.log({
      event: 'scheduler.observe_failed',
      trigger,
      environment: environmentOf(env),
      code: 'OBSERVE_FAILED',
    });
  }
}

/** Evaluation, the dry-run tenant pass, the money step and the sweep, each only when the one before it ran. */
async function stages(
  env: Env,
  runtime: Runtime,
  trigger: 'cron' | 'manual',
  observedLedger: number,
) {
  if (runtime.evaluate === undefined) return { ok: true as const, observedLedger };
  const evaluation = await evaluateStep(env, runtime.evaluate, runtime, trigger);
  if (!('summary' in evaluation) || runtime.dryRunTenants === undefined) {
    return {
      ok: true as const,
      observedLedger,
      evaluation: 'summary' in evaluation ? evaluation.summary : evaluation,
    };
  }
  await tenantStep(env, runtime.dryRunTenants, evaluation.plans, runtime, trigger);
  if (runtime.hostedJobs !== undefined && evaluation.extendPlan !== undefined) {
    await moneyStep(
      env,
      runtime.hostedJobs,
      { observedLedger, plans: evaluation.plans, extendPlan: evaluation.extendPlan },
      runtime,
      trigger,
    );
  }
  if (runtime.sweep !== undefined) await sweepStep(env, runtime.sweep, runtime, trigger);
  return { ok: true as const, observedLedger, evaluation: evaluation.summary };
}

/** Runs one tick and logs what happened: a code on failure, never a message. A fault of ours is logged as INTERNAL and rethrown. */
async function tick(env: Env, runtime: Runtime, trigger: 'cron' | 'manual') {
  try {
    const { observedLedger, rpcMs } = await runtime.runTick();
    runtime.log({
      event: 'scheduler.tick',
      ok: true,
      trigger,
      environment: environmentOf(env),
      observedLedger,
      ...(rpcMs === undefined ? {} : { rpcMs }),
    });
    const result = await stages(env, runtime, trigger, observedLedger);
    if (runtime.observe !== undefined) await observeStep(env, runtime.observe, runtime, trigger);
    return result;
  } catch (error) {
    const code = error instanceof TickError ? error.code : 'INTERNAL';
    runtime.log({
      event: 'scheduler.tick_failed',
      trigger,
      environment: environmentOf(env),
      code,
      // Whether a failed-tick row (ok = false) was written for it (migration 0010).
      ...(error instanceof TickError ? { recorded: error.recorded } : {}),
    });
    throw error;
  }
}

/** The cron handler. A failure is thrown, so the platform records the run as failed. */
export async function handleScheduled(env: Env, runtime: Runtime): Promise<void> {
  await tick(env, runtime, 'cron');
}

export async function handleFetch(request: Request, env: Env, runtime: Runtime): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (pathname === '/health') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'GET, HEAD' });
    }
    return json({
      ok: true,
      service: SERVICE,
      environment: environmentOf(env),
      commit: deployedCommit(env),
    });
  }

  // Off unless a token is configured: with none, the route does not exist.
  if (pathname === '/tick' && env.TICK_TOKEN !== undefined && env.TICK_TOKEN !== '') {
    const header = request.headers.get('authorization');
    const presented = header !== null && header.startsWith('Bearer ') ? header.slice(7) : null;
    // One answer for a missing, malformed or wrong token.
    if (!(await tokenMatches(presented, env.TICK_TOKEN)))
      return json({ ok: false, code: 'UNAUTHORIZED' }, 401);
    // Only after authenticating, so an unauthenticated caller learns nothing about the route.
    if (request.method !== 'POST') {
      return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'POST' });
    }
    try {
      return json(await tick(env, runtime, 'manual'));
    } catch (error) {
      if (error instanceof TickError) return json({ ok: false, code: error.code }, 502);
      return json({ ok: false, code: 'INTERNAL' }, 500);
    }
  }

  return json({ ok: false, code: 'NOT_FOUND' }, 404);
}
