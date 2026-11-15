/**
 * PH2-E4-09. The operator channel test goes through `worker.fetch` and
 * `resendOperatorTransport`. `fetch` is injected. The global `fetch` throws,
 * so a path that skips the injection hits the network guard. No database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  API_BASE,
  OPERATOR_TEST_EVENT,
  operatorIdempotencyKey,
  operatorTestEventId,
  operatorTestNotification,
  resetOperatorTestHourGuard,
  type Env,
} from '../src/index.js';
import worker from '../src/index.js';

const ORIGIN = 'https://dashboard.example.invalid';
const NOW = 1_800_000_000;
const API_KEY = 're_test_not_a_key';
const FROM = 'evergreen@mail.example.invalid';
const TOKEN = 'tick-token-test-not-a-secret';
const OP_A = 'ops-a@example.invalid';
const OP_B = 'ops-b@example.invalid';
const EVIL = 'evil@example.invalid';
const PWN = 'PWNED-SUBJECT';

interface MailBody {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

interface Post {
  auth: string;
  key: string;
  body: MailBody;
}

let posts: Post[];
let logs: Record<string, unknown>[];
let failA: 'status' | 'throw' | undefined;

beforeEach(() => {
  posts = [];
  logs = [];
  failA = undefined;
  resetOperatorTestHourGuard();
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

function env(over: Record<string, string | undefined> = {}): Env {
  const base: Record<string, string | undefined> = {
    TICK_TOKEN: TOKEN,
    ALERTS_SEND: 'send',
    ALERTS_ALLOWLIST: ` ${OP_A} , , ${OP_B} `,
    EMAIL_API_KEY: API_KEY,
    EMAIL_FROM: FROM,
    ...over,
  };
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) delete base[key];
  }
  return base as Env;
}

const injected: typeof fetch = async (_input, init) => {
  const headers = new Headers(init?.headers);
  const body = JSON.parse(String(init?.body)) as MailBody;
  const post: Post = {
    auth: headers.get('authorization') ?? '',
    key: headers.get('idempotency-key') ?? '',
    body,
  };
  posts.push(post);
  const to = body.to[0];
  if (to === OP_A && failA === 'throw') {
    throw new TypeError(`leak ${OP_A} ${API_KEY} ${TOKEN}`);
  }
  if (to === OP_A && failA === 'status') {
    return new Response('no', { status: 500 });
  }
  return new Response(JSON.stringify({ id: 're_test' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

function postRequest(authorization?: string): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    cookie: 'evergreen_session=not-an-operator',
  };
  if (authorization !== undefined) headers['authorization'] = authorization;
  return new Request(
    `${ORIGIN}${API_BASE}/operator/alert-test?to=${encodeURIComponent(EVIL)}&subject=${encodeURIComponent(PWN)}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: EVIL, subject: PWN, text: PWN, html: PWN, recipient: EVIL }),
    },
  );
}

function call(
  target: Env,
  request: Request = postRequest(`Bearer ${TOKEN}`),
  now = NOW,
): Promise<Response> {
  return worker.fetch(request, target, { mount: { fetch: injected, now: () => now } });
}

function expectNoSecrets(text: string): void {
  for (const secret of [API_KEY, TOKEN, OP_A, OP_B, EVIL, PWN, 'Bearer']) {
    expect(text).not.toContain(secret);
  }
}

describe('POST /api/v1/operator/alert-test', () => {
  it('the event id is the UTC hour and the body is fixed TEST text', () => {
    expect(operatorTestEventId(NOW)).toBe('operator-test:2027-01-15T08');
    expect(operatorTestEventId(NOW + 3599)).toBe('operator-test:2027-01-15T08');
    expect(operatorTestEventId(NOW + 3600)).toBe('operator-test:2027-01-15T09');
    const note = operatorTestNotification();
    expect(note.subject).toContain('TEST');
    expect(note.body).toContain('TEST');
    expect(note.body).not.toContain('@');
    expect(note).toEqual({
      subject: 'Evergreen operator alert: TEST',
      body: 'TEST. This message checks the operator email channel. It is not a user alert. It includes no account, no address, and no secret.',
      severity: 'info',
    });
  });

  it('does not exist when TICK_TOKEN is unset or empty', async () => {
    for (const token of [undefined, '']) {
      const res = await call(env({ TICK_TOKEN: token }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: 'NOT_FOUND', message: 'No such route.', retryable: false, details: {} },
      });
    }
    expect(posts).toHaveLength(0);
  });

  it('rejects a missing, wrong, or non-Bearer credential and ignores a session cookie', async () => {
    const requests = [
      postRequest(undefined),
      postRequest('Bearer wrong-token'),
      postRequest(`bearer ${TOKEN}`),
      postRequest(TOKEN),
    ];
    for (const request of requests) {
      const res = await call(env(), request);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'That request is not authorized.',
          retryable: false,
          details: {},
        },
      });
    }
    expect(posts).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it('a matching bearer may only POST', async () => {
    const res = await call(
      env(),
      new Request(`${ORIGIN}${API_BASE}/operator/alert-test`, {
        method: 'GET',
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(posts).toHaveLength(0);
  });

  it('sends only to the allowlist, with the fixed TEST body and the hour key', async () => {
    const res = await call(env());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const payload = await res.json();
    expect(payload).toEqual({ action: 'sent', recipients: 2 });
    expectNoSecrets(JSON.stringify(payload));
    expect(posts).toHaveLength(2);
    const note = operatorTestNotification();
    const keys = await Promise.all(
      [OP_A, OP_B].map((address) => operatorIdempotencyKey(operatorTestEventId(NOW), address)),
    );
    expect(posts.map((post) => post.body.to)).toEqual([[OP_A], [OP_B]]);
    for (const [index, post] of posts.entries()) {
      expect(post.auth).toBe(`Bearer ${API_KEY}`);
      expect(post.auth).not.toContain(TOKEN);
      expect(post.key).toBe(keys[index]);
      expect(post.key.startsWith('operator-test:2027-01-15T08/')).toBe(true);
      expect(post.body.from).toBe(FROM);
      expect(post.body.subject).toBe(note.subject);
      expect(post.body.text).toBe(note.body);
      expect(post.body.subject).toContain('TEST');
      expect(post.body.text).toContain('TEST');
      expect(post.body.html).toBeUndefined();
      expect(JSON.stringify(post.body)).not.toContain(EVIL);
      expect(JSON.stringify(post.body)).not.toContain(PWN);
      expect(JSON.stringify(post.body)).not.toContain(TOKEN);
      expect(JSON.stringify(post.body)).not.toContain(API_KEY);
    }
    const summary = logs.find(
      (line) => line['event'] === OPERATOR_TEST_EVENT && line['action'] === 'sent',
    );
    expect(summary).toEqual({ event: OPERATOR_TEST_EVENT, action: 'sent', recipients: 2 });
    for (const line of logs) expectNoSecrets(JSON.stringify(line));
  });

  it.each([undefined, '', 'dry-run', 'SEND', ' send', 'send ', 'Send'])(
    'ALERTS_SEND %j does not send',
    async (value) => {
      const res = await call(env({ ALERTS_SEND: value }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ action: 'dry-run', reason: 'alerts_send_off' });
      expect(posts).toHaveLength(0);
      expect(logs).toEqual([
        { event: OPERATOR_TEST_EVENT, action: 'dry-run', reason: 'alerts_send_off' },
      ]);
    },
  );

  it('an empty allowlist sends to nobody, including an address in the body', async () => {
    const res = await call(env({ ALERTS_ALLOWLIST: ' , ' }));
    expect(await res.json()).toEqual({ action: 'dry-run', reason: 'no_operator' });
    expect(posts).toHaveLength(0);
  });

  it('a missing or blank email setting logs email_channel_down and does not call Resend', async () => {
    const missingKey = await call(env({ EMAIL_API_KEY: undefined }));
    expect(await missingKey.json()).toEqual({
      action: 'email_channel_down',
      blockedBy: ['EMAIL_API_KEY'],
    });
    const blankFrom = await call(env({ EMAIL_FROM: '   ' }));
    expect(await blankFrom.json()).toEqual({
      action: 'email_channel_down',
      blockedBy: ['EMAIL_FROM'],
    });
    expect(posts).toHaveLength(0);
    expect(logs).toEqual([
      { event: OPERATOR_TEST_EVENT, action: 'email_channel_down', blockedBy: ['EMAIL_API_KEY'] },
      { event: OPERATOR_TEST_EVENT, action: 'email_channel_down', blockedBy: ['EMAIL_FROM'] },
    ]);
    for (const line of logs) expectNoSecrets(JSON.stringify(line));
  });

  it('one recipient failing still sends to the next, and the log has no address or key', async () => {
    failA = 'status';
    const res = await call(env());
    expect(await res.json()).toEqual({ action: 'sent', recipients: 1, failed: 1 });
    expect(posts.map((post) => post.body.to)).toEqual([[OP_A], [OP_B]]);
    expect(logs).toEqual([
      { event: OPERATOR_TEST_EVENT, action: 'send_failed', httpStatus: 500 },
      { event: OPERATOR_TEST_EVENT, action: 'sent', recipients: 1, failed: 1 },
    ]);
    for (const line of logs) expectNoSecrets(JSON.stringify(line));
  });

  it('a thrown fetch keeps only the error name', async () => {
    failA = 'throw';
    const res = await call(env());
    expect(await res.json()).toEqual({ action: 'sent', recipients: 1, failed: 1 });
    expect(logs[0]).toEqual({
      event: OPERATOR_TEST_EVENT,
      action: 'send_failed',
      errorName: 'TypeError',
    });
    expectNoSecrets(JSON.stringify(logs));
  });

  it('a second call in the same UTC hour does not send again', async () => {
    expect((await call(env())).status).toBe(200);
    expect(posts).toHaveLength(2);
    const again = await call(env());
    expect(await again.json()).toEqual({ action: 'dry-run', reason: 'hour_deduped' });
    expect(posts).toHaveLength(2);
    const next = await call(env(), postRequest(`Bearer ${TOKEN}`), NOW + 3600);
    expect(await next.json()).toEqual({ action: 'sent', recipients: 2 });
    expect(posts).toHaveLength(4);
    expect(posts[2]?.key.startsWith('operator-test:2027-01-15T09/')).toBe(true);
  });

  it('a dry-run or a down channel does not consume the hour', async () => {
    expect(await (await call(env({ ALERTS_SEND: 'SEND' }))).json()).toEqual({
      action: 'dry-run',
      reason: 'alerts_send_off',
    });
    expect(await (await call(env({ EMAIL_API_KEY: '' }))).json()).toEqual({
      action: 'email_channel_down',
      blockedBy: ['EMAIL_API_KEY'],
    });
    const sent = await call(env());
    expect(await sent.json()).toEqual({ action: 'sent', recipients: 2 });
    expect(posts).toHaveLength(2);
  });

  it('the cron does not send the TEST message', async () => {
    const cronPosts: MailBody[] = [];
    vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
      cronPosts.push(JSON.parse(String(init?.body)) as MailBody);
      return new Response(JSON.stringify({ id: 're_test' }), { status: 200 });
    });
    await (worker as unknown as { scheduled(event: unknown, env: Env): Promise<void> }).scheduled(
      {},
      env(),
    );
    expect(
      cronPosts.some((body) => body.subject.includes('TEST') || body.text.includes('TEST')),
    ).toBe(false);
    expect(logs.some((line) => line['event'] === OPERATOR_TEST_EVENT)).toBe(false);
  });
});
