/**
 * PH2-E4-05 F16, sign-in path only. The real `worker.fetch` schedules the
 * operator email; `fetch` and the store are fakes. No network, no database.
 * The Neon driver throws if anything asks it for a connection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@neondatabase/serverless', () => ({
  neon: () => {
    throw new Error('F16 send path must not read the database');
  },
}));

import {
  API_BASE,
  MemoryAuthStore,
  operatorIdempotencyKey,
  runSigninEmailFailedAlert,
  signinEmailFailedEventId,
  signinEmailFailedNotification,
  type AlertTransport,
  type AuthLogEntry,
  type Env,
  type HandleOptions,
  type SigninEmailFailedDeps,
} from '../src/index.js';
import worker from '../src/index.js';

const ORIGIN = 'https://dashboard.example.invalid';
const NOW = 1_800_000_000;
const API_KEY = 're_test_not_a_key';
const FROM = 'evergreen@mail.example.invalid';
const USER = 'person@example.test';
const OP_A = 'ops-a@example.invalid';
const OP_B = 'ops-b@example.invalid';
const LEAK = 'LEAK-PROVIDER owner@secret.example';

const SANDBOX = `You can only send testing emails to your own email address (${LEAK}). To send emails to other recipients, please verify a domain.`;

interface MailBody {
  from: string;
  to: string[];
  subject: string;
  text: string;
}

interface OperatorPost {
  key: string;
  auth: string;
  body: MailBody;
}

let authLogs: AuthLogEntry[];
let operatorLogs: Record<string, unknown>[];
let posts: OperatorPost[];
let signinTexts: string[];
let pending: Promise<unknown>[];
let openGate: () => void;
let holdOperator: boolean;

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is not allowed in tests');
  });
  authLogs = [];
  operatorLogs = [];
  posts = [];
  signinTexts = [];
  pending = [];
  holdOperator = false;
  openGate = () => undefined;
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    operatorLogs.push(JSON.parse(String(line)) as Record<string, unknown>);
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function codeOf(text: string): string {
  const found = /\b(\d{8})\b/.exec(text);
  if (found?.[1] === undefined) throw new Error('sign-in mail had no code');
  return found[1];
}

function expectNoLeak(text: string, code = ''): void {
  for (const secret of [
    API_KEY,
    USER,
    code,
    LEAK,
    'owner@secret.example',
    'LEAK-NETWORK',
    'LEAK-500',
    'LEAK-THROW',
    'postgres://',
    'approaching_critical',
    'allowance_expiring',
    OP_A,
    OP_B,
  ]) {
    if (secret !== '') expect(text).not.toContain(secret);
  }
}

function baseEnv(extra: Record<string, string | undefined> = {}): Env {
  const env: Record<string, string | undefined> = {
    ENVIRONMENT: 'preview',
    DATABASE_URL: 'postgres://user:pw@db.invalid/evergreen',
    SIGNIN_CODE_PEPPER: 'test-pepper-not-a-secret',
    EMAIL_API_KEY: API_KEY,
    EMAIL_FROM: FROM,
    DASHBOARD_ORIGIN: ORIGIN,
    ALERTS_SEND: 'send',
    ALERTS_ALLOWLIST: ` ${OP_A} , , ${OP_B} `,
    ...extra,
  };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key];
  return env as Env;
}

function fetcher(): typeof fetch {
  let gate = Promise.resolve();
  if (holdOperator) {
    gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
  }
  return (async (_url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body)) as MailBody;
    const key = headers.get('idempotency-key');
    if (key === null) {
      signinTexts.push(body.text);
      return new Response(
        JSON.stringify({
          statusCode: 403,
          name: 'validation_error',
          message: `${SANDBOX} ${USER} ${codeOf(body.text)}`,
        }),
        { status: 403 },
      );
    }
    posts.push({
      key,
      auth: headers.get('authorization') ?? '',
      body,
    });
    await gate;
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
}

function mount(fetchImpl: typeof fetch = fetcher()): HandleOptions {
  return {
    createStore: () => new MemoryAuthStore(() => NOW),
    now: () => NOW,
    log: (entry) => {
      authLogs.push(entry);
    },
    fetch: fetchImpl,
  };
}

function start(env: Env, options: HandleOptions = mount()): Promise<Response> {
  return worker.fetch(
    new Request(`${ORIGIN}${API_BASE}/auth/email/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email: USER }),
    }),
    env,
    {
      waitUntil: (promise) => {
        pending.push(promise);
      },
      mount: options,
    },
  );
}

async function responseWithoutWaiting(env: Env, options?: HandleOptions): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      start(env, options),
      new Promise<Response>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('sign-in response waited on the operator send')),
          1000,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    openGate();
  }
}

describe('F16 sign-in operator email', () => {
  it('the event id is the UTC hour and the body is fixed text', () => {
    expect(signinEmailFailedEventId(NOW)).toBe('f16-signin-email-failed:2027-01-15T08');
    expect(signinEmailFailedEventId(NOW + 3599)).toBe('f16-signin-email-failed:2027-01-15T08');
    expect(signinEmailFailedEventId(NOW + 3600)).toBe('f16-signin-email-failed:2027-01-15T09');
    const note = signinEmailFailedNotification();
    expect(note.body).not.toMatch(/\d{8}/);
    expect(note.body).not.toContain('@');
    expect(note).toEqual({
      subject: 'Evergreen operator alert: sign-in email failed (F16)',
      body: 'F16: the API could not send a sign-in code. This alert is sent on the sign-in request and does not read the database. It uses the same email channel, so a provider outage can fail this send too.',
      severity: 'critical',
    });
  });

  it('a refused sign-in returns 502 before the operator send, then emails each allowlisted operator', async () => {
    holdOperator = true;
    const res = await responseWithoutWaiting(baseEnv());
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      error: {
        code: 'EMAIL_NOT_SENT',
        message: 'The sign-in code could not be sent.',
        retryable: false,
        details: {},
      },
    });
    const code = codeOf(signinTexts[0] ?? '');
    expect(authLogs).toEqual([
      {
        event: 'auth.email_send_failed',
        provider: 'resend',
        kind: 'rejected',
        reason: 'testing_recipient_restricted',
        httpStatus: 403,
        providerErrorName: 'validation_error',
        senderDomain: 'mail.example.invalid',
        recipientDomain: 'example.test',
        environment: 'preview',
      },
    ]);
    expectNoLeak(JSON.stringify(authLogs), code);
    expect(console.error).not.toHaveBeenCalled();
    // The response was already checked. The operator send was only scheduled.
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(posts.map((post) => post.body.to)).toEqual([[OP_A], [OP_B]]);
    expect(posts[0]?.body.from).toBe(FROM);
    expect(posts[0]?.body.subject).toBe('Evergreen operator alert: sign-in email failed (F16)');
    expect(posts[0]?.body.text).toBe(signinEmailFailedNotification().body);
    expect(posts[0]?.body.text).toBe(posts[1]?.body.text);
    expect(posts[0]?.auth).toBe(`Bearer ${API_KEY}`);
    expect(posts[0]?.key).toBe(
      await operatorIdempotencyKey('f16-signin-email-failed:2027-01-15T08', OP_A),
    );
    expect(posts[1]?.key).toBe(
      await operatorIdempotencyKey('f16-signin-email-failed:2027-01-15T08', OP_B),
    );
    expect(posts[0]?.key).not.toBe(posts[1]?.key);
    expectNoLeak(posts[0]?.body.text ?? '', code);
    expectNoLeak(posts[0]?.key ?? '', code);
    expectNoLeak(posts[1]?.key ?? '', code);
    expectNoLeak(JSON.stringify(operatorLogs), code);
    expect(operatorLogs).toEqual([
      { event: 'alerts.f16_signin_email', action: 'sent', recipients: 2 },
    ]);
  });

  it('the same UTC hour reuses the idempotency key', async () => {
    const env = baseEnv({ ALERTS_ALLOWLIST: OP_A });
    const options = mount();
    await start(env, options);
    await start(env, options);
    await Promise.all(pending);
    expect(posts).toHaveLength(2);
    expect(posts[0]?.key).toBe(posts[1]?.key);
    expect(posts[0]?.key).toBe(
      await operatorIdempotencyKey('f16-signin-email-failed:2027-01-15T08', OP_A),
    );
  });

  it('a network failure stays 503 and the operator body does not change', async () => {
    const failing = (async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      const body = JSON.parse(String(init.body)) as MailBody;
      if (headers.get('idempotency-key') === null) {
        signinTexts.push(body.text);
        throw new Error(`connect failed ${API_KEY} ${USER} ${codeOf(body.text)} LEAK-NETWORK`);
      }
      posts.push({ key: headers.get('idempotency-key') ?? '', auth: '', body });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const res = await start(baseEnv(), mount(failing));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Sign-in is not available right now.',
        retryable: true,
        details: {},
      },
    });
    await Promise.all(pending);
    const code = codeOf(signinTexts[0] ?? '');
    expect(authLogs[0]).toMatchObject({
      event: 'auth.email_send_failed',
      kind: 'network',
      reason: 'network_error',
      fetchStage: 'send',
    });
    expect(posts[0]?.body.text).toBe(signinEmailFailedNotification().body);
    expectNoLeak(JSON.stringify(authLogs), code);
    expectNoLeak(posts[0]?.body.text ?? '', code);
    expectNoLeak(posts[0]?.key ?? '', code);
    expectNoLeak(JSON.stringify(operatorLogs), code);
  });

  it.each([undefined, '', 'SEND', ' send', 'send '])(
    'ALERTS_SEND %j does not email',
    async (value) => {
      const res = await start(baseEnv({ ALERTS_SEND: value }));
      expect(res.status).toBe(502);
      await Promise.all(pending);
      expect(posts).toEqual([]);
      expect(operatorLogs).toEqual([
        { event: 'alerts.f16_signin_email', action: 'dry-run', reason: 'alerts_send_off' },
      ]);
      expectNoLeak(JSON.stringify(operatorLogs), codeOf(signinTexts[0] ?? ''));
    },
  );

  it('no allowlist does not email', async () => {
    const res = await start(baseEnv({ ALERTS_ALLOWLIST: undefined }));
    expect(res.status).toBe(502);
    await Promise.all(pending);
    expect(posts).toEqual([]);
    expect(operatorLogs).toEqual([
      { event: 'alerts.f16_signin_email', action: 'dry-run', reason: 'no_operator' },
    ]);
  });

  it('a thrown send for one operator still emails the next and logs send_failed', async () => {
    const failing = (async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      const body = JSON.parse(String(init.body)) as MailBody;
      const key = headers.get('idempotency-key');
      if (key === null) {
        signinTexts.push(body.text);
        return new Response(JSON.stringify({ name: 'validation_error', message: SANDBOX }), {
          status: 403,
        });
      }
      posts.push({ key, auth: '', body });
      if (body.to[0] === OP_A) {
        const error = new Error(
          `abort LEAK-THROW ${USER} ${codeOf(signinTexts[0] ?? '')} ${API_KEY}`,
        );
        error.name = 'AbortError';
        throw error;
      }
      return new Response(`LEAK-500 ${USER}`, { status: 200 });
    }) as unknown as typeof fetch;
    const res = await start(baseEnv(), mount(failing));
    expect(res.status).toBe(502);
    await expect(Promise.all(pending)).resolves.toBeDefined();
    expect(posts.map((post) => post.body.to)).toEqual([[OP_A], [OP_B]]);
    const code = codeOf(signinTexts[0] ?? '');
    expect(operatorLogs).toEqual([
      { event: 'alerts.f16_signin_email', action: 'send_failed', errorName: 'AbortError' },
      { event: 'alerts.f16_signin_email', action: 'sent', recipients: 1, failed: 1 },
    ]);
    expectNoLeak(JSON.stringify(operatorLogs), code);
    expectNoLeak(posts[0]?.body.text ?? '', code);
    expectNoLeak(posts[1]?.body.text ?? '', code);
  });

  it('a 5xx for one operator logs the status and still emails the next', async () => {
    const failing = (async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      const body = JSON.parse(String(init.body)) as MailBody;
      const key = headers.get('idempotency-key');
      if (key === null) {
        signinTexts.push(body.text);
        return new Response(JSON.stringify({ name: 'validation_error', message: SANDBOX }), {
          status: 403,
        });
      }
      posts.push({ key, auth: '', body });
      if (body.to[0] === OP_A) {
        return new Response(`LEAK-500 ${USER} ${codeOf(signinTexts[0] ?? '')} ${API_KEY}`, {
          status: 500,
        });
      }
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await start(baseEnv(), mount(failing));
    await Promise.all(pending);
    expect(posts.map((post) => post.body.to)).toEqual([[OP_A], [OP_B]]);
    expect(operatorLogs[0]).toEqual({
      event: 'alerts.f16_signin_email',
      action: 'send_failed',
      httpStatus: 500,
    });
    expectNoLeak(JSON.stringify(operatorLogs), codeOf(signinTexts[0] ?? ''));
  });

  it('EMAIL_API_KEY or EMAIL_FROM missing logs email_channel_down and does not send', async () => {
    const sent: string[] = [];
    const deps: SigninEmailFailedDeps = {
      nowSeconds: () => NOW,
      transportFor: (): AlertTransport => ({
        deliver: () => {
          sent.push('called');
          return Promise.resolve({ ok: true });
        },
      }),
    };
    for (const [name, planted] of [
      ['EMAIL_API_KEY', 're_secret_value'],
      ['EMAIL_FROM', 'from-secret@example.invalid'],
    ] as const) {
      sent.length = 0;
      operatorLogs.length = 0;
      const env = {
        ALERTS_SEND: 'send',
        ALERTS_ALLOWLIST: `${OP_A}, ${OP_B}`,
        EMAIL_API_KEY: 're_secret_value',
        EMAIL_FROM: 'from-secret@example.invalid',
        [name]: '   ',
      };
      const outcome = await runSigninEmailFailedAlert(env, deps);
      expect(outcome).toEqual({ action: 'email_channel_down', blockedBy: [name] });
      expect(sent).toEqual([]);
      expect(operatorLogs).toEqual([
        { event: 'alerts.f16_signin_email', action: 'email_channel_down', blockedBy: [name] },
      ]);
      expect(JSON.stringify(operatorLogs)).not.toContain(planted);
      expect(JSON.stringify(outcome)).not.toContain(planted);
    }
    operatorLogs.length = 0;
    const both = await runSigninEmailFailedAlert({ ALERTS_ALLOWLIST: OP_A }, deps);
    expect(both).toEqual({
      action: 'email_channel_down',
      blockedBy: ['EMAIL_API_KEY', 'EMAIL_FROM'],
    });
    expect(sent).toEqual([]);
  });

  it('a successful sign-in does not schedule an operator email', async () => {
    const ok = (() => new Response('{"id":"x"}', { status: 200 })) as unknown as typeof fetch;
    const res = await start(baseEnv(), mount(ok));
    expect(res.status).toBe(202);
    expect(pending).toEqual([]);
    expect(posts).toEqual([]);
    expect(operatorLogs).toEqual([]);
    expect(authLogs).toEqual([]);
  });

  it('a database failure does not schedule an operator email', async () => {
    const store = new MemoryAuthStore(() => NOW);
    const options: HandleOptions = {
      ...mount(),
      createStore: () =>
        new Proxy(store, {
          get(target, prop, receiver) {
            if (prop === 'counters')
              throw new Error('connection refused: postgres://u:pw@db LEAK-DB');
            return Reflect.get(target, prop, receiver) as unknown;
          },
        }),
    };
    const res = await start(baseEnv(), options);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(pending).toEqual([]);
    expect(posts).toEqual([]);
    expect(authLogs).toEqual([]);
    expect(operatorLogs).toEqual([]);
    expect(text).not.toContain('LEAK-DB');
    expect(text).not.toContain('postgres');
  });
});
