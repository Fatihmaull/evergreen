/**
 * PH2-E2-04: the sign-in email request must not use `redirect: "error"`, which
 * Workers does not implement (it throws a TypeError when the Request is built,
 * before anything is sent: Workers docs, Request, read 2026-10-24). The mailer
 * uses `manual`, never follows a redirect, and treats any 3xx as a failed send.
 *
 * No network: `fetch` is injected. The dummy key below is not a key.
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
import { isRedirectResponse } from '../src/auth/mailer-error.js';

const ORIGIN = 'https://dashboard.example.test';
const START = 1_800_000_000;
const API_KEY = 're_test_not_a_key_0123456789abcdef';
const ADDRESS = 'someone@private.example';
const FROM = 'Evergreen <onboarding@resend.dev>';
const LOCATION = 'https://elsewhere.example/steal?token=LOCATION_VALUE_MARKER';

interface Call {
  url: string;
  init: RequestInit;
}

function recorder(answer: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetcher = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(answer());
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

const redirectResponse = (status: number) =>
  new Response('moved', { status, headers: { location: LOCATION, 'set-cookie': 'a=b' } });

async function failure(mailer: ResendMailer): Promise<MailerError> {
  const err = await mailer.sendSigninCode(ADDRESS, '12345678').catch((e: unknown) => e);
  expect(err).toBeInstanceOf(MailerError);
  return err as MailerError;
}

describe('the fetch init is `redirect: "manual"`, never "error"', () => {
  it('records manual on a send', async () => {
    const { calls, fetcher } = recorder(() => new Response('{"id":"x"}', { status: 200 }));
    await new ResendMailer(API_KEY, FROM, fetcher).sendSigninCode(ADDRESS, '12345678');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(calls[0]!.init.redirect).toBe('manual');
    expect(calls[0]!.init.redirect).not.toBe('error');
  });

  it('regression: no send, success or failure, ever carries redirect "error"', async () => {
    const answers = [200, 301, 302, 307, 308, 403, 429, 500].map(
      (status) => () => new Response('{}', { status, headers: { location: LOCATION } }),
    );
    for (const answer of answers) {
      const { calls, fetcher } = recorder(answer);
      await new ResendMailer(API_KEY, FROM, fetcher)
        .sendSigninCode(ADDRESS, '12345678')
        .catch(() => undefined);
      expect(calls).toHaveLength(1);
      for (const call of calls) {
        expect(call.init.redirect).toBe('manual');
        expect(call.init.redirect).not.toBe('error');
      }
    }
  });

  it('the real Request constructor (Node 24) accepts the init as it is', () => {
    const { calls, fetcher } = recorder(() => new Response('{}', { status: 200 }));
    return new ResendMailer(API_KEY, FROM, fetcher).sendSigninCode(ADDRESS, '12345678').then(() => {
      expect(() => new Request(calls[0]!.url, calls[0]!.init)).not.toThrow();
    });
  });

  it('the Authorization header is only on the one request to api.resend.com', async () => {
    const { calls, fetcher } = recorder(() => redirectResponse(307));
    await failure(new ResendMailer(API_KEY, FROM, fetcher));
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).host).toBe('api.resend.com');
  });
});

describe('a redirect answer is a failed send', () => {
  it.each([301, 302, 303, 307, 308])(
    '%s: unavailable / unexpected_redirect, not followed',
    async (status) => {
      const { calls, fetcher } = recorder(() => redirectResponse(status));
      const e = await failure(new ResendMailer(API_KEY, FROM, fetcher));
      expect(e).toMatchObject({
        kind: 'unavailable',
        reason: 'unexpected_redirect',
        httpStatus: status,
        senderDomain: 'resend.dev',
        recipientDomain: 'private.example',
      });
      expect(calls).toHaveLength(1); // never followed, never retried
    },
  );

  it('an opaque redirect (type opaqueredirect, status 0) is the same failure, without a status', async () => {
    const opaque = {
      status: 0,
      type: 'opaqueredirect',
      ok: false,
      body: null,
      headers: new Headers(),
    };
    expect(isRedirectResponse(opaque)).toBe(true);
    const { calls, fetcher } = recorder(() => opaque as unknown as Response);
    const e = await failure(new ResendMailer(API_KEY, FROM, fetcher));
    expect(e).toMatchObject({ kind: 'unavailable', reason: 'unexpected_redirect' });
    expect(e.httpStatus).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('a body that cannot be cancelled does not change the answer', async () => {
    const stubborn = {
      status: 302,
      type: 'basic',
      ok: false,
      headers: new Headers({ location: LOCATION }),
      body: {
        cancel: () => Promise.reject(new Error('cannot cancel')),
        getReader: () => {
          throw new Error('the body must not be read');
        },
      },
    };
    const { fetcher } = recorder(() => stubborn as unknown as Response);
    const e = await failure(new ResendMailer(API_KEY, FROM, fetcher));
    expect(e.reason).toBe('unexpected_redirect');
  });

  it('is not read as a redirect: 2xx, 4xx, 5xx, 299, 400', () => {
    for (const status of [200, 202, 299, 400, 403, 429, 500]) {
      expect(isRedirectResponse({ status, type: 'basic' })).toBe(false);
    }
    for (const status of [300, 301, 399]) {
      expect(isRedirectResponse({ status, type: 'basic' })).toBe(true);
    }
  });

  it('a 2xx still succeeds', async () => {
    const { fetcher } = recorder(() => new Response('{"id":"x"}', { status: 200 }));
    await expect(
      new ResendMailer(API_KEY, FROM, fetcher).sendSigninCode(ADDRESS, '12345678'),
    ).resolves.toBeUndefined();
  });

  it('carries nothing of the key, the address, the Location value or the code', async () => {
    const { fetcher } = recorder(() => redirectResponse(302));
    const e = await failure(new ResendMailer(API_KEY, FROM, fetcher));
    const text =
      e.message +
      JSON.stringify(e) +
      JSON.stringify(emailSendFailedLog(e, { environment: 'preview', rayId: null }));
    for (const secret of [
      API_KEY,
      're_test',
      ADDRESS,
      'someone',
      'LOCATION_VALUE_MARKER',
      'elsewhere',
      '12345678',
      'steal',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('the log line has the new reason and kind unavailable, and no stage or key fields', async () => {
    const { fetcher } = recorder(() => redirectResponse(308));
    const e = await failure(new ResendMailer(API_KEY, FROM, fetcher));
    expect(emailSendFailedLog(e, { environment: 'preview', rayId: null })).toEqual({
      event: 'auth.email_send_failed',
      provider: 'resend',
      kind: 'unavailable',
      reason: 'unexpected_redirect',
      httpStatus: 308,
      senderDomain: 'resend.dev',
      recipientDomain: 'private.example',
      environment: 'preview',
    });
  });
});

describe('through the Worker router', () => {
  let clock: number;
  let store: MemoryAuthStore;
  let calls: Call[];
  let logs: AuthLogEntry[];
  let env: Env;
  let options: MountOptions;
  let answer: () => Response;

  beforeEach(() => {
    vi.stubGlobal('fetch', () => {
      throw new Error('network is off in tests');
    });
    clock = START;
    store = new MemoryAuthStore(() => clock);
    calls = [];
    logs = [];
    answer = () => new Response('{"id":"x"}', { status: 200 });
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
      fetch: ((url: string, init: RequestInit) => {
        calls.push({ url, init });
        return Promise.resolve(answer());
      }) as unknown as typeof fetch,
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const start = (email: string) =>
    handle(
      new Request(`${ORIGIN}${API_BASE}/auth/email/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ email }),
      }),
      env,
      options,
    );

  const snapshot = async (res: Response) => ({
    status: res.status,
    headers: [...res.headers.entries()].sort(),
    body: await res.text(),
  });

  it.each([301, 302, 307, 308])(
    'a %s from the provider answers the plain 503, logged once, no leak',
    async (status) => {
      answer = () => redirectResponse(status);
      const res = await start(ADDRESS);
      const snap = await snapshot(res);
      expect(snap.status).toBe(503);
      expect(JSON.parse(snap.body)).toEqual({
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'Sign-in is not available right now.',
          retryable: true,
          details: {},
        },
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.init.redirect).toBe('manual');
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: 'auth.email_send_failed',
        kind: 'unavailable',
        reason: 'unexpected_redirect',
        httpStatus: status,
      });
      const everything = JSON.stringify(snap) + JSON.stringify(logs);
      for (const secret of [API_KEY, ADDRESS, 'LOCATION_VALUE_MARKER', 'elsewhere']) {
        expect(everything).not.toContain(secret);
      }
    },
  );

  it('a registered and an unregistered address get byte-identical answers to a redirect', async () => {
    expect((await start('known@x.test')).status).toBe(202);
    const code = /\b(\d{8})\b/.exec(
      (JSON.parse(String(calls.at(-1)!.init.body)) as { text: string }).text,
    )![1]!;
    const verify = await handle(
      new Request(`${ORIGIN}${API_BASE}/auth/email/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ email: 'known@x.test', code }),
      }),
      env,
      options,
    );
    expect(verify.status).toBe(200);
    answer = () => redirectResponse(302);
    const known = await snapshot(await start('known@x.test'));
    const unknown = await snapshot(await start('unknown@x.test'));
    expect(known.status).toBe(503);
    expect(unknown).toEqual(known);
  });
});
