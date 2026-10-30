import { describe, expect, it } from 'vitest';
import { EvaluationError } from '../src/evaluate.js';
import { TickError } from '../src/tick.js';
import {
  deployedCommit,
  handleFetch,
  handleScheduled,
  tokenMatches,
  type Env,
  type Runtime,
} from '../src/worker.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const TOKEN = 'a-long-random-token-not-a-real-one';

function runtime(behaviour: () => Promise<{ observedLedger: number }>) {
  const logs: Record<string, unknown>[] = [];
  let ticks = 0;
  const rt: Runtime = {
    runTick: () => {
      ticks++;
      return behaviour();
    },
    log: (entry) => logs.push({ ...entry }),
  };
  return { rt, logs, ticks: () => ticks };
}
const ticking = () => runtime(() => Promise.resolve({ observedLedger: 65_143_700 }));

const req = (path: string, init: RequestInit = {}): Request =>
  new Request(`https://scheduler.example.test${path}`, init);
const post = (token?: string) =>
  req('/tick', {
    method: 'POST',
    ...(token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } }),
  });

describe('the cron tick', () => {
  it('🔴 runs a tick and logs its ledger, with no message text', async () => {
    const { rt, logs } = ticking();
    await handleScheduled({ ENVIRONMENT: 'production' }, rt);
    expect(logs).toEqual([
      {
        event: 'scheduler.tick',
        ok: true,
        trigger: 'cron',
        environment: 'production',
        observedLedger: 65_143_700,
      },
    ]);
  });

  it('🔴 a failed tick is thrown, so the platform records the run as failed, and logged by code only', async () => {
    const { rt, logs } = runtime(() => Promise.reject(new TickError('RPC_UNREACHABLE')));
    await expect(handleScheduled({ ENVIRONMENT: 'production' }, rt)).rejects.toBeInstanceOf(
      TickError,
    );
    expect(logs).toEqual([
      {
        event: 'scheduler.tick_failed',
        trigger: 'cron',
        environment: 'production',
        code: 'RPC_UNREACHABLE',
      },
    ]);
  });

  it('🔴 a fault of ours is logged as INTERNAL and rethrown, never as an RPC problem', async () => {
    const { rt, logs } = runtime(() => Promise.reject(new ReferenceError('Buffer is not defined')));
    await expect(handleScheduled({}, rt)).rejects.toBeInstanceOf(ReferenceError);
    expect(logs[0]).toMatchObject({ event: 'scheduler.tick_failed', code: 'INTERNAL' });
    expect(JSON.stringify(logs)).not.toContain('Buffer');
  });

  it('says undetermined when no environment is configured', async () => {
    const { rt, logs } = ticking();
    await handleScheduled({}, rt);
    expect(logs[0]).toMatchObject({ environment: 'undetermined' });
  });
});

describe('GET /health', () => {
  it('reports the service, the environment and the deployed commit', async () => {
    const res = await handleFetch(
      req('/health'),
      { ENVIRONMENT: 'preview', DEPLOY_COMMIT: SHA },
      ticking().rt,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      service: 'evergreen-scheduler',
      environment: 'preview',
      commit: SHA,
    });
  });

  it('works with nothing configured, and never runs a tick', async () => {
    const t = ticking();
    const res = await handleFetch(req('/health'), {}, t.rt);
    expect(await res.json()).toMatchObject({ environment: 'undetermined', commit: 'undetermined' });
    expect(t.ticks()).toBe(0);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['a branch name', 'main'],
    ['an abbreviated SHA', '0123456'],
    ['an upper-case SHA', SHA.toUpperCase()],
    ['a SHA with a trailing newline', `${SHA}\n`],
    ['markup', '<script>alert(1)</script>'],
  ])('🔴 reads undetermined for %s rather than echoing it', (_, value) => {
    expect(deployedCommit(value === undefined ? {} : { DEPLOY_COMMIT: value })).toBe(
      'undetermined',
    );
  });

  it('refuses a POST', async () => {
    expect((await handleFetch(req('/health', { method: 'POST' }), {}, ticking().rt)).status).toBe(
      405,
    );
  });
});

describe('POST /tick, the manual trigger for the preview scheduler', () => {
  it('🔴 does not exist unless TICK_TOKEN is set', async () => {
    for (const env of [{}, { TICK_TOKEN: '' }] as Env[]) {
      const t = ticking();
      const res = await handleFetch(post(TOKEN), env, t.rt);
      expect(res.status).toBe(404);
      expect(t.ticks()).toBe(0);
    }
  });

  it.each([
    ['no Authorization header', undefined],
    ['the wrong token', 'not-the-token'],
    ['an empty token', ''],
    ['the token with a character added', `${TOKEN}x`],
    ['the token with a character missing', TOKEN.slice(1)],
  ])('🔴 %s is 401 with one answer, and no tick runs', async (_, token) => {
    const t = ticking();
    const res = await handleFetch(post(token), { TICK_TOKEN: TOKEN }, t.rt);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, code: 'UNAUTHORIZED' });
    expect(t.ticks()).toBe(0);
  });

  it('🔴 a scheme other than Bearer is refused', async () => {
    const t = ticking();
    const res = await handleFetch(
      req('/tick', { method: 'POST', headers: { authorization: `Basic ${TOKEN}` } }),
      { TICK_TOKEN: TOKEN },
      t.rt,
    );
    expect(res.status).toBe(401);
    expect(t.ticks()).toBe(0);
  });

  it('🔴 an unauthenticated GET learns nothing: 401, not 405', async () => {
    const res = await handleFetch(req('/tick'), { TICK_TOKEN: TOKEN }, ticking().rt);
    expect(res.status).toBe(401);
  });

  it('with the token, a GET is 405', async () => {
    const res = await handleFetch(
      req('/tick', { headers: { authorization: `Bearer ${TOKEN}` } }),
      { TICK_TOKEN: TOKEN },
      ticking().rt,
    );
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('🔴 with the token, runs one tick and answers with its ledger', async () => {
    const t = ticking();
    const res = await handleFetch(post(TOKEN), { TICK_TOKEN: TOKEN, ENVIRONMENT: 'preview' }, t.rt);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, observedLedger: 65_143_700 });
    expect(t.ticks()).toBe(1);
    expect(t.logs[0]).toMatchObject({ trigger: 'manual', ok: true });
  });

  it('🔴 a failed tick is 502 with its code and nothing else', async () => {
    const { rt } = runtime(() => Promise.reject(new TickError('DB_FAILED')));
    const res = await handleFetch(post(TOKEN), { TICK_TOKEN: TOKEN }, rt);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, code: 'DB_FAILED' });
  });

  it('🔴 a fault of ours is 500 INTERNAL, with none of its text', async () => {
    const { rt } = runtime(() => Promise.reject(new TypeError('secret detail postgres://u:p@h')));
    const res = await handleFetch(post(TOKEN), { TICK_TOKEN: TOKEN }, rt);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('{"ok":false,"code":"INTERNAL"}');
  });

  it('answers every response as JSON with no-store', async () => {
    const res = await handleFetch(post(TOKEN), { TICK_TOKEN: TOKEN }, ticking().rt);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('other paths', () => {
  it('are a JSON 404', async () => {
    const res = await handleFetch(req('/anything'), { TICK_TOKEN: TOKEN }, ticking().rt);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('tokenMatches', () => {
  it('accepts only the exact token', async () => {
    expect(await tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(await tokenMatches(`${TOKEN} `, TOKEN)).toBe(false);
    expect(await tokenMatches(TOKEN.toUpperCase(), TOKEN)).toBe(false);
  });

  it('🔴 refuses a missing presented token and an empty expected one', async () => {
    expect(await tokenMatches(null, TOKEN)).toBe(false);
    expect(await tokenMatches('', '')).toBe(false);
    expect(await tokenMatches('x', '')).toBe(false);
  });
});

describe('Stage 1 evaluation step', () => {
  const SUMMARY = { dryRun: true as const, payers: 1, items: 2, itemsWithoutBudget: 1 };
  const withEval = (
    evaluate: Runtime['evaluate'],
    tick = () => Promise.resolve({ observedLedger: 7 }),
  ) => {
    const logs: Record<string, unknown>[] = [];
    let evals = 0;
    const rt: Runtime = {
      runTick: tick,
      evaluate: evaluate && (() => (evals++, evaluate())),
      log: (entry) => logs.push({ ...entry }),
    };
    return { rt, logs, evals: () => evals };
  };

  it('runs after the heartbeat and logs counts only', async () => {
    const { rt, logs } = withEval(() => Promise.resolve(SUMMARY));
    await handleScheduled({ ENVIRONMENT: 'preview' }, rt);
    expect(logs.map((l) => l['event'])).toEqual(['scheduler.tick', 'scheduler.evaluate']);
    expect(logs[1]).toMatchObject(SUMMARY);
  });

  it('logs Stage 1b rpc timing next to the due counts', async () => {
    const full = {
      ...SUMMARY,
      due: { due: 1, notDue: 1, expired: 0, undetermined: 0 },
      rpc: { rpcMs: 120, rpcBatches: 2, rpcMaxMs: 80 },
    };
    const { rt, logs } = withEval(() => Promise.resolve(full));
    await handleScheduled({ ENVIRONMENT: 'preview' }, rt);
    expect(logs[1]).toMatchObject({ due: full.due, rpc: full.rpc, rpcSlow: [] });
  });

  it('marks a slow tick in the log only (F9, provisional)', async () => {
    const slow = { ...SUMMARY, rpc: { rpcMs: 4000, rpcBatches: 2, rpcMaxMs: 2500 } };
    const { rt, logs } = withEval(() => Promise.resolve(slow));
    await handleScheduled({ ENVIRONMENT: 'preview' }, rt);
    expect(logs[1]).toMatchObject({ rpcSlow: ['max', 'total'] });
  });

  it('does not run when the heartbeat failed', async () => {
    const { rt, evals } = withEval(
      () => Promise.resolve(SUMMARY),
      () => Promise.reject(new TickError('DB_FAILED')),
    );
    await expect(handleScheduled({}, rt)).rejects.toBeInstanceOf(TickError);
    expect(evals()).toBe(0);
  });

  it('an evaluation failure is logged by code and does not fail the tick', async () => {
    const { rt, logs } = withEval(() => Promise.reject(new EvaluationError('EVAL_DB_FAILED')));
    await expect(handleScheduled({}, rt)).resolves.toBeUndefined();
    expect(logs[1]).toEqual({
      event: 'scheduler.evaluate_failed',
      trigger: 'cron',
      environment: 'undetermined',
      code: 'EVAL_DB_FAILED',
    });
  });

  it('a fault of ours in evaluation is not hidden', async () => {
    const { rt } = withEval(() => Promise.reject(new TypeError('bug')));
    await expect(handleScheduled({}, rt)).rejects.toBeInstanceOf(TypeError);
  });
});
