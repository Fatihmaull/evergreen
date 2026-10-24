/**
 * PH2-E2-04: where a failed email send failed, without logging any value.
 * `ResendMailer` builds the request first (`fetchStage: 'build'`, reason
 * `request_invalid`) and only then calls `fetch` (`fetchStage: 'send'`, reason
 * `network_error`), and the log line carries bucketed facts about the key.
 *
 * Never touches the network: `fetch` is injected, and the global one throws.
 * The "real" build step is Node 24's own `Request` (undici). What the Workers
 * runtime does is NOT exercised here; `WORKERS_LIKE` below is a stand-in that
 * copies one documented workerd rule, and is labelled as a simulation.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE,
  MailerError,
  MemoryAuthStore,
  ResendMailer,
  emailSendFailedLog,
  handle,
  type AuthLogEntry,
  type Env,
  type MountOptions,
} from '../src/index.js';
import { describeKey, roundElapsedMs } from '../src/auth/mailer-error.js';

const ORIGIN = 'https://dashboard.example.test';
const START = 1_800_000_000;
const API_KEY = 're_test_not_a_key_0123456789abcdef';
const ADDRESS = 'someone@private.example';
const FROM = 'Evergreen <onboarding@resend.dev>';

const okFetch = (() =>
  Promise.resolve(new Response('{"id":"x"}', { status: 200 }))) as unknown as typeof fetch;
const throwingFetch = ((): never => {
  throw new TypeError(`connect failed https://api.resend.com/emails Bearer ${API_KEY} ${ADDRESS}`);
}) as unknown as typeof fetch;

/** Simulation only: workerd rejects `redirect: "error"` when a Request is constructed (workers docs, workerd http.c++, read 2026-10-24). */
const WORKERS_LIKE = (_url: string, init: RequestInit): unknown => {
  if (init.redirect === 'error') {
    throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
  }
  return new Request(_url, init);
};

async function failure(mailer: ResendMailer): Promise<MailerError> {
  const err = await mailer.sendSigninCode(ADDRESS, '12345678').catch((e: unknown) => e);
  expect(err).toBeInstanceOf(MailerError);
  return err as MailerError;
}

const log = (error: MailerError) =>
  emailSendFailedLog(error, { environment: 'preview', rayId: null });

describe('describeKey: facts, never the key', () => {
  it.each([
    ['clean', 're_abc_DEF-123', '1-31', false, false],
    ['31 chars', 'a'.repeat(31), '1-31', false, false],
    ['32 chars', 'a'.repeat(32), '32-63', false, false],
    ['63 chars', 'a'.repeat(63), '32-63', false, false],
    ['64 chars', 'a'.repeat(64), '64-127', false, false],
    ['127 chars', 'a'.repeat(127), '64-127', false, false],
    ['128 chars', 'a'.repeat(128), '128+', false, false],
    ['empty', '', '0', false, false],
    ['only whitespace (trims to empty)', ' \n\t ', '0', false, false],
    ['trailing newline is trimmed, not a fact', 're_abc\n', '1-31', false, false],
    ['inner space', 're_ab cd', '1-31', true, true],
    ['inner tab', 're_ab\tcd', '1-31', true, true],
    ['inner newline', 're_ab\ncd', '1-31', true, true],
    ['inner NUL', 're_ab\0cd', '1-31', true, false],
    ['inner BEL', 're_ab\x07cd', '1-31', true, false],
    ['DEL', 're_ab\x7fcd', '1-31', true, false],
    ['non-ASCII (an ellipsis)', 're_ab\u2026cd', '1-31', true, false],
    ['a lone surrogate', 're_ab\ud800cd', '1-31', true, false],
  ] as const)('%s', (_label, key, bucket, nonPrintable, innerWs) => {
    expect(describeKey(key)).toEqual({
      keyLength: bucket,
      keyHasNonPrintableAscii: nonPrintable,
      keyHasInnerWhitespace: innerWs,
    });
  });

  it('carries nothing of the key', () => {
    const text = JSON.stringify(describeKey(API_KEY));
    expect(text).not.toContain('re_test');
    expect(Object.keys(describeKey(API_KEY)).sort()).toEqual([
      'keyHasInnerWhitespace',
      'keyHasNonPrintableAscii',
      'keyLength',
    ]);
  });
});

describe('roundElapsedMs', () => {
  it.each([
    [0, 0],
    [49, 0],
    [50, 100],
    [149, 100],
    [150, 200],
    [4_321, 4_300],
    [-5, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])('%s -> %s', (input, expected) => {
    expect(roundElapsedMs(input)).toBe(expected);
  });
});

describe('ResendMailer stages', () => {
  it('a clean key and a fetch that throws: stage send, network_error, with facts and elapsed', async () => {
    let t = 1_000;
    const mailer = new ResendMailer(API_KEY, FROM, throwingFetch, {
      clock: () => {
        const now = t;
        t += 1_234;
        return now;
      },
    });
    const e = await failure(mailer);
    expect(e).toMatchObject({
      kind: 'network',
      reason: 'network_error',
      fetchStage: 'send',
      fetchErrorName: 'TypeError',
      elapsedMs: 1_200,
      keyLength: '32-63',
      keyHasNonPrintableAscii: false,
      keyHasInnerWhitespace: false,
    });
    expect(e.httpStatus).toBeUndefined();
  });

  it('a fast failure and a timeout are told apart by elapsedMs', async () => {
    const run = (ms: number) => {
      const reads = [0, ms];
      return failure(
        new ResendMailer(API_KEY, FROM, throwingFetch, { clock: () => reads.shift() ?? ms }),
      );
    };
    expect((await run(20)).elapsedMs).toBe(0);
    expect((await run(30_000)).elapsedMs).toBe(30_000);
  });

  it('the fetch is never reached when the build stage throws, and the clock is not read', async () => {
    const fetcher = vi.fn(okFetch);
    const clock = vi.fn(() => 0);
    const e = await failure(
      new ResendMailer(`${API_KEY}\u2026`, FROM, fetcher as unknown as typeof fetch, { clock }),
    );
    expect(e).toMatchObject({ reason: 'request_invalid', fetchStage: 'build' });
    expect(e.elapsedMs).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
  });

  // The default build step is Node 24's `Request`. These are the values undici
  // really rejects in a header value (checked on node v24.22.1).
  it.each([
    ['an inner newline', `re_ab\ncd`, true, true],
    ['an inner carriage return', `re_ab\rcd`, true, true],
    ['an inner NUL', `re_ab\0cd`, true, false],
    ['a non-Latin-1 character', `re_ab\u2026cd`, true, false],
    ['a lone surrogate', `re_ab\ud800cd`, true, false],
  ])('a key with %s: stage build, request_invalid, no fetch', async (_l, key, nonPrintable, ws) => {
    const fetcher = vi.fn(okFetch);
    const e = await failure(new ResendMailer(key, FROM, fetcher as unknown as typeof fetch));
    expect(e).toMatchObject({
      kind: 'network',
      reason: 'request_invalid',
      fetchStage: 'build',
      fetchErrorName: 'TypeError',
      keyHasNonPrintableAscii: nonPrintable,
      keyHasInnerWhitespace: ws,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('what Node 24 does NOT reject: an inner space or tab or BEL is a legal header value, so it reaches fetch', async () => {
    for (const key of ['re_ab cd', 're_ab\tcd', 're_ab\x07cd']) {
      const fetcher = vi.fn(okFetch);
      await new ResendMailer(key, FROM, fetcher as unknown as typeof fetch).sendSigninCode(
        ADDRESS,
        '1',
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('a fetcher that rejects only inside the call is stage send, not build', async () => {
    const strictInsideFetch = ((_url: string, init: RequestInit) => {
      const value = (init.headers as Record<string, string>)['authorization'] ?? '';
      if (/[\r\n]/.test(value)) return Promise.reject(new TypeError(`bad header ${value}`));
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown as typeof fetch;
    // A key the Request constructor accepts but this fetcher refuses cannot exist for
    // newlines, so use a build step that accepts everything.
    const accept = () => undefined;
    const e = await failure(
      new ResendMailer('re_ab\ncd', FROM, strictInsideFetch, { buildRequest: accept }),
    );
    expect(e).toMatchObject({ reason: 'network_error', fetchStage: 'send' });
  });

  it('SIMULATION of workerd: the mailer\'s own init passes the build step (redirect is "manual", not "error")', async () => {
    const fetcher = vi.fn(okFetch);
    await expect(
      new ResendMailer(API_KEY, FROM, fetcher as unknown as typeof fetch, {
        buildRequest: WORKERS_LIKE,
      }).sendSigninCode(ADDRESS, '12345678'),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('SIMULATION of workerd: a build step that rejects an init still reads as stage build', async () => {
    const fetcher = vi.fn(okFetch);
    const e = await failure(
      new ResendMailer(API_KEY, FROM, fetcher as unknown as typeof fetch, {
        buildRequest: () => {
          throw new TypeError('Unsupported cache mode: reload');
        },
      }),
    );
    expect(e).toMatchObject({
      reason: 'request_invalid',
      fetchStage: 'build',
      fetchErrorName: 'TypeError',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('a clock that throws costs the elapsed field, not the answer', async () => {
    let calls = 0;
    const e = await failure(
      new ResendMailer(API_KEY, FROM, throwingFetch, {
        clock: () => {
          calls += 1;
          if (calls > 1) throw new Error('clock broke');
          return 0;
        },
      }),
    );
    expect(e).toMatchObject({ reason: 'network_error', fetchStage: 'send' });
    expect(e.elapsedMs).toBeUndefined();
  });

  it('a success and a provider refusal carry no stage, elapsed or key fields', async () => {
    const refusing = (() =>
      Promise.resolve(
        new Response('{"name":"validation_error","message":"API key is invalid"}', { status: 401 }),
      )) as unknown as typeof fetch;
    const e = await failure(new ResendMailer(API_KEY, FROM, refusing));
    expect(e.reason).toBe('api_key_rejected');
    for (const field of ['fetchStage', 'elapsedMs', 'keyLength', 'keyHasInnerWhitespace']) {
      expect((e as unknown as Record<string, unknown>)[field]).toBeUndefined();
    }
    await expect(
      new ResendMailer(API_KEY, FROM, okFetch).sendSigninCode(ADDRESS, '1'),
    ).resolves.toBeUndefined();
  });
});

describe('the log line', () => {
  it('lists the allowlisted fields and nothing else, in a stable shape', async () => {
    let t = 0;
    const e = await failure(
      new ResendMailer(API_KEY, FROM, throwingFetch, { clock: () => (t += 700) }),
    );
    expect(log(e)).toEqual({
      event: 'auth.email_send_failed',
      provider: 'resend',
      kind: 'network',
      reason: 'network_error',
      fetchErrorName: 'TypeError',
      fetchStage: 'send',
      elapsedMs: 700,
      keyLength: '32-63',
      keyHasNonPrintableAscii: false,
      keyHasInnerWhitespace: false,
      senderDomain: 'resend.dev',
      recipientDomain: 'private.example',
      environment: 'preview',
    });
  });

  it.each([
    ['build', `re_ab\ncd${API_KEY}`],
    ['send', API_KEY],
  ])(
    'stage %s: never contains the key, the address, the thrown text or the URL',
    async (_stage, key) => {
      const e = await failure(new ResendMailer(key, FROM, throwingFetch));
      const line = JSON.stringify(log(e));
      for (const secret of [
        key,
        key.trim(),
        're_test',
        ADDRESS,
        'someone',
        'connect failed',
        'api.resend.com',
        'Bearer',
        'stack',
        '12345678',
      ]) {
        expect(line).not.toContain(secret);
      }
      expect(e.message).toBe('The email provider did not send the sign-in code.');
      expect(JSON.stringify(e) + (e.stack ?? '')).not.toMatch(/re_test|someone@|Bearer/);
    },
  );

  it('drops a stage, bucket, boolean or elapsed value that is not in its closed set', () => {
    const e = new MailerError({
      kind: 'network',
      reason: 'network_error',
      senderDomain: 'a.test',
      recipientDomain: 'b.test',
      fetchStage: 'somewhere else' as never,
      keyLength: '33' as never,
      keyHasNonPrintableAscii: 'yes' as never,
      keyHasInnerWhitespace: 1 as never,
      elapsedMs: 1_234,
    });
    const out = log(e);
    for (const field of [
      'fetchStage',
      'keyLength',
      'keyHasNonPrintableAscii',
      'keyHasInnerWhitespace',
      'elapsedMs',
    ]) {
      expect(out).not.toHaveProperty(field);
    }
  });
});

// ── Through the Worker router ──────────────────────────────────────────────

let clock: number;
let store: MemoryAuthStore;
let logs: AuthLogEntry[];
let env: Env;
let options: MountOptions;
let outbound: number;
let fetchImpl: () => Response | Promise<Response>;

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is off in tests');
  });
  clock = START;
  store = new MemoryAuthStore(() => clock);
  logs = [];
  outbound = 0;
  fetchImpl = () => new Response('{"id":"x"}', { status: 200 });
  env = {
    ENVIRONMENT: 'preview',
    DATABASE_URL: 'postgres://user:pw@db.invalid/evergreen',
    SIGNIN_CODE_PEPPER: 'test-pepper-not-a-secret',
    EMAIL_API_KEY: API_KEY,
    CHALLENGE_SIGNING_KEY: Keypair.random().secret(),
    EMAIL_FROM: 'onboarding@resend.dev',
    DASHBOARD_ORIGIN: ORIGIN,
  };
  options = {
    createStore: () => store,
    now: () => clock,
    log: (entry) => logs.push(entry),
    fetch: (() => {
      outbound += 1;
      return Promise.resolve(fetchImpl());
    }) as unknown as typeof fetch,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function start(email: string): Promise<Response> {
  return handle(
    new Request(`${ORIGIN}${API_BASE}/auth/email/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email }),
    }),
    env,
    options,
  );
}

async function snapshot(res: Response) {
  return { status: res.status, headers: [...res.headers.entries()].sort(), body: await res.text() };
}

describe('POST /auth/email/start: the answer does not change with the stage', () => {
  it('a build-stage failure is 503 UPSTREAM_UNAVAILABLE, the same bytes as a send-stage one', async () => {
    env.EMAIL_API_KEY = `${API_KEY}\u2026inner`; // trimmed at the ends only; Request refuses it
    const build = await snapshot(await start('a@x.test'));
    expect(logs[0]).toMatchObject({ reason: 'request_invalid', fetchStage: 'build' });
    expect(outbound).toBe(0);

    env.EMAIL_API_KEY = API_KEY;
    fetchImpl = () => {
      throw new TypeError('connection refused');
    };
    logs.length = 0;
    const send = await snapshot(await start('a@x.test'));
    expect(logs[0]).toMatchObject({ reason: 'network_error', fetchStage: 'send' });
    expect(outbound).toBe(1);

    expect(build.status).toBe(503);
    expect(JSON.parse(build.body)).toEqual({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Sign-in is not available right now.',
        retryable: true,
        details: {},
      },
    });
    expect(send).toEqual(build);
  });

  it('a registered and an unregistered address get byte-identical answers at both stages', async () => {
    let lastCode = '';
    fetchImpl = () => {
      return new Response('{"id":"x"}', { status: 200 });
    };
    options = {
      ...options,
      fetch: ((_url: string, init: RequestInit) => {
        outbound += 1;
        const mail = JSON.parse(String(init.body)) as { text: string };
        lastCode = /\b(\d{8})\b/.exec(mail.text)![1]!;
        return Promise.resolve(fetchImpl());
      }) as unknown as typeof fetch,
    };
    expect((await start('known@x.test')).status).toBe(202);
    const verify = await handle(
      new Request(`${ORIGIN}${API_BASE}/auth/email/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ email: 'known@x.test', code: lastCode }),
      }),
      env,
      options,
    );
    expect(verify.status).toBe(200);
    expect(store.users.size).toBe(1);

    for (const stage of ['build', 'send'] as const) {
      if (stage === 'build') env.EMAIL_API_KEY = `${API_KEY}\u2026inner`;
      else {
        env.EMAIL_API_KEY = API_KEY;
        fetchImpl = () => {
          throw new TypeError('x');
        };
      }
      clock += 3_600;
      logs.length = 0;
      const known = await snapshot(await start('known@x.test'));
      const unknown = await snapshot(await start('unknown@x.test'));
      expect(logs.map((l) => (l as { fetchStage?: string }).fetchStage)).toEqual([stage, stage]);
      expect(known.status).toBe(503);
      expect(unknown).toEqual(known);
    }
  });

  it('the router log line for a build failure has the facts and no value', async () => {
    env.EMAIL_API_KEY = `re_secret\nvalue_${API_KEY}`;
    await start('someone@private.example');
    expect(logs).toEqual([
      {
        event: 'auth.email_send_failed',
        provider: 'resend',
        kind: 'network',
        reason: 'request_invalid',
        fetchErrorName: 'TypeError',
        fetchStage: 'build',
        keyLength: '32-63',
        keyHasNonPrintableAscii: true,
        keyHasInnerWhitespace: true,
        senderDomain: 'resend.dev',
        recipientDomain: 'private.example',
        environment: 'preview',
      },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/re_secret|re_test|someone|Bearer/);
  });
});
