/**
 * PH2-E3-01: /login/'s calls on the shared lib/api.ts client, against spec #350
 * §4 and §9, with no network.
 *
 * The property that matters: only `UNAUTHENTICATED` from the API is "signed
 * out". A Pages 404, an HTML page, JSON without the error envelope, an unknown
 * code or a network error is undetermined, never signed out and never sent.
 */
import { describe, expect, test } from 'vitest';
import type { FetchLike } from '../src/lib/api';
import {
  linkWallet,
  logout,
  readSession,
  requestChallenge,
  startEmail,
  unlinkWallet,
  verifyEmail,
} from '../src/lib/login';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
const envelope = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { error: { code, message: 'm', retryable: false, details: {} } }, headers);
const html = (status: number) =>
  new Response('<!doctype html><title>Evergreen</title>', {
    status,
    headers: { 'Content-Type': 'text/html' },
  });

interface Call {
  url: string;
  init: RequestInit | undefined;
}
function fake(...responses: (Response | Error)[]): { f: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next === undefined) throw new Error('unexpected call');
    if (next instanceof Error) throw next;
    return next;
  };
  return { f, calls };
}
const ME = {
  user: { id: 'u1', email: 'a@example.com', createdAt: '2026-10-23T00:00:00Z' },
  wallets: [],
  csrfToken: 'tok',
};
const headers = (c: Call) => c.init!.headers as Record<string, string>;

describe('readSession (GET /me)', () => {
  test('200 with §4’s shape is signed in, on the relative /api/v1 path', async () => {
    const { f, calls } = fake(json(200, ME));
    expect(await readSession(f)).toEqual({ kind: 'signed-in', me: ME });
    expect(calls[0]!.url).toBe('/api/v1/me');
    expect(calls[0]!.init!.credentials).toBe('same-origin');
  });

  test('UNAUTHENTICATED in the envelope is signed out', async () => {
    const { f } = fake(envelope(401, 'UNAUTHENTICATED'));
    expect(await readSession(f)).toEqual({ kind: 'signed-out' });
  });

  test.each([
    ['a Pages 404 page', () => html(404)],
    ['the site’s HTML with 200', () => html(200)],
    ['a 401 that is JSON without the envelope', () => json(401, { message: 'no' })],
    ['a 401 that is not JSON', () => new Response('nope', { status: 401 })],
    ['a code this client does not know', () => envelope(401, 'SESSION_GONE')],
    ['another known code', () => envelope(503, 'UPSTREAM_UNAVAILABLE')],
    ['200 JSON without §4’s fields', () => json(200, { ok: true })],
    [
      'JSON content type with a body that is not JSON',
      () => new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ],
  ])('%s is undetermined, never signed out', async (_name, make) => {
    const { f } = fake(make());
    const r = await readSession(f);
    expect(r.kind).toBe('undetermined');
  });

  test('a network error is undetermined', async () => {
    const { f } = fake(new TypeError('Failed to fetch'));
    expect(await readSession(f)).toEqual({
      kind: 'undetermined',
      detail: 'no response from the account service',
    });
  });

  test('the detail never carries the server’s message', async () => {
    const { f } = fake(
      json(500, {
        error: { code: 'UPSTREAM_UNAVAILABLE', message: 'secret-ish', retryable: true },
      }),
    );
    const r = await readSession(f);
    expect(r).toEqual({ kind: 'undetermined', detail: 'HTTP 500 UPSTREAM_UNAVAILABLE' });
  });
});

describe('startEmail (POST /auth/email/start)', () => {
  test('202 (JSON null, as apps/api answers) is sent; JSON body, no CSRF', async () => {
    const { f, calls } = fake(json(202, null));
    expect(await startEmail('a@example.com', f)).toEqual({ kind: 'sent' });
    expect(calls[0]!.url).toBe('/api/v1/auth/email/start');
    expect(calls[0]!.init!.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ email: 'a@example.com' });
    expect(headers(calls[0]!)['Content-Type']).toBe('application/json');
    expect(headers(calls[0]!)['X-Evergreen-CSRF']).toBeUndefined();
  });

  test('an empty 202 is sent too', async () => {
    const { f } = fake(new Response(null, { status: 202 }));
    expect(await startEmail('a@example.com', f)).toEqual({ kind: 'sent' });
  });

  test('a 202 with an HTML body is not the API: undetermined', async () => {
    const { f } = fake(
      new Response('<html>', { status: 202, headers: { 'Content-Type': 'text/html' } }),
    );
    expect((await startEmail('a@example.com', f)).kind).toBe('undetermined');
  });

  test('RATE_LIMITED carries Retry-After', async () => {
    const { f } = fake(envelope(429, 'RATE_LIMITED', { 'Retry-After': '120' }));
    expect(await startEmail('a@example.com', f)).toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 120,
    });
  });

  test('a 200 with JSON is not this route’s answer: undetermined, not sent', async () => {
    const { f } = fake(json(200, {}));
    expect((await startEmail('a@example.com', f)).kind).toBe('undetermined');
  });

  test('a Pages 404 is undetermined, not sent', async () => {
    const { f } = fake(html(404));
    expect((await startEmail('a@example.com', f)).kind).toBe('undetermined');
  });

  test('UPSTREAM_UNAVAILABLE is the API’s own answer: not-sent, with what was received and no server message', async () => {
    const { f } = fake(
      json(503, {
        error: { code: 'UPSTREAM_UNAVAILABLE', message: 'secret-ish', retryable: true },
      }),
    );
    expect(await startEmail('a@example.com', f)).toEqual({
      kind: 'not-sent',
      detail: 'HTTP 503 UPSTREAM_UNAVAILABLE',
    });
  });

  test('the branch is on the code, not the status', async () => {
    const { f } = fake(envelope(500, 'UPSTREAM_UNAVAILABLE'));
    expect(await startEmail('a@example.com', f)).toEqual({
      kind: 'not-sent',
      detail: 'HTTP 500 UPSTREAM_UNAVAILABLE',
    });
  });

  test.each([
    ['a bare 503 with an HTML body', () => html(503)],
    ['a 503 JSON without the envelope', () => json(503, { message: 'down' })],
    ['a 503 with a code this client does not know', () => envelope(503, 'MAIL_DOWN')],
    ['a 500 with a known code that is not this one', () => envelope(500, 'NOT_FOUND')],
  ])('%s stays undetermined, never not-sent and never sent', async (_n, make) => {
    const { f } = fake(make());
    expect((await startEmail('a@example.com', f)).kind).toBe('undetermined');
  });

  test('a network error stays undetermined', async () => {
    const { f } = fake(new TypeError('Failed to fetch'));
    expect(await startEmail('a@example.com', f)).toEqual({
      kind: 'undetermined',
      detail: 'no response from the account service',
    });
  });
});

describe('verifyEmail (POST /auth/email/verify)', () => {
  test('200 is verified', async () => {
    const { f, calls } = fake(json(200, {}));
    expect(await verifyEmail('a@example.com', '123456', f)).toEqual({ kind: 'verified' });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      email: 'a@example.com',
      code: '123456',
    });
  });

  test('CODE_INVALID is code-invalid', async () => {
    const { f } = fake(envelope(400, 'CODE_INVALID'));
    expect(await verifyEmail('a@example.com', '1', f)).toEqual({ kind: 'code-invalid' });
  });

  test('an unknown code is undetermined', async () => {
    const { f } = fake(envelope(400, 'CODE_WEIRD'));
    expect((await verifyEmail('a@example.com', '1', f)).kind).toBe('undetermined');
  });
});

describe('wallet linking (POST /wallets/challenge, POST /wallets)', () => {
  test('challenge 200 with both fields; CSRF from GET /me is sent', async () => {
    const { f, calls } = fake(
      json(200, { challengeXdr: 'AAA', networkPassphrase: 'P', expiresAt: 'x' }),
    );
    expect(await requestChallenge('GABC', 'tok', f)).toEqual({
      kind: 'challenge',
      challenge: { challengeXdr: 'AAA', networkPassphrase: 'P' },
    });
    expect(calls[0]!.url).toBe('/api/v1/wallets/challenge');
    expect(headers(calls[0]!)['X-Evergreen-CSRF']).toBe('tok');
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ account: 'GABC' });
  });

  test('challenge 200 missing a field is undetermined', async () => {
    const { f } = fake(json(200, { challengeXdr: 'AAA' }));
    expect((await requestChallenge('GABC', 'tok', f)).kind).toBe('undetermined');
  });

  test('challenge UNAUTHENTICATED is signed out', async () => {
    const { f } = fake(envelope(401, 'UNAUTHENTICATED'));
    expect(await requestChallenge('GABC', 'tok', f)).toEqual({ kind: 'signed-out' });
  });

  test.each([
    [201, 'linked'],
    [200, 'linked'],
  ])('POST /wallets %i is %s', async (status, kind) => {
    const { f, calls } = fake(json(status, { wallet: { account: 'GABC' } }));
    expect((await linkWallet('SIGNED', 'tok', f)).kind).toBe(kind);
    expect(calls[0]!.url).toBe('/api/v1/wallets');
    expect(headers(calls[0]!)['X-Evergreen-CSRF']).toBe('tok');
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ challengeXdr: 'SIGNED' });
  });

  test.each([
    ['WALLET_LINKED_ELSEWHERE', 409, 'linked-elsewhere'],
    ['CHALLENGE_INVALID', 400, 'challenge-invalid'],
    ['CSRF_FAILED', 403, 'csrf-failed'],
    ['UNAUTHENTICATED', 401, 'signed-out'],
    ['NOT_A_CODE', 409, 'undetermined'],
  ])('%s is %s', async (code, status, kind) => {
    const { f } = fake(envelope(status, code));
    expect((await linkWallet('SIGNED', 'tok', f)).kind).toBe(kind);
  });

  test('a 409 without the envelope is undetermined, not linked-elsewhere', async () => {
    const { f } = fake(json(409, {}));
    expect((await linkWallet('SIGNED', 'tok', f)).kind).toBe('undetermined');
  });
});

describe('logout (POST /auth/logout) and unlink (DELETE /wallets/{account})', () => {
  test('logout 204 is signed out, with CSRF', async () => {
    const { f, calls } = fake(new Response(null, { status: 204 }));
    expect(await logout('tok', f)).toEqual({ kind: 'signed-out' });
    expect(calls[0]!.url).toBe('/api/v1/auth/logout');
    expect(calls[0]!.init!.method).toBe('POST');
    expect(headers(calls[0]!)['X-Evergreen-CSRF']).toBe('tok');
  });

  test('logout UNAUTHENTICATED is the same end state', async () => {
    const { f } = fake(envelope(401, 'UNAUTHENTICATED'));
    expect(await logout('tok', f)).toEqual({ kind: 'signed-out' });
  });

  test.each([
    ['a Pages 404', () => html(404)],
    ['a 200 HTML page', () => html(200)],
    ['an unknown code', () => envelope(400, 'NOPE')],
  ])('logout: %s is undetermined, not signed out', async (_n, make) => {
    const { f } = fake(make());
    expect((await logout('tok', f)).kind).toBe('undetermined');
  });

  test('unlink 204 is unlinked; the account is path-encoded; CSRF sent', async () => {
    const { f, calls } = fake(new Response(null, { status: 204 }));
    expect(await unlinkWallet('GABC', 'tok', f)).toEqual({ kind: 'unlinked' });
    expect(calls[0]!.url).toBe('/api/v1/wallets/GABC');
    expect(calls[0]!.init!.method).toBe('DELETE');
    expect(headers(calls[0]!)['X-Evergreen-CSRF']).toBe('tok');
  });

  test.each([
    ['WALLET_PAYS_FOR_WATCHED_CONTRACT', 409, 'pays-for-watched'],
    ['CSRF_FAILED', 403, 'csrf-failed'],
    ['UNAUTHENTICATED', 401, 'signed-out'],
    ['NOT_FOUND', 404, 'undetermined'],
  ])('unlink %s is %s', async (code, status, kind) => {
    const { f } = fake(envelope(status, code));
    expect((await unlinkWallet('GABC', 'tok', f)).kind).toBe(kind);
  });

  test('unlink: a success status #350 does not state is undetermined', async () => {
    const { f } = fake(json(200, {}));
    expect((await unlinkWallet('GABC', 'tok', f)).kind).toBe('undetermined');
  });
});
