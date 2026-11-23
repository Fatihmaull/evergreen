/**
 * Operator-channel test send. No network: global fetch throws, and the Resend
 * call is a fake fetch passed into `resendOperatorTransport`. The Worker does
 * not mount a route, so a request cannot choose a recipient or send.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE,
  operatorIdempotencyKey,
  operatorTestEventId,
  operatorTestNotification,
  resendOperatorTransport,
  runOperatorTestAlert,
  type OperatorTestDeps,
  type OperatorTestEnv,
} from '../src/index.js';
import worker from '../src/index.js';

const NOW = 1_800_000_000;
const API_KEY = 're_test_not_a_key';
const FROM = 'evergreen@mail.example.invalid';
const OP_A = 'Ops-A@example.invalid';
const OP_B = 'ops-b@example.invalid';
const HOUR = '2027-01-15T08';
const EVENT_ID = `operator-test:${HOUR}`;

interface MailBody {
  from: string;
  to: string[];
  subject: string;
  text: string;
}

interface RecordedPost {
  url: string;
  key: string;
  auth: string;
  body: MailBody;
}

let posts: RecordedPost[];
let logs: Record<string, unknown>[];

beforeEach(() => {
  posts = [];
  logs = [];
  vi.stubGlobal('fetch', () => {
    throw new Error('network is not allowed in tests');
  });
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logs.push(JSON.parse(String(line)) as Record<string, unknown>);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fakeFetch(statusFor: (to: string) => number | 'throw' = () => 200): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body)) as MailBody;
    const to = body.to[0] ?? '';
    posts.push({
      url,
      key: headers.get('idempotency-key') ?? '',
      auth: headers.get('authorization') ?? '',
      body,
    });
    const status = statusFor(to);
    if (status === 'throw') {
      const error = new Error(`abort LEAK ${to} ${API_KEY}`);
      error.name = 'AbortError';
      throw error;
    }
    if (status !== 200) throw new Error(`operator alert send failed: ${status}`);
    return new Response('{}', { status });
  }) as unknown as typeof fetch;
}

function env(extra: Partial<OperatorTestEnv> = {}): OperatorTestEnv {
  return {
    ALERTS_SEND: 'send',
    ALERTS_ALLOWLIST: ` ${OP_A} , , ${OP_B} `,
    EMAIL_API_KEY: API_KEY,
    EMAIL_FROM: FROM,
    ...extra,
  };
}

function deps(now = NOW, fetchImpl: typeof fetch = fakeFetch()): OperatorTestDeps {
  return {
    nowSeconds: () => now,
    transportFor: (to) => resendOperatorTransport(API_KEY, FROM, to, fetchImpl),
  };
}

function expectNoSecret(text: string): void {
  for (const secret of [API_KEY, OP_A, OP_B, FROM, 'postgres://', 'LEAK']) {
    expect(text).not.toContain(secret);
  }
}

describe('operator alert test send', () => {
  it('the notification is fixed text marked TEST and carries no address', () => {
    const n = operatorTestNotification();
    expect(n.subject).toBe('Evergreen operator alert: TEST');
    expect(n.body.startsWith('TEST.')).toBe(true);
    expect(n.severity).toBe('info');
    expect(n.body).not.toContain('@');
    expect(n.subject).not.toContain('@');
  });

  it('the event id is the UTC hour and ignores minutes inside that hour', () => {
    expect(operatorTestEventId(NOW)).toBe(EVENT_ID);
    expect(operatorTestEventId(NOW + 1800)).toBe(EVENT_ID);
    expect(operatorTestEventId(NOW + 3599)).toBe(EVENT_ID);
    expect(operatorTestEventId(NOW + 3600)).toBe('operator-test:2027-01-15T09');
  });

  it('mails only the parsed allowlist, one Resend key per recipient', async () => {
    const outcome = await runOperatorTestAlert(env(), deps());
    expect(outcome).toEqual({ action: 'sent', recipients: 2 });
    expect(posts.map((p) => p.body.to)).toEqual([[OP_A], [OP_B]]);
    expect(posts.map((p) => p.body.subject)).toEqual([
      'Evergreen operator alert: TEST',
      'Evergreen operator alert: TEST',
    ]);
    expect(posts[0]?.body.text).toBe(operatorTestNotification().body);
    expect(posts[0]?.body.text).toBe(posts[1]?.body.text);
    expect(posts[0]?.auth).toBe(`Bearer ${API_KEY}`);
    expect(posts[0]?.url).toBe('https://api.resend.com/emails');
    expect(posts[0]?.key).toBe(await operatorIdempotencyKey(EVENT_ID, OP_A));
    expect(posts[1]?.key).toBe(await operatorIdempotencyKey(EVENT_ID, OP_B));
    expect(posts[0]?.key).toMatch(new RegExp(`^${EVENT_ID}/[0-9a-f]{16}$`));
    expect(posts[0]?.key).not.toBe(posts[1]?.key);
    expect(logs).toEqual([{ event: 'alerts.operator_test', action: 'sent', recipients: 2 }]);
    expectNoSecret(JSON.stringify(logs));
  });

  it('the same UTC hour reuses the key and the next hour does not', async () => {
    await runOperatorTestAlert(env(), deps(NOW));
    const first = posts.map((p) => p.key);
    posts = [];
    await runOperatorTestAlert(env(), deps(NOW + 1800));
    expect(posts.map((p) => p.key)).toEqual(first);
    posts = [];
    await runOperatorTestAlert(env(), deps(NOW + 3600));
    expect(posts[0]?.key).toBe(await operatorIdempotencyKey('operator-test:2027-01-15T09', OP_A));
    expect(posts[0]?.key).not.toBe(first[0]);
  });

  it('ALERTS_SEND must be exactly send', async () => {
    for (const value of [undefined, '', 'SEND', ' send', 'send ']) {
      posts = [];
      logs = [];
      const outcome = await runOperatorTestAlert(env({ ALERTS_SEND: value }), deps());
      expect(outcome).toEqual({ action: 'dry-run', reason: 'alerts_send_off' });
      expect(posts).toEqual([]);
      expect(logs).toEqual([
        { event: 'alerts.operator_test', action: 'dry-run', reason: 'alerts_send_off' },
      ]);
    }
  });

  it('an empty allowlist sends to nobody', async () => {
    for (const value of [undefined, '', ' , , ']) {
      posts = [];
      logs = [];
      const outcome = await runOperatorTestAlert(env({ ALERTS_ALLOWLIST: value }), deps());
      expect(outcome).toEqual({ action: 'dry-run', reason: 'no_operator' });
      expect(posts).toEqual([]);
      expect(logs).toEqual([
        { event: 'alerts.operator_test', action: 'dry-run', reason: 'no_operator' },
      ]);
    }
  });

  it('a missing email channel logs email_channel_down and does not call Resend', async () => {
    const cases: { extra: Partial<OperatorTestEnv>; blockedBy: string[] }[] = [
      { extra: { EMAIL_API_KEY: undefined }, blockedBy: ['EMAIL_API_KEY'] },
      { extra: { EMAIL_API_KEY: '   ' }, blockedBy: ['EMAIL_API_KEY'] },
      { extra: { EMAIL_FROM: undefined }, blockedBy: ['EMAIL_FROM'] },
      { extra: { EMAIL_FROM: '' }, blockedBy: ['EMAIL_FROM'] },
      {
        extra: { EMAIL_API_KEY: undefined, EMAIL_FROM: undefined, ALERTS_SEND: undefined },
        blockedBy: ['EMAIL_API_KEY', 'EMAIL_FROM'],
      },
    ];
    for (const item of cases) {
      posts = [];
      logs = [];
      const outcome = await runOperatorTestAlert(env(item.extra), deps());
      expect(outcome).toEqual({ action: 'email_channel_down', blockedBy: item.blockedBy });
      expect(posts).toEqual([]);
      expect(logs).toEqual([
        {
          event: 'alerts.operator_test',
          action: 'email_channel_down',
          blockedBy: item.blockedBy,
        },
      ]);
      expectNoSecret(JSON.stringify(logs));
    }
  });

  it('a thrown send for one operator still emails the next and logs send_failed', async () => {
    const outcome = await runOperatorTestAlert(
      env(),
      deps(
        NOW,
        fakeFetch((to) => (to === OP_A ? 'throw' : 200)),
      ),
    );
    expect(outcome).toEqual({ action: 'sent', recipients: 1, failed: 1 });
    expect(posts.map((p) => p.body.to)).toEqual([[OP_A], [OP_B]]);
    expect(logs).toEqual([
      { event: 'alerts.operator_test', action: 'send_failed', errorName: 'AbortError' },
      { event: 'alerts.operator_test', action: 'sent', recipients: 1, failed: 1 },
    ]);
    expectNoSecret(JSON.stringify(logs));
  });

  it('a 5xx for every operator is send_failed and still tries each recipient', async () => {
    const outcome = await runOperatorTestAlert(
      env(),
      deps(
        NOW,
        fakeFetch(() => 503),
      ),
    );
    expect(outcome).toEqual({ action: 'send_failed', failed: 2 });
    expect(posts).toHaveLength(2);
    expect(logs[0]).toEqual({
      event: 'alerts.operator_test',
      action: 'send_failed',
      httpStatus: 503,
    });
    expect(logs[1]).toEqual({
      event: 'alerts.operator_test',
      action: 'send_failed',
      httpStatus: 503,
    });
    expectNoSecret(JSON.stringify(logs));
  });
});

describe('the operator test trigger is not mounted', () => {
  function handlerSource(): string {
    const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    const start = index.indexOf('export default');
    const end = index.indexOf('// Auth core');
    if (start < 0 || end <= start) throw new Error('handler markers moved');
    return index.slice(start, end);
  }

  it('fetch and scheduled do not call the sender, and the router does not name it', () => {
    const router = readFileSync(new URL('../src/router.ts', import.meta.url), 'utf8');
    const handlers = handlerSource();
    expect(router).not.toContain('operator-test');
    expect(router).not.toContain('runOperatorTestAlert');
    expect(router).not.toContain('alerts.operator_test');
    expect(handlers).not.toContain('operator-test');
    expect(handlers).not.toContain('runOperatorTestAlert');
    expect(handlers).not.toContain('alerts.operator_test');
  });

  it('a request cannot send, with or without a recipient and a session cookie', async () => {
    const pending: Promise<unknown>[] = [];
    const paths = [
      `${API_BASE}/alerts/operator-test`,
      `${API_BASE}/alerts/operator-test?to=intruder@example.invalid`,
      `${API_BASE}/operator/test`,
    ];
    for (const path of paths) {
      for (const method of ['GET', 'POST', 'PUT']) {
        posts = [];
        logs = [];
        const response = await worker.fetch(
          new Request(`https://dashboard.example.invalid${path}`, {
            method,
            headers: {
              'content-type': 'application/json',
              cookie: '__Host-evergreen_session=not-an-operator',
            },
            ...(method === 'GET'
              ? {}
              : { body: JSON.stringify({ to: 'intruder@example.invalid' }) }),
          }),
          env(),
          {
            waitUntil: (promise) => {
              pending.push(promise);
            },
            mount: { fetch: fakeFetch() },
          },
        );
        expect(response.status).toBe(404);
        const body = (await response.json()) as { error: { code: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(posts).toEqual([]);
        expect(logs).toEqual([]);
      }
    }
    await Promise.all(pending);
    expect(posts).toEqual([]);
  });
});
