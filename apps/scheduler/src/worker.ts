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
 * Nothing here signs, submits or reads a secret other than the two it is given.
 */
import { EvaluationError, type EvaluationSummary } from './evaluate.js';
import { TickError } from './tick.js';

export const SERVICE = 'evergreen-scheduler';

export interface Env {
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
  readonly runTick: () => Promise<{ readonly observedLedger: number }>;
  /**
   * Stage 1: the read-only, dry-run evaluation, run after the heartbeat is recorded. Absent
   * means Stage 0 only. Its failure never fails the tick: the heartbeat already measured the gap.
   */
  readonly evaluate?: () => Promise<EvaluationSummary>;
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
  evaluate: () => Promise<EvaluationSummary>,
  runtime: Runtime,
  trigger: 'cron' | 'manual',
): Promise<EvaluationSummary | { readonly ok: false; readonly code: string }> {
  try {
    const summary = await evaluate();
    runtime.log({
      event: 'scheduler.evaluate',
      trigger,
      environment: environmentOf(env),
      ...summary,
    });
    return summary;
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

/** Runs one tick and logs what happened: a code on failure, never a message. A fault of ours is logged as INTERNAL and rethrown. */
async function tick(env: Env, runtime: Runtime, trigger: 'cron' | 'manual') {
  try {
    const { observedLedger } = await runtime.runTick();
    runtime.log({
      event: 'scheduler.tick',
      ok: true,
      trigger,
      environment: environmentOf(env),
      observedLedger,
    });
    if (runtime.evaluate === undefined) return { ok: true as const, observedLedger };
    return {
      ok: true as const,
      observedLedger,
      evaluation: await evaluateStep(env, runtime.evaluate, runtime, trigger),
    };
  } catch (error) {
    const code = error instanceof TickError ? error.code : 'INTERNAL';
    runtime.log({ event: 'scheduler.tick_failed', trigger, environment: environmentOf(env), code });
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
