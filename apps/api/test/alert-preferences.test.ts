/**
 * PH2-E2-06 alert preferences (docs/API.md §6a), through the Worker's `handle`.
 * The store is in memory and the global `fetch` throws: nothing here touches
 * the network or Resend. A preference never authorises a transaction.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALERT_PREFERENCE_PATH,
  ALERT_PREFERENCE_WRITE_ROUTES,
  ALERT_SPECS,
  API_BASE,
  CSRF_HEADER,
  MemoryAlertPreferencesStore,
  MemoryAuthStore,
  handle,
  isRequired,
  alertPreferencesDepsFor,
  parsePreferencePatch,
  preferenceItems,
  type AlertKind,
  type Env,
  type HandleOptions,
  type PreferenceItem,
  type PreferenceRow,
} from '../src/index.js';

const ORIGIN = 'https://dashboard.example.test';
const START = 1_800_000_000;
const EMAIL = 'a@alerts.example.test';
const OTHER = 'b@alerts.example.test';

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

interface Opts {
  body?: unknown;
  rawBody?: string;
  cookie?: string;
  csrf?: string;
  origin?: string | null;
}

function req(method: string, path: string, o: Opts = {}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (o.origin !== null) headers.set('origin', o.origin ?? ORIGIN);
  if (o.cookie !== undefined) headers.set('cookie', o.cookie);
  if (o.csrf !== undefined) headers.set(CSRF_HEADER, o.csrf);
  const body =
    o.rawBody !== undefined ? o.rawBody : o.body === undefined ? undefined : JSON.stringify(o.body);
  return new Request(`${ORIGIN}${API_BASE}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

const call = (method: string, path: string, o: Opts = {}) =>
  handle(req(method, path, o), env, options);

interface Session {
  cookie: string;
  csrf: string;
  userId: string;
  email: string;
}

async function signIn(email = EMAIL): Promise<Session> {
  expect((await call('POST', '/auth/email/start', { body: { email } })).status).toBe(202);
  const code = /\b(\d{8})\b/.exec((JSON.parse(sent.at(-1)!) as { text: string }).text)![1]!;
  const res = await call('POST', '/auth/email/verify', { body: { email, code } });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const me = (await (await call('GET', '/me', { cookie })).json()) as {
    csrfToken: string;
    user: { id: string };
  };
  return { cookie, csrf: me.csrfToken, userId: me.user.id, email };
}

const write = (s: Session, body: unknown) =>
  call('PATCH', ALERT_PREFERENCE_PATH, { cookie: s.cookie, csrf: s.csrf, body });
const read = (s: Session, origin: string | null = ORIGIN) =>
  call('GET', ALERT_PREFERENCE_PATH, { cookie: s.cookie, origin });

const errorOf = async (res: Response) =>
  (
    (await res.json()) as {
      error: { code: string; message: string; retryable: boolean; details: { field?: string } };
    }
  ).error;

const bodyText = (res: Response): Promise<string> => res.text();

const itemsOf = async (res: Response) => ((await res.json()) as { items: PreferenceItem[] }).items;

function snapshot(): string {
  const out: Record<string, Record<string, PreferenceRow>> = {};
  for (const [userId, kinds] of prefs.rows) {
    out[userId] = {};
    for (const [kind, row] of kinds) out[userId]![kind] = row;
  }
  return JSON.stringify(out);
}

const item = (items: readonly PreferenceItem[], kind: AlertKind) => {
  const found = items.find((row) => row.kind === kind);
  if (found === undefined) throw new Error(`missing ${kind}`);
  return found;
};

describe('parsePreferencePatch', () => {
  it('accepts a boolean set and a reset, and nothing else', () => {
    expect(parsePreferencePatch({ kind: 'extend_succeeded', enabled: false })).toEqual({
      ok: true,
      value: { action: 'set', kind: 'extend_succeeded', enabled: false },
    });
    expect(parsePreferencePatch({ kind: 'approaching_critical', reset: true })).toEqual({
      ok: true,
      value: { action: 'reset', kind: 'approaching_critical' },
    });
  });

  it('refuses a required kind with 422 and does not echo the sent kind', () => {
    const parsed = parsePreferencePatch({ kind: 'preflight_failed', enabled: false });
    expect(parsed).toEqual({
      ok: false,
      status: 422,
      field: 'kind',
      message: 'This alert is required and cannot be turned off.',
    });
    expect(JSON.stringify(parsed)).not.toContain('preflight_failed');
  });

  it.each([
    [null, 'body'],
    [[], 'body'],
    [{ enabled: false }, 'kind'],
    [{ kind: 'extend_succeeded' }, 'body'],
    [{ kind: 'extend_succeeded', enabled: false, reset: true }, 'body'],
    [{ kind: 'extend_succeeded', enabled: 'false' }, 'enabled'],
    [{ kind: 'extend_succeeded', reset: false }, 'reset'],
    [{ kind: 'nope', enabled: true }, 'kind'],
    [{ kind: 'extend_succeeded', enabled: true, userId: 'someone' }, 'userId'],
  ])('refuses %j on %s', (body, field) => {
    const parsed = parsePreferencePatch(body);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.field).toBe(field);
    if (!parsed.ok) expect(parsed.status).toBe(400);
  });
});

describe('preferenceItems', () => {
  it('keeps a required kind on even when a row says false', () => {
    const items = preferenceItems({ preflight_failed: false, extend_succeeded: false });
    expect(item(items, 'preflight_failed')).toMatchObject({
      class: 'required',
      enabled: true,
      stored: false,
    });
    expect(item(items, 'extend_succeeded')).toMatchObject({
      class: 'optional',
      enabled: false,
      stored: true,
      defaultOn: true,
    });
    expect(items.map((row) => row.kind)).toEqual(Object.keys(ALERT_SPECS));
  });
});

describe('GET and PATCH /me/alert-preferences', () => {
  it('lists exactly the one write route', () => {
    expect(ALERT_PREFERENCE_WRITE_ROUTES).toEqual([['PATCH', ALERT_PREFERENCE_PATH]]);
  });

  it('GET and PATCH without a session are 401 and write nothing', async () => {
    for (const method of ['GET', 'PATCH'] as const) {
      const before = snapshot();
      const res = await call(method, ALERT_PREFERENCE_PATH, {
        ...(method === 'PATCH' ? { body: { kind: 'extend_succeeded', enabled: false } } : {}),
      });
      expect(res.status).toBe(401);
      expect((await errorOf(res)).code).toBe('UNAUTHENTICATED');
      expect(snapshot()).toBe(before);
    }
  });

  it.each([
    ['missing token', { csrf: undefined, origin: ORIGIN }],
    ['wrong token', { csrf: 'not-the-token', origin: ORIGIN }],
    ['wrong origin', { csrf: 'use-session', origin: 'https://evil.example.test' }],
    ['missing origin', { csrf: 'use-session', origin: null }],
  ] as const)('PATCH with a %s is 403 and writes nothing', async (_label, over) => {
    const s = await signIn();
    const before = snapshot();
    const res = await call('PATCH', ALERT_PREFERENCE_PATH, {
      cookie: s.cookie,
      csrf: over.csrf === 'use-session' ? s.csrf : over.csrf,
      origin: over.origin,
      body: { kind: 'extend_succeeded', enabled: false },
    });
    expect(res.status).toBe(403);
    const error = await errorOf(res);
    expect(error.code).toBe('CSRF_FAILED');
    expect(error.retryable).toBe(false);
    expect(snapshot()).toBe(before);
  });

  it('GET needs a session and no CSRF, and never returns the address', async () => {
    const s = await signIn();
    const res = await read(s, null);
    expect(res.status).toBe(200);
    const text = await bodyText(res);
    expect(text).not.toContain('@');
    expect(text).not.toContain(s.email);
    expect(text).not.toContain(s.userId);
    const items = (JSON.parse(text) as { items: PreferenceItem[] }).items;
    expect(items.map((row) => row.kind)).toEqual(Object.keys(ALERT_SPECS));
    for (const row of items) {
      expect(row.enabled).toBe(true);
      expect(row.stored).toBe(false);
      expect(row.class).toBe(isRequired(row.kind) ? 'required' : 'optional');
    }
  });

  it('PATCH turns one optional kind off for that user only', async () => {
    const a = await signIn(EMAIL);
    const b = await signIn(OTHER);
    const res = await write(a, { kind: 'extend_succeeded', enabled: false });
    expect(res.status).toBe(200);
    const text = await bodyText(res);
    expect(text).not.toContain(a.email);
    expect(text).not.toContain('@');
    const mine = (JSON.parse(text) as { items: PreferenceItem[] }).items;
    expect(item(mine, 'extend_succeeded')).toMatchObject({ enabled: false, stored: true });
    expect(item(mine, 'approaching_critical').enabled).toBe(true);
    const row = prefs.rows.get(a.userId)?.get('extend_succeeded');
    expect(row).toEqual({ enabled: false, updatedAt: START });
    expect(prefs.rows.has(b.userId)).toBe(false);
    const other = await itemsOf(await read(b));
    expect(item(other, 'extend_succeeded')).toMatchObject({ enabled: true, stored: false });
  });

  it('refuses a required kind with 422 and leaves the store empty', async () => {
    const s = await signIn();
    for (const enabled of [false, true]) {
      const before = snapshot();
      const res = await write(s, { kind: 'refund_delayed', enabled });
      expect(res.status).toBe(422);
      const error = await errorOf(res);
      expect(error.code).toBe('INVALID_REQUEST');
      expect(error.details.field).toBe('kind');
      expect(error.retryable).toBe(false);
      expect(error.message).not.toContain('refund_delayed');
      expect(snapshot()).toBe(before);
    }
  });

  it.each([
    [{ kind: 'extend_succeeded', enabled: false, userId: 'other-user' }, 'userId'],
    [{ kind: 'not-a-kind', enabled: true }, 'kind'],
    [{ kind: 'extend_succeeded', enabled: 'false' }, 'enabled'],
    [{ kind: 'extend_succeeded', enabled: false, reset: true }, 'body'],
    [{ kind: 'extend_succeeded' }, 'body'],
    [{ kind: 'allowance_expiring', reset: false }, 'reset'],
  ])('refuses %j and writes nothing', async (body, field) => {
    const s = await signIn();
    const before = snapshot();
    const res = await write(s, body);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).details.field).toBe(field);
    expect(snapshot()).toBe(before);
  });

  it('refuses a body that is not JSON', async () => {
    const s = await signIn();
    const res = await call('PATCH', ALERT_PREFERENCE_PATH, {
      cookie: s.cookie,
      csrf: s.csrf,
      rawBody: 'not-json',
    });
    expect(res.status).toBe(400);
    expect(snapshot()).toBe('{}');
  });

  it('reset updates the row back to the default and does not delete it', async () => {
    const s = await signIn();
    expect((await write(s, { kind: 'approaching_critical', enabled: false })).status).toBe(200);
    clock = START + 50;
    const res = await write(s, { kind: 'approaching_critical', reset: true });
    expect(res.status).toBe(200);
    expect(item(await itemsOf(res), 'approaching_critical')).toMatchObject({
      enabled: true,
      stored: true,
      defaultOn: true,
    });
    expect(prefs.rows.get(s.userId)?.get('approaching_critical')).toEqual({
      enabled: true,
      updatedAt: START + 50,
    });
  });

  it('reset with no row leaves the store empty', async () => {
    const s = await signIn();
    const res = await write(s, { kind: 'allowance_expiring', reset: true });
    expect(res.status).toBe(200);
    expect(item(await itemsOf(res), 'allowance_expiring')).toMatchObject({
      enabled: true,
      stored: false,
    });
    expect(snapshot()).toBe('{}');
  });

  it('POST and DELETE are 405 and write nothing', async () => {
    const s = await signIn();
    const before = snapshot();
    for (const method of ['POST', 'DELETE', 'PUT']) {
      const res = await call(method, ALERT_PREFERENCE_PATH, {
        cookie: s.cookie,
        csrf: s.csrf,
        body: { kind: 'extend_succeeded', enabled: false },
      });
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('GET, PATCH');
      expect((await errorOf(res)).code).toBe('METHOD_NOT_ALLOWED');
    }
    expect(snapshot()).toBe(before);
  });

  it('a missing store is refused before the route runs', () => {
    expect(
      alertPreferencesDepsFor(env, { ...options, createAlertPreferencesStore: () => undefined }),
    ).toBeUndefined();
  });

  it('a missing database, origin or store is 503 and names no setting', async () => {
    const s = await signIn();
    const noDb = await handle(
      req('GET', ALERT_PREFERENCE_PATH, { cookie: s.cookie }),
      { ...env, DATABASE_URL: undefined },
      options,
    );
    const noOrigin = await handle(
      req('GET', ALERT_PREFERENCE_PATH, { cookie: s.cookie }),
      { ...env, DASHBOARD_ORIGIN: undefined },
      options,
    );
    const noStore = await handle(req('GET', ALERT_PREFERENCE_PATH, { cookie: s.cookie }), env, {
      ...options,
      createAlertPreferencesStore: () => undefined,
    });
    for (const res of [noDb, noOrigin, noStore]) {
      expect(res.status).toBe(503);
      const error = await errorOf(res);
      expect(error.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(error.retryable).toBe(true);
      expect(error.message).not.toMatch(/DATABASE|ORIGIN|SECRET|KEY/i);
    }
  });
});
