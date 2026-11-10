/**
 * PH2-E2-06 one-click unsubscribe (RFC 8058), through the Worker's `handle`.
 * The store is in memory and global `fetch` throws: nothing here touches the
 * network. The route updates optional alert preferences only. It does not
 * send mail and does not move XLM.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALERT_PREFERENCE_PATH,
  ALERT_UNSUBSCRIBE_PATH,
  API_BASE,
  CSRF_HEADER,
  MemoryAlertPreferencesStore,
  MemoryAuthStore,
  PUBLIC_API_BASE,
  UNSUBSCRIBE_TTL_SECONDS,
  alertPreferencesPageUrl,
  alertUnsubscribeUrl,
  handle,
  mintUnsubscribeToken,
  type AlertKind,
  type Env,
  type HandleOptions,
} from '../src/index.js';

const ORIGIN = 'https://dashboard.example.test';
const START = 1_800_000_000;
const SECRET = 'test-unsubscribe-secret';
const EMAIL = 'a@alerts.example.test';
const PATH = ALERT_UNSUBSCRIBE_PATH;

let clock: number;
let auth: MemoryAuthStore;
let prefs: MemoryAlertPreferencesStore;
let sent: string[];
let env: Env;
let options: HandleOptions;

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is off in tests');
  });
  clock = START;
  auth = new MemoryAuthStore(() => clock);
  prefs = new MemoryAlertPreferencesStore();
  sent = [];
  env = {
    DATABASE_URL: 'postgres://user:pw@db.invalid/evergreen',
    SIGNIN_CODE_PEPPER: 'test-pepper-not-a-secret',
    EMAIL_API_KEY: 're_test_not_a_key',
    CHALLENGE_SIGNING_KEY: Keypair.random().secret(),
    EMAIL_FROM: 'Evergreen <signin@example.test>',
    DASHBOARD_ORIGIN: ORIGIN,
    ALERTS_UNSUBSCRIBE_SECRET: SECRET,
  };
  options = {
    createStore: () => auth,
    createAlertPreferencesStore: () => prefs,
    now: () => clock,
    fetch: ((_url: string, init: RequestInit) => {
      sent.push(String(init.body));
      return Promise.resolve(new Response('{"id":"x"}', { status: 200 }));
    }) as unknown as typeof fetch,
  };
});

afterEach(() => vi.unstubAllGlobals());

const stored = () => JSON.stringify([...prefs.rows.entries()]);

async function signIn(): Promise<{ userId: string; cookie: string; csrf: string }> {
  expect(
    (await handle(jsonReq('POST', '/auth/email/start', { email: EMAIL }), env, options)).status,
  ).toBe(202);
  const code = /\b(\d{8})\b/.exec((JSON.parse(sent.at(-1)!) as { text: string }).text)![1]!;
  const res = await handle(
    jsonReq('POST', '/auth/email/verify', { email: EMAIL, code }),
    env,
    options,
  );
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const me = (await (
    await handle(jsonReq('GET', '/me', undefined, cookie), env, options)
  ).json()) as {
    csrfToken: string;
    user: { id: string };
  };
  return { userId: me.user.id, cookie, csrf: me.csrfToken };
}

function jsonReq(method: string, path: string, body?: unknown, cookie?: string): Request {
  const headers = new Headers({ origin: ORIGIN, 'content-type': 'application/json' });
  if (cookie !== undefined) headers.set('cookie', cookie);
  return new Request(`${ORIGIN}${API_BASE}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function unsubscribeRequest(
  method: string,
  token: string | undefined,
  init: { body?: string; contentType?: string | null; origin?: string | null } = {},
): Request {
  const query = token === undefined ? '' : `?token=${encodeURIComponent(token)}`;
  const headers = new Headers();
  if (init.origin !== null) headers.set('origin', init.origin ?? 'https://mail.example');
  if (init.contentType !== null) {
    headers.set('content-type', init.contentType ?? 'application/x-www-form-urlencoded');
  }
  const body = init.body === undefined ? 'List-Unsubscribe=One-Click' : init.body;
  return new Request(`${ORIGIN}${API_BASE}${PATH}${query}`, {
    method,
    headers,
    ...(method === 'GET' ? {} : { body }),
  });
}

const post = (token: string | undefined, init?: Parameters<typeof unsubscribeRequest>[2]) =>
  handle(unsubscribeRequest('POST', token, init), env, options);

async function tokenFor(userId: string, at = START): Promise<string> {
  const token = await mintUnsubscribeToken(SECRET, userId, at);
  expect(token).toBeDefined();
  return token!;
}

function tamper(token: string): string {
  const last = token.endsWith('a') ? 'b' : 'a';
  return token.slice(0, -1) + last;
}

describe('unsubscribe URL', () => {
  it('uses the dashboard origin and the public API base, and has no mailto', async () => {
    expect(PUBLIC_API_BASE).toBe(API_BASE);
    expect(alertPreferencesPageUrl(ORIGIN)).toBe(`${ORIGIN}/dashboard/alerts/`);
    const token = await tokenFor('user-1');
    expect(alertUnsubscribeUrl(ORIGIN, token)).toBe(`${ORIGIN}${API_BASE}${PATH}?token=${token}`);
    expect(alertUnsubscribeUrl('http://dashboard.example.test', token)).toBeUndefined();
    expect(alertUnsubscribeUrl(`${ORIGIN}/extra`, token)).toBeUndefined();
    expect(alertUnsubscribeUrl(ORIGIN, 'not-a-token')).toBeUndefined();
    expect(alertPreferencesPageUrl(ORIGIN)).not.toContain('mailto:');
  });
});

describe('POST /alerts/unsubscribe', () => {
  it('a valid token sets every optional kind to false and leaves a required kind enabled', async () => {
    const s = await signIn();
    await prefs.set(s.userId, 'preflight_failed', true, 1);
    await prefs.set(s.userId, 'extend_succeeded', true, 1);
    const beforeRequired = prefs.rows.get(s.userId)?.get('preflight_failed');
    const token = await tokenFor(s.userId);
    const res = await post(token, { origin: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const mine = prefs.rows.get(s.userId);
    expect(mine?.get('allowance_expiring')).toEqual({ enabled: false, updatedAt: START });
    expect(mine?.get('approaching_critical')).toEqual({ enabled: false, updatedAt: START });
    expect(mine?.get('extend_succeeded')).toEqual({ enabled: false, updatedAt: START });
    expect(mine?.get('preflight_failed')).toEqual(beforeRequired);
    expect([...mine!.keys()].filter((k) => k === ('preflight_failed' as AlertKind))).toHaveLength(
      1,
    );
  });

  it('a second POST stays off and does not add rows', async () => {
    const s = await signIn();
    const token = await tokenFor(s.userId);
    expect((await post(token)).status).toBe(200);
    const afterFirst = stored();
    expect((await post(token)).status).toBe(200);
    expect(stored()).toBe(afterFirst);
    expect(prefs.rows.get(s.userId)?.size).toBe(3);
    for (const row of prefs.rows.get(s.userId)!.values()) expect(row.enabled).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
  ])('a %s token does not write', async (_name, token) => {
    const s = await signIn();
    await prefs.set(s.userId, 'extend_succeeded', true, 1);
    const before = stored();
    const res = await post(token);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'INVALID_REQUEST',
        message: 'This unsubscribe link is not valid.',
        retryable: false,
        details: {},
      },
    });
    expect(stored()).toBe(before);
  });

  it('a tampered token does not write, and the error matches a wrong body', async () => {
    const s = await signIn();
    await prefs.set(s.userId, 'extend_succeeded', true, 1);
    const token = await tokenFor(s.userId);
    const before = stored();
    const tampered = await post(tamper(token));
    const wrongBody = await post(token, { body: 'List-Unsubscribe=Please' });
    expect(tampered.status).toBe(400);
    expect(await tampered.text()).toBe(await wrongBody.text());
    expect(stored()).toBe(before);
  });

  it('an expired token does not write, and the expiry second still does', async () => {
    const s = await signIn();
    await prefs.set(s.userId, 'extend_succeeded', true, 1);
    const token = await tokenFor(s.userId, START);
    clock = START + UNSUBSCRIBE_TTL_SECONDS + 1;
    const before = stored();
    const expired = await post(token);
    expect(expired.status).toBe(400);
    expect(stored()).toBe(before);
    clock = START + UNSUBSCRIBE_TTL_SECONDS;
    expect((await post(token)).status).toBe(200);
    expect(prefs.rows.get(s.userId)?.get('extend_succeeded')?.enabled).toBe(false);
  });

  it('a token signed with another secret does not write', async () => {
    const s = await signIn();
    await prefs.set(s.userId, 'extend_succeeded', true, 1);
    const token = await mintUnsubscribeToken('other-test-secret', s.userId, START);
    const before = stored();
    expect((await post(token)).status).toBe(400);
    expect(stored()).toBe(before);
  });

  it('a missing or blank secret answers 503 and writes nothing', async () => {
    const s = await signIn();
    await prefs.set(s.userId, 'extend_succeeded', true, 1);
    const token = await tokenFor(s.userId);
    const before = stored();
    delete env.ALERTS_UNSUBSCRIBE_SECRET;
    const missing = await post(token);
    expect(missing.status).toBe(503);
    const missingText = await missing.text();
    expect(JSON.parse(missingText)).toMatchObject({
      error: { code: 'UPSTREAM_UNAVAILABLE' },
    });
    expect(missingText).not.toContain('ALERTS_UNSUBSCRIBE');
    env.ALERTS_UNSUBSCRIBE_SECRET = '   ';
    expect((await post(token)).status).toBe(503);
    expect(stored()).toBe(before);
    const prefsRes = await handle(
      jsonReq('GET', ALERT_PREFERENCE_PATH, undefined, s.cookie),
      env,
      options,
    );
    expect(prefsRes.status).toBe(200);
  });

  it('GET does not write, including with a valid token and a one-click body', async () => {
    const s = await signIn();
    await prefs.set(s.userId, 'extend_succeeded', true, 1);
    const token = await tokenFor(s.userId);
    const before = stored();
    const res = await handle(
      unsubscribeRequest('GET', token, { body: 'List-Unsubscribe=One-Click' }),
      env,
      options,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(stored()).toBe(before);
  });

  it('a deactivated user and an unknown user are a no-op success', async () => {
    const s = await signIn();
    await prefs.set(s.userId, 'extend_succeeded', true, 1);
    const token = await tokenFor(s.userId);
    const before = stored();
    auth.getUser = () => Promise.resolve(undefined);
    const deactivated = await post(token);
    expect(deactivated.status).toBe(200);
    expect(await deactivated.json()).toEqual({ ok: true });
    expect(stored()).toBe(before);
    const unknown = await mintUnsubscribeToken(
      SECRET,
      '33333333-3333-4333-8333-333333333333',
      START,
    );
    auth.getUser = MemoryAuthStore.prototype.getUser.bind(auth);
    expect((await post(unknown)).status).toBe(200);
    expect(stored()).toBe(before);
    expect(prefs.rows.has('33333333-3333-4333-8333-333333333333')).toBe(false);
  });

  it('the response carries no address, token, or secret', async () => {
    const s = await signIn();
    const token = await tokenFor(s.userId);
    const ok = await (await post(token)).text();
    const bad = await (await post(tamper(token))).text();
    for (const text of [ok, bad]) {
      expect(text).not.toContain(EMAIL);
      expect(text).not.toContain(token);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('@');
    }
  });

  it('does not require a session, CSRF, or the dashboard origin', async () => {
    const s = await signIn();
    const token = await tokenFor(s.userId);
    const res = await post(token, { origin: 'https://mail.example' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(prefs.rows.get(s.userId)?.get('allowance_expiring')?.enabled).toBe(false);
  });

  it('refuses the wrong content type and an extra form field without writing', async () => {
    const s = await signIn();
    await prefs.set(s.userId, 'extend_succeeded', true, 1);
    const token = await tokenFor(s.userId);
    const before = stored();
    expect((await post(token, { contentType: 'application/json', body: '{}' })).status).toBe(400);
    expect(
      (await post(token, { body: 'List-Unsubscribe=One-Click&kind=extend_succeeded' })).status,
    ).toBe(400);
    expect(stored()).toBe(before);
  });

  it('PUT is 405 and the preferences route is unchanged', async () => {
    const res = await handle(unsubscribeRequest('PUT', 'x'), env, options);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
    const s = await signIn();
    const headers = new Headers({
      origin: ORIGIN,
      'content-type': 'application/json',
      cookie: s.cookie,
      [CSRF_HEADER]: s.csrf,
    });
    const written = await handle(
      new Request(`${ORIGIN}${API_BASE}${ALERT_PREFERENCE_PATH}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ kind: 'extend_succeeded', enabled: false }),
      }),
      env,
      options,
    );
    expect(written.status).toBe(200);
    expect(prefs.rows.get(s.userId)?.get('extend_succeeded')?.enabled).toBe(false);
    expect(prefs.rows.get(s.userId)?.has('allowance_expiring')).toBe(false);
  });
});
