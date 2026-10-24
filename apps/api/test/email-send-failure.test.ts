/**
 * PH2-E2-04: what a failed sign-in email send looks like (docs/API.md §4, §9).
 * A provider refusal answers `502 EMAIL_NOT_SENT`; 429, 5xx and no answer stay
 * `503 UPSTREAM_UNAVAILABLE`. The cause goes to one log line, never the wire.
 * Never touches the network: `fetch` is injected, and the global one throws.
 *
 * The fixtures are Resend's documented error responses
 * (https://resend.com/docs/api-reference/errors, read 2026-10-24). The sandbox
 * message really does embed the account owner's address, so these tests plant
 * one and prove it never leaves the mailer.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE,
  MAX_ERROR_BODY_BYTES,
  MailerError,
  MemoryAuthStore,
  ResendMailer,
  classifyResendFailure,
  domainOf,
  handle,
  readBoundedText,
  safeFetchErrorName,
  type AuthLogEntry,
  type Env,
  type MailerFailure,
  type MountOptions,
} from '../src/index.js';

const ORIGIN = 'https://dashboard.example.test';
const START = 1_800_000_000;
const API_KEY = 're_test_not_a_key';
const OWNER = 'resend-owner@owner.example';
const SANDBOX_MESSAGE = `You can only send testing emails to your own email address (${OWNER}). To send emails to other recipients, please verify a domain at resend.com/domains, and change the \`from\` address to an email using this domain.`;
const DOMAINS = { senderDomain: 'resend.dev', recipientDomain: 'x.test' };

const body = (status: number, name: string, message: string) => ({
  status,
  text: JSON.stringify({ statusCode: status, name, message }),
});

/** Resend's documented refusals. `reason` is our token for it. */
const SANDBOX = body(403, 'validation_error', SANDBOX_MESSAGE);
const DOCUMENTED = [
  [
    'sandbox recipient, 403',
    SANDBOX,
    'rejected',
    'testing_recipient_restricted',
    'validation_error',
  ],
  [
    'sandbox recipient, 422 (once reported)',
    body(422, 'validation_error', SANDBOX_MESSAGE),
    'rejected',
    'testing_recipient_restricted',
    'validation_error',
  ],
  [
    'domain not verified',
    body(
      403,
      'validation_error',
      'The `domain.com` domain is not verified. Please, add and verify your domain.',
    ),
    'rejected',
    'sender_domain_not_verified',
    'validation_error',
  ],
  [
    'API key invalid, 401',
    body(401, 'validation_error', 'API key is invalid'),
    'rejected',
    'api_key_rejected',
    'validation_error',
  ],
  [
    'missing API key',
    body(401, 'missing_api_key', 'Missing API Key'),
    'rejected',
    'api_key_rejected',
    'missing_api_key',
  ],
  [
    'restricted API key',
    body(403, 'restricted_api_key', 'API key is not active'),
    'rejected',
    'api_key_rejected',
    'restricted_api_key',
  ],
  [
    'suspended API key',
    body(403, 'suspended_api_key', 'This API key is suspended'),
    'rejected',
    'api_key_rejected',
    'suspended_api_key',
  ],
  [
    'invalid to field',
    body(
      422,
      'validation_error',
      'Invalid `to` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.',
    ),
    'rejected',
    'recipient_invalid',
    'validation_error',
  ],
  [
    'invalid from field',
    body(
      422,
      'validation_error',
      'Invalid `from` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.',
    ),
    'rejected',
    'sender_invalid',
    'validation_error',
  ],
  [
    'another 400 validation error',
    body(400, 'validation_error', 'An error was found with one or more fields in the request.'),
    'rejected',
    'unclassified',
    'validation_error',
  ],
  [
    'rate limit, 429',
    body(429, 'rate_limit_exceeded', 'Too many requests.'),
    'unavailable',
    'quota_or_rate_limited',
    'rate_limit_exceeded',
  ],
  [
    'daily quota, 429',
    body(429, 'daily_quota_exceeded', 'You have exceeded your daily email sending quota.'),
    'unavailable',
    'quota_or_rate_limited',
    'daily_quota_exceeded',
  ],
  [
    'application error, 500',
    body(500, 'application_error', 'An unexpected error occurred.'),
    'unavailable',
    'provider_5xx',
    'application_error',
  ],
  [
    'service unavailable, 503',
    body(503, 'service_unavailable', 'API is temporarily unavailable'),
    'unavailable',
    'provider_5xx',
    'service_unavailable',
  ],
] as const;

describe('classifyResendFailure: Resend documented responses', () => {
  it.each(DOCUMENTED)('%s', (_label, { status, text }, kind, reason, name) => {
    const out = classifyResendFailure(status, text, DOMAINS);
    expect(out).toEqual({
      kind,
      reason,
      httpStatus: status,
      providerErrorName: name,
      ...DOMAINS,
    });
  });

  it('never carries any of the provider message, including the owner address', () => {
    const out = classifyResendFailure(SANDBOX.status, SANDBOX.text, DOMAINS);
    const text = JSON.stringify(out);
    expect(text).not.toContain(OWNER);
    expect(text).not.toContain('testing emails');
    expect(text).not.toContain('resend.com');
  });

  it('a non-JSON body keeps the status only, as unclassified', () => {
    expect(classifyResendFailure(403, '<html>blocked</html>', DOMAINS)).toEqual({
      kind: 'rejected',
      reason: 'unclassified',
      httpStatus: 403,
      ...DOMAINS,
    });
    expect(classifyResendFailure(403, '', DOMAINS).providerErrorName).toBeUndefined();
  });

  it.each(['Validation Error', 'validation_error; a@b.test', 'UPPER', 'x'.repeat(65), ''])(
    'drops an error name that is not a short lower_snake token: %j',
    (name) => {
      const out = classifyResendFailure(403, JSON.stringify({ name, message: 'x' }), DOMAINS);
      expect(out.providerErrorName).toBeUndefined();
    },
  );

  it('an unrecognised message on a known status degrades to unclassified, still with status and name', () => {
    const out = classifyResendFailure(
      403,
      JSON.stringify({ name: 'validation_error', message: 'Reworded by Resend.' }),
      DOMAINS,
    );
    expect(out).toMatchObject({
      kind: 'rejected',
      reason: 'unclassified',
      httpStatus: 403,
      providerErrorName: 'validation_error',
    });
  });

  it('a non-error status the provider should not send is unavailable, not a rejection', () => {
    expect(classifyResendFailure(302, '', DOMAINS)).toMatchObject({
      kind: 'unavailable',
      reason: 'unclassified',
    });
  });
});

describe('domainOf', () => {
  it.each([
    ['person@Example.test', 'example.test'],
    ['Evergreen <signin@example.test>', 'example.test'],
    ['onboarding@resend.dev', 'resend.dev'],
    ['no-at-sign', 'unknown'],
    ['a@b c', 'unknown'],
    ['', 'unknown'],
  ])('%s -> %s', (input, expected) => {
    expect(domainOf(input)).toBe(expected);
  });
});

describe('readBoundedText: only a bounded slice of the provider body is read', () => {
  it('stops at the cap and cancels the rest of the stream', async () => {
    let cancelled = false;
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new TextEncoder().encode('a'.repeat(1000)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const text = await readBoundedText(new Response(stream, { status: 403 }));
    expect(text.length).toBe(MAX_ERROR_BODY_BYTES);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });

  it('returns an empty string for no body and for a stream that errors', async () => {
    expect(await readBoundedText(new Response(null, { status: 403 }))).toBe('');
    const broken = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('stream broke');
      },
    });
    expect(await readBoundedText(new Response(broken, { status: 403 }))).toBe('');
  });
});

describe('ResendMailer: failures are MailerError with a constant message', () => {
  const mailer = (response: () => Response | Promise<Response>) =>
    new ResendMailer(API_KEY, 'Evergreen <onboarding@resend.dev>', (() =>
      Promise.resolve(response())) as unknown as typeof fetch);

  it('a refusal throws MailerError(rejected) and nothing of the body or the key survives', async () => {
    const err = await mailer(() => new Response(SANDBOX.text, { status: 403 }))
      .sendSigninCode('a@x.test', '12345678')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailerError);
    const e = err as MailerError;
    expect(e).toMatchObject({
      kind: 'rejected',
      reason: 'testing_recipient_restricted',
      httpStatus: 403,
      providerErrorName: 'validation_error',
      senderDomain: 'resend.dev',
      recipientDomain: 'x.test',
    });
    for (const text of [e.message, e.stack ?? '', JSON.stringify(e)]) {
      for (const secret of [OWNER, 'testing emails', API_KEY, 'a@x.test', '12345678']) {
        expect(text).not.toContain(secret);
      }
    }
  });

  it('a success cancels the unread body and resolves', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      mailer(() => new Response(stream, { status: 200 })).sendSigninCode('a@x.test', '1'),
    ).resolves.toBeUndefined();
    expect(cancelled).toBe(true);
  });

  it('a fetch that throws becomes MailerError(network) without the thrown text', async () => {
    const err = await new ResendMailer(API_KEY, 'onboarding@resend.dev', (() => {
      throw new Error(`connect failed https://api.resend.com/emails Bearer ${API_KEY} a@x.test`);
    }) as unknown as typeof fetch)
      .sendSigninCode('a@x.test', '1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailerError);
    const e = err as MailerError;
    expect(e).toMatchObject({ kind: 'network', reason: 'network_error' });
    expect(e.httpStatus).toBeUndefined();
    expect(e.message + JSON.stringify(e)).not.toMatch(/api\.resend\.com|Bearer|re_test|a@x\.test/);
  });
});

// ── Through the Worker router ──────────────────────────────────────────────

interface Sent {
  init: RequestInit;
}

let clock: number;
let store: MemoryAuthStore;
let sent: Sent[];
let logs: AuthLogEntry[];
let env: Env;
let options: MountOptions;
let answer: () => Response | Promise<Response>;

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is off in tests');
  });
  clock = START;
  store = new MemoryAuthStore(() => clock);
  sent = [];
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
    fetch: ((_url: string, init: RequestInit) => {
      sent.push({ init });
      return Promise.resolve(answer());
    }) as unknown as typeof fetch,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function start(email: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return handle(
    new Request(`${ORIGIN}${API_BASE}/auth/email/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
      body: JSON.stringify({ email }),
    }),
    env,
    options,
  );
}

const refuse = (b: { status: number; text: string }) => () =>
  new Response(b.text, { status: b.status });

/** The sign-in code the Worker put in the (refused) request to Resend. */
function sentCode(): string {
  const mail = JSON.parse(String(sent.at(-1)!.init.body)) as { text: string };
  return /\b(\d{8})\b/.exec(mail.text)![1]!;
}

function expectNoLeak(text: string, ...extra: string[]): void {
  for (const secret of [API_KEY, OWNER, 'testing emails', 'resend.com', sentCode(), ...extra]) {
    expect(text).not.toContain(secret);
  }
}

describe('POST /auth/email/start when the provider refuses the send', () => {
  it('answers 502 EMAIL_NOT_SENT, not retryable, with no cause on the wire', async () => {
    answer = refuse(SANDBOX);
    const res = await start('Person@Example.test');
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      error: {
        code: 'EMAIL_NOT_SENT',
        message: 'The sign-in code could not be sent.',
        retryable: false,
        details: {},
      },
    });
    expectNoLeak(text, 'person@example.test', 'Person', 'person', 'example.test');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('writes one log line with allowlisted fields and none of the secrets', async () => {
    answer = refuse(SANDBOX);
    await start('Person@Example.test', { 'cf-ray': '8f3a1b2c3d4e5f60-SIN' });
    expect(logs).toEqual([
      {
        event: 'auth.email_send_failed',
        provider: 'resend',
        kind: 'rejected',
        reason: 'testing_recipient_restricted',
        httpStatus: 403,
        providerErrorName: 'validation_error',
        senderDomain: 'resend.dev',
        recipientDomain: 'example.test',
        environment: 'preview',
        rayId: '8f3a1b2c3d4e5f60-SIN',
      },
    ]);
    const line = JSON.stringify(logs);
    expectNoLeak(line, 'person@example.test', 'person');
  });

  it('drops a cf-ray value that is not a short ray id', async () => {
    answer = refuse(SANDBOX);
    await start('a@x.test', { 'cf-ray': 'a@x.test; drop' });
    expect(logs[0]).not.toHaveProperty('rayId');
  });

  it('the default sink is one JSON line on console.error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    delete options.log;
    answer = refuse(SANDBOX);
    await start('a@x.test');
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]![0] as string;
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toMatchObject({
      event: 'auth.email_send_failed',
      reason: 'testing_recipient_restricted',
    });
    expectNoLeak(line, 'a@x.test');
  });

  it('a log sink that throws cannot change the answer', async () => {
    options = {
      ...options,
      log: () => {
        throw new Error('sink down');
      },
    };
    answer = refuse(SANDBOX);
    expect((await start('a@x.test')).status).toBe(502);
  });

  it('other 4xx refusals (bad key, unverified domain) are also 502 EMAIL_NOT_SENT, one public code', async () => {
    for (const [, b] of DOCUMENTED.filter(([, , kind]) => kind === 'rejected')) {
      sent.length = 0;
      logs.length = 0;
      clock += 3600; // a fresh rate-limit window each time
      answer = refuse(b);
      const res = await start('a@x.test');
      expect(res.status).toBe(502);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('EMAIL_NOT_SENT');
      expect(logs).toHaveLength(1);
      expect(logs[0]!.kind).toBe('rejected');
    }
  });
});

describe('POST /auth/email/start: provider busy, down or silent stays 503 UPSTREAM_UNAVAILABLE', () => {
  const unavailable = async (res: Response) => {
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Sign-in is not available right now.',
        retryable: true,
        details: {},
      },
    });
  };

  it.each(DOCUMENTED.filter(([, , kind]) => kind === 'unavailable'))(
    '%s',
    async (_label, b, _kind, reason) => {
      answer = refuse(b);
      await unavailable(await start('a@x.test'));
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ kind: 'unavailable', reason, httpStatus: b.status });
    },
  );

  it('a network failure is 503, logged as network without the thrown text', async () => {
    answer = () => {
      throw new Error(`connect failed https://api.resend.com/emails ${API_KEY} a@x.test`);
    };
    await unavailable(await start('a@x.test'));
    expect(logs).toEqual([
      {
        event: 'auth.email_send_failed',
        provider: 'resend',
        kind: 'network',
        reason: 'network_error',
        fetchErrorName: 'Error',
        senderDomain: 'resend.dev',
        recipientDomain: 'x.test',
        environment: 'preview',
      },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/api\.resend\.com|re_test|a@x\.test/);
  });

  it('a database failure is 503 and writes no email log', async () => {
    options = {
      ...options,
      createStore: () =>
        new Proxy(store, {
          get(target, prop, receiver) {
            if (prop === 'counters') throw new Error('connection refused: postgres://u:pw@db');
            return Reflect.get(target, prop, receiver) as unknown;
          },
        }),
    };
    await unavailable(await start('a@x.test'));
    expect(logs).toEqual([]);
    expect(sent).toHaveLength(0);
  });
});

describe('the refusal does not depend on whether an account exists', () => {
  async function snapshot(res: Response) {
    return {
      status: res.status,
      headers: [...res.headers.entries()].sort(),
      body: await res.text(),
    };
  }

  async function register(email: string): Promise<void> {
    expect((await start(email)).status).toBe(202);
    const verify = await handle(
      new Request(`${ORIGIN}${API_BASE}/auth/email/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ email, code: sentCode() }),
      }),
      env,
      options,
    );
    expect(verify.status).toBe(200);
    expect(store.users.size).toBe(1);
  }

  it('a registered and an unregistered address get byte-identical refusals', async () => {
    await register('known@x.test');
    answer = refuse(SANDBOX);
    const known = await snapshot(await start('known@x.test'));
    const unknown = await snapshot(await start('unknown@x.test'));
    expect(known.status).toBe(502);
    expect(unknown).toEqual(known);
  });

  it('and identical successes, and identical 503s', async () => {
    await register('known@x.test');
    expect(await snapshot(await start('known@x.test'))).toEqual(
      await snapshot(await start('unknown@x.test')),
    );
    answer = refuse(body(503, 'service_unavailable', 'API is temporarily unavailable'));
    clock += 3600;
    expect(await snapshot(await start('known@x.test'))).toEqual(
      await snapshot(await start('unknown@x.test')),
    );
  });
});

describe('guard removal: POST /auth/email/start with a failing mailer', () => {
  it('the per-address rate limit still precedes the send: the 4th request is 429 and nothing more is sent', async () => {
    answer = refuse(SANDBOX);
    for (let i = 0; i < 3; i++) expect((await start('a@x.test')).status).toBe(502);
    expect(sent).toHaveLength(3);
    const limited = await start('a@x.test');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(sent).toHaveLength(3);
    expect(logs).toHaveLength(3);
  });

  it('the per-IP rate limit still precedes the send', async () => {
    env = { ...env, EMAIL_SENDS_PER_IP: '2' };
    answer = refuse(SANDBOX);
    expect((await start('a@x.test')).status).toBe(502);
    expect((await start('b@x.test')).status).toBe(502);
    expect((await start('c@x.test')).status).toBe(429);
    expect(sent).toHaveLength(2);
  });

  it.each([
    ['not an email', 'no-at-sign'],
    ['two at signs', 'a@b@c.test'],
    ['an empty string', ''],
    ['a number', 42],
    ['null', null],
  ])('malformed email (%s) is still 202 with no send and no log', async (_label, email) => {
    answer = refuse(SANDBOX);
    const res = await start(email);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
    expect(sent).toHaveLength(0);
    expect(logs).toEqual([]);
  });

  it('no body at all is still 202 with no send and no log', async () => {
    answer = refuse(SANDBOX);
    const res = await handle(
      new Request(`${ORIGIN}${API_BASE}/auth/email/start`, {
        method: 'POST',
        headers: { origin: ORIGIN },
      }),
      env,
      options,
    );
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(0);
    expect(logs).toEqual([]);
  });

  it('a successful send writes no log', async () => {
    expect((await start('a@x.test')).status).toBe(202);
    expect(logs).toEqual([]);
  });
});

describe('EMAIL_NOT_SENT is not retryable', () => {
  it('the envelope says so, derived from the code', async () => {
    answer = refuse(SANDBOX);
    const { error } = (await (await start('a@x.test')).json()) as { error: { retryable: boolean } };
    expect(error.retryable).toBe(false);
  });
});

// Keeps the MailerFailure type exercised so a field rename breaks here first.
const _shape: MailerFailure = {
  kind: 'rejected',
  reason: 'unclassified',
  senderDomain: 'a',
  recipientDomain: 'b',
};
void _shape;

describe('EMAIL_API_KEY is trimmed where it is read, and a fetch failure logs only its name', () => {
  /** What `fetch` itself does with a header value holding a newline: it refuses before any request. */
  const strictFetch = ((_url: string, init: RequestInit) => {
    const value = (init.headers as Record<string, string>)['authorization'] ?? '';
    if (/[\r\n]/.test(value)) throw new TypeError(`Headers: invalid value ${value} a@x.test`);
    sent.push({ init });
    return Promise.resolve(new Response('{"id":"x"}', { status: 200 }));
  }) as unknown as typeof fetch;

  const authorizationSent = () =>
    (sent.at(-1)!.init.headers as Record<string, string>)['authorization'];

  it.each([
    ['a trailing newline', `${API_KEY}\n`],
    ['a trailing CRLF', `${API_KEY}\r\n`],
    ['trailing spaces', `${API_KEY}   `],
    ['leading and trailing whitespace', ` \t${API_KEY}\n `],
  ])('a key with %s is sent as exactly "Bearer <key>" and answers 202', async (_label, stored) => {
    env.EMAIL_API_KEY = stored;
    const res = await start('a@x.test');
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(1);
    expect(authorizationSent()).toBe(`Bearer ${API_KEY}`);
    expect(logs).toEqual([]);
  });

  it('with the untrimmed value, a strict fetch would refuse; with the trim the send goes through', async () => {
    options = { ...options, fetch: strictFetch };
    env.EMAIL_API_KEY = `${API_KEY}\n`;
    expect((await start('a@x.test')).status).toBe(202);
    expect(authorizationSent()).toBe(`Bearer ${API_KEY}`);
  });

  it.each(['\n', '   ', ' \r\n\t '])(
    'an all-whitespace key (%j) is unset: 503, no fetch, no email log',
    async (stored) => {
      env.EMAIL_API_KEY = stored;
      const res = await start('a@x.test');
      expect(res.status).toBe(503);
      expect((await res.json()) as unknown).toMatchObject({
        error: { code: 'UPSTREAM_UNAVAILABLE' },
      });
      expect(sent).toHaveLength(0);
      expect(logs).toEqual([]);
    },
  );

  it('an unset key is still 503 with no fetch (unchanged)', async () => {
    delete env.EMAIL_API_KEY;
    expect((await start('a@x.test')).status).toBe(503);
    expect(sent).toHaveLength(0);
  });

  it('a fetch that throws a TypeError logs fetchErrorName=TypeError and no message, key or address', async () => {
    answer = () => {
      throw new TypeError(
        `invalid header value Bearer ${API_KEY} for a@x.test at https://api.resend.com`,
      );
    };
    const res = await start('a@x.test');
    expect(res.status).toBe(503);
    expect(logs).toEqual([
      {
        event: 'auth.email_send_failed',
        provider: 'resend',
        kind: 'network',
        reason: 'network_error',
        fetchErrorName: 'TypeError',
        senderDomain: 'resend.dev',
        recipientDomain: 'x.test',
        environment: 'preview',
      },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(
      /invalid header|Bearer|re_test|a@x\.test|api\.resend\.com|stack/,
    );
  });

  it.each([
    ['spaces', 'Type Error'],
    ['too long', 'A'.repeat(65)],
    ['the key', `Bearer ${API_KEY}`],
    ['an address', 'a@x.test'],
    ['digits and punctuation', 'Error: 42'],
    ['a newline', 'Type\nError'],
    ['empty', ''],
  ])('a thrown error whose name is hostile (%s) omits the field', async (_label, name) => {
    answer = () => {
      const hostile = new Error('boom');
      hostile.name = name;
      throw hostile;
    };
    const res = await start('a@x.test');
    expect(res.status).toBe(503);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ kind: 'network', reason: 'network_error' });
    expect(logs[0]).not.toHaveProperty('fetchErrorName');
    expect(JSON.stringify(logs)).not.toMatch(/boom|re_test|a@x\.test/);
  });

  it('a 64-letter name is kept, a 65-letter one is not (the bound)', () => {
    expect(safeFetchErrorName({ name: 'A'.repeat(64) })).toBe('A'.repeat(64));
    expect(safeFetchErrorName({ name: 'A'.repeat(65) })).toBeUndefined();
  });

  it('a thrown string, null, an object with no name, or a name getter that throws omits the field', () => {
    expect(safeFetchErrorName('TypeError')).toBeUndefined();
    expect(safeFetchErrorName(null)).toBeUndefined();
    expect(safeFetchErrorName({})).toBeUndefined();
    expect(safeFetchErrorName({ name: 7 })).toBeUndefined();
    expect(
      safeFetchErrorName({
        get name(): string {
          throw new Error('getter');
        },
      }),
    ).toBeUndefined();
  });

  it('the answer is byte-identical for a registered and an unregistered address when fetch throws', async () => {
    answer = () => {
      throw new TypeError('x');
    };
    const snap = async (res: Response) => ({
      status: res.status,
      headers: [...res.headers.entries()].sort(),
      body: await res.text(),
    });
    const a = await snap(await start('known@x.test'));
    const b = await snap(await start('unknown@x.test'));
    expect(a.status).toBe(503);
    expect(b).toEqual(a);
  });

  it('a non-network failure carries no fetchErrorName', async () => {
    answer = refuse(SANDBOX);
    await start('a@x.test');
    expect(logs[0]).not.toHaveProperty('fetchErrorName');
  });
});
