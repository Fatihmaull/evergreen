import { describe, expect, it } from 'vitest';
import { INSERT_TICK_SQL, TickError, runTick, type FetchLike, type TickDeps } from '../src/tick.js';

const TESTNET = 'Test SDF Network ; September 2015';
const MAINNET = 'Public Global Stellar Network ; September 2015';
const SECRET_URL = 'https://rpc.example.invalid/key/SUPERSECRETKEY';

const ok = (result: unknown): Response =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });

/** An RPC stub answering getNetwork and getLatestLedger, recording every call's method. */
function rpcStub(over: { passphrase?: string; sequence?: unknown } = {}) {
  const methods: string[] = [];
  const fetch: FetchLike = (_url, init) => {
    const { method } = JSON.parse(String(init.body)) as { method: string };
    methods.push(method);
    return Promise.resolve(
      method === 'getNetwork'
        ? ok({ passphrase: over.passphrase ?? TESTNET, protocolVersion: 29 })
        : ok({
            id: 'x',
            protocolVersion: 29,
            sequence: 'sequence' in over ? over.sequence : 65_143_700,
          }),
    );
  };
  return { fetch, methods };
}

function deps(over: Partial<TickDeps> = {}) {
  const queries: { text: string; params: readonly unknown[] }[] = [];
  const stub = rpcStub();
  const base: TickDeps = {
    rpcUrl: SECRET_URL,
    expectedPassphrase: TESTNET,
    fetch: stub.fetch,
    query: (text, params) => {
      queries.push({ text, params });
      return Promise.resolve();
    },
  };
  return { deps: { ...base, ...over }, queries, methods: stub.methods };
}

const codeOf = async (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => 'resolved',
    (e: unknown) => (e instanceof TickError ? e.code : e),
  );

describe('one tick', () => {
  it('🔴 reads the network, then the latest ledger, then records that ledger', async () => {
    const { deps: d, queries, methods } = deps();
    expect(await runTick(d)).toEqual({ observedLedger: 65_143_700 });
    expect(methods).toEqual(['getNetwork', 'getLatestLedger']);
    expect(queries).toEqual([{ text: INSERT_TICK_SQL, params: [65_143_700] }]);
  });

  it('🔴 writes with no RETURNING: the scheduler role has INSERT but no SELECT', () => {
    expect(INSERT_TICK_SQL).toBe('INSERT INTO scheduler_ticks (observed_ledger) VALUES ($1)');
    expect(INSERT_TICK_SQL).not.toMatch(/returning/i);
  });

  it('🔴 refuses an RPC serving another network, before reading a ledger or writing', async () => {
    const stub = rpcStub({ passphrase: MAINNET });
    const { deps: d, queries } = deps({ fetch: stub.fetch });
    expect(await codeOf(runTick(d))).toBe('NETWORK_MISMATCH');
    expect(stub.methods).toEqual(['getNetwork']);
    expect(queries).toEqual([]);
  });

  it('🔴 calls fetch as a plain function, never as a method of deps (Workers: Illegal invocation, #439)', async () => {
    // Record whether `this` was undefined, rather than keeping `this`: the lint rule against
    // aliasing it is right in general, and a boolean is all this test needs.
    let calledPlainly: boolean | 'not called' = 'not called';
    const stub = rpcStub();
    const holder = {
      fetch: function (this: unknown, url: string, init: RequestInit) {
        calledPlainly = this === undefined;
        return stub.fetch(url, init);
      },
    };
    await runTick(deps({ fetch: holder.fetch }).deps);
    expect(calledPlainly).toBe(true);
  });
});

describe('RPC failures', () => {
  it.each([
    [
      'a network failure (a TypeError, as Workers throws it)',
      () => Promise.reject(new TypeError('Network connection lost')),
    ],
    ['a body that is not JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ['a server error', () => Promise.resolve(new Response('{}', { status: 503 }))],
    [
      'a redirect',
      () =>
        Promise.resolve(
          new Response(null, { status: 302, headers: { location: 'https://elsewhere.invalid/' } }),
        ),
    ],
  ])('🔴 %s is RPC_UNREACHABLE, not a fault of ours', async (_, respond) => {
    const { deps: d, queries } = deps({ fetch: respond });
    expect(await codeOf(runTick(d))).toBe('RPC_UNREACHABLE');
    expect(queries).toEqual([]);
  });

  it('🔴 a hung call is cancelled at the timeout and reported, not left to hold the tick', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const started = Date.now();
    expect(await codeOf(runTick(deps({ fetch: hang, timeoutMs: 30 }).deps))).toBe(
      'RPC_UNREACHABLE',
    );
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('passes an abort signal to every call', async () => {
    const signals: unknown[] = [];
    const stub = rpcStub();
    await runTick(
      deps({
        fetch: (url, init) => {
          signals.push(init.signal);
          return stub.fetch(url, init);
        },
      }).deps,
    );
    expect(signals).toHaveLength(2);
    for (const s of signals) expect(s).toBeInstanceOf(AbortSignal);
  });

  it('never follows a redirect', async () => {
    let redirect: unknown;
    const stub = rpcStub();
    await runTick(
      deps({
        fetch: (url, init) => {
          redirect = init.redirect;
          return stub.fetch(url, init);
        },
      }).deps,
    );
    expect(redirect).toBe('manual');
  });

  it.each([
    [
      'a JSON-RPC error',
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'x' } }),
            { status: 200 },
          ),
        ),
    ],
    [
      'both an error and a result (JSON-RPC allows exactly one)',
      () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              error: { code: -1, message: 'x' },
              result: { sequence: 5 },
            }),
            { status: 200 },
          ),
        ),
    ],
    ['no result', () => Promise.resolve(new Response('{"jsonrpc":"2.0","id":1}', { status: 200 }))],
    [
      'a result that is not an object',
      () => Promise.resolve(new Response('{"result":"ok"}', { status: 200 })),
    ],
    ['a body that is not an object', () => Promise.resolve(new Response('[]', { status: 200 }))],
    ['null', () => Promise.resolve(new Response('null', { status: 200 }))],
  ])('🔴 %s is RPC_BAD_RESPONSE', async (_, respond) => {
    expect(await codeOf(runTick(deps({ fetch: respond }).deps))).toBe('RPC_BAD_RESPONSE');
  });

  it.each([
    ['missing', undefined],
    ['a string', '65143700'],
    ['zero', 0],
    ['negative', -5],
    ['fractional', 1.5],
    ['beyond a safe integer', 2 ** 60],
    ['null', null],
  ])('🔴 a ledger that is %s is RPC_BAD_RESPONSE, and nothing is written', async (_, sequence) => {
    const stub = rpcStub({ sequence });
    const { deps: d, queries } = deps({ fetch: stub.fetch });
    expect(await codeOf(runTick(d))).toBe('RPC_BAD_RESPONSE');
    expect(queries).toEqual([]);
  });
});

describe('database failure', () => {
  it('🔴 is DB_FAILED, and the error carries nothing from the driver', async () => {
    const failing = deps({
      query: () =>
        Promise.reject(
          new Error('connection to postgres://user:HUNTER2@db.example.invalid failed'),
        ),
    }).deps;
    const error = await runTick(failing).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TickError);
    expect((error as TickError).code).toBe('DB_FAILED');
    const text = `${String(error)} ${(error as Error).message} ${JSON.stringify(error)}`;
    expect(text).not.toContain('HUNTER2');
    expect(text).not.toContain('db.example.invalid');
  });

  it('🔴 no TickError ever carries the RPC URL or its key', async () => {
    const error = await runTick(
      deps({ fetch: () => Promise.reject(new Error(`failed: ${SECRET_URL}`)) }).deps,
    ).catch((e: unknown) => e);
    const text = `${String(error)} ${(error as Error).message} ${JSON.stringify(error)}`;
    expect(text).not.toContain('SUPERSECRETKEY');
    expect(text).not.toContain('rpc.example.invalid');
  });
});
