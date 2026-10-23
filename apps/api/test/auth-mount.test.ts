/**
 * PH2-E2-04 mount: session rotation (option 2), the Worker router wiring and
 * the 503 without a database. Never touches the network: `fetch` is injected,
 * and the global one throws.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE,
  AUTH_SECRET_NAMES,
  AUTH_WRITE_ROUTES,
  CSRF_HEADER,
  MemoryAuthStore,
  ResendMailer,
  SESSION_ROTATE_AFTER_SECONDS,
  SESSION_ROTATION_GRACE_SECONDS,
  handle,
  hashSessionToken,
  type Env,
  type MountOptions,
} from '../src/index.js';

const ORIGIN = 'https://dashboard.example.test';
const START = 1_800_000_000;
const DAY = 86_400;

interface Sent {
  url: string;
  init: RequestInit;
}

let clock: number;
let store: MemoryAuthStore;
let sent: Sent[];
let env: Env;
let options: MountOptions;

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is off in tests');
  });
  clock = START;
  store = new MemoryAuthStore(() => clock);
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
    createStore: () => store,
    now: () => clock,
    fetch: ((url: string, init: RequestInit) => {
      sent.push({ url, init });
      return Promise.resolve(new Response('{"id":"x"}', { status: 200 }));
    }) as unknown as typeof fetch,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function req(
  method: string,
  path: string,
  o: { body?: unknown; cookie?: string; csrf?: string; origin?: string } = {},
): Request {
  const headers = new Headers({ 'content-type': 'application/json', origin: o.origin ?? ORIGIN });
  if (o.cookie !== undefined) headers.set('cookie', o.cookie);
  if (o.csrf !== undefined) headers.set(CSRF_HEADER, o.csrf);
  return new Request(`${ORIGIN}${API_BASE}${path}`, {
    method,
    headers,
    ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }),
  });
}

const call = (method: string, path: string, o: Parameters<typeof req>[2] = {}) =>
  handle(req(method, path, o), env, options);

const cookieOf = (res: Response) => res.headers.get('set-cookie')?.split(';')[0];

function lastCode(): string {
  const body = JSON.parse(String(sent.at(-1)!.init.body)) as { text: string };
  return /\b(\d{8})\b/.exec(body.text)![1]!;
}

async function signIn(email = 'a@example.test', cookie?: string) {
  expect((await call('POST', '/auth/email/start', { body: { email } })).status).toBe(202);
  const res = await call('POST', '/auth/email/verify', {
    body: { email, code: lastCode() },
    ...(cookie === undefined ? {} : { cookie }),
  });
  expect(res.status).toBe(200);
  const c = cookieOf(res)!;
  const me = (await (await call('GET', '/me', { cookie: c })).json()) as { csrfToken: string };
  return { cookie: c, csrf: me.csrfToken };
}

const tokenOf = (cookie: string) => cookie.split('=')[1]!;

describe('rotation constants (option 2)', () => {
  it('rotates after 24 h with a 60 s grace window', () => {
    expect(SESSION_ROTATE_AFTER_SECONDS).toBe(24 * 60 * 60);
    expect(SESSION_ROTATION_GRACE_SECONDS).toBe(60);
  });
});

describe('session rotation', () => {
  it('does not rotate a token at exactly 24 h, and rotates it after', async () => {
    const s = await signIn();
    clock = START + SESSION_ROTATE_AFTER_SECONDS;
    const same = await call('GET', '/me', { cookie: s.cookie });
    expect(same.status).toBe(200);
    expect(same.headers.get('set-cookie')).toBeNull();

    clock += 1;
    const rotated = await call('GET', '/me', { cookie: s.cookie });
    expect(rotated.status).toBe(200);
    const next = cookieOf(rotated)!;
    expect(next).toMatch(/^__Host-evergreen_session=/);
    expect(next).not.toBe(s.cookie);
    expect(rotated.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Lax; Path=\//);

    const newRow = store.sessions.get(await hashSessionToken(tokenOf(next)))!;
    const oldHash = await hashSessionToken(tokenOf(s.cookie));
    expect(newRow.rotatedFrom).toBe(oldHash);
    expect(newRow.csrfToken).toBe(s.csrf);
    expect(newRow.absoluteExpiresAt).toBe(START + 30 * DAY);
    expect(store.sessions.get(oldHash)!.absoluteExpiresAt).toBe(
      clock + SESSION_ROTATION_GRACE_SECONDS,
    );
  });

  it('keeps the old token working inside the grace window, without rotating it again', async () => {
    const s = await signIn();
    clock = START + SESSION_ROTATE_AFTER_SECONDS + 1;
    const next = cookieOf(await call('GET', '/me', { cookie: s.cookie }))!;
    const rotatedAt = clock;

    clock = rotatedAt + SESSION_ROTATION_GRACE_SECONDS - 1;
    const inGrace = await call('GET', '/me', { cookie: s.cookie });
    expect(inGrace.status).toBe(200);
    expect(inGrace.headers.get('set-cookie')).toBeNull();
    expect(store.sessions.size).toBe(2);

    // A write with the old token and the (unchanged) CSRF token still passes in grace.
    const w = await call('POST', '/wallets/challenge', {
      cookie: s.cookie,
      csrf: s.csrf,
      body: { account: Keypair.random().publicKey() },
    });
    expect(w.status).toBe(200);

    clock = rotatedAt + SESSION_ROTATION_GRACE_SECONDS;
    expect((await call('GET', '/me', { cookie: s.cookie })).status).toBe(401);
    expect((await call('GET', '/me', { cookie: next })).status).toBe(200);
  });

  it('🔴 never extends a session past its absolute expiry (30 days from login)', async () => {
    let s = await signIn();
    // Use it every 6 days: inside the idle limit, rotating each time.
    for (let day = 6; day < 30; day += 6) {
      clock = START + day * DAY;
      const res = await call('GET', '/me', { cookie: s.cookie });
      expect(res.status).toBe(200);
      s = { ...s, cookie: cookieOf(res) ?? s.cookie };
    }
    clock = START + 30 * DAY - 1;
    expect((await call('GET', '/me', { cookie: s.cookie })).status).toBe(200);
    clock = START + 30 * DAY;
    expect((await call('GET', '/me', { cookie: s.cookie })).status).toBe(401);
  });

  it('cookie Max-Age counts down to the absolute expiry after a rotation', async () => {
    const s = await signIn();
    clock = START + 2 * DAY;
    const res = await call('GET', '/me', { cookie: s.cookie });
    expect(res.headers.get('set-cookie')).toContain(`Max-Age=${28 * DAY}`);
  });

  it('a rotation-due write that is refused (CSRF) does not rotate', async () => {
    const s = await signIn();
    clock = START + 2 * DAY;
    const res = await call('POST', '/auth/logout', { cookie: s.cookie, csrf: 'wrong' });
    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(store.sessions.size).toBe(1);
  });
});

describe('login always rotates, logout revokes', () => {
  it('a sign-in with a cookie already present revokes that session', async () => {
    const first = await signIn('a@example.test');
    const second = await signIn('a@example.test', first.cookie);
    expect(second.cookie).not.toBe(first.cookie);
    expect((await call('GET', '/me', { cookie: first.cookie })).status).toBe(401);
    expect(store.sessions.size).toBe(1);
  });

  it('logout deletes the row and the grace token with it', async () => {
    const s = await signIn();
    clock = START + 2 * DAY;
    const next = cookieOf(await call('GET', '/me', { cookie: s.cookie }))!;
    expect(store.sessions.size).toBe(2);
    const out = await call('POST', '/auth/logout', { cookie: next, csrf: s.csrf });
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect(store.sessions.size).toBe(0);
    expect((await call('GET', '/me', { cookie: s.cookie })).status).toBe(401);
  });

  it('logout with the old token in grace also revokes its successor', async () => {
    const s = await signIn();
    clock = START + 2 * DAY;
    const next = cookieOf(await call('GET', '/me', { cookie: s.cookie }))!;
    expect((await call('POST', '/auth/logout', { cookie: s.cookie, csrf: s.csrf })).status).toBe(
      204,
    );
    expect(store.sessions.size).toBe(0);
    expect((await call('GET', '/me', { cookie: next })).status).toBe(401);
  });

  it('a logout that is due for rotation hands back no fresh cookie', async () => {
    const s = await signIn();
    clock = START + 2 * DAY;
    const out = await call('POST', '/auth/logout', { cookie: s.cookie, csrf: s.csrf });
    expect(out.status).toBe(204);
    const cookies = out.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/Max-Age=0/);
    expect(store.sessions.size).toBe(0);
  });
});

const ALL_ROUTES = [...AUTH_WRITE_ROUTES, ['GET', '/me']] as const;
const concrete = (path: string) => path.replace('{account}', Keypair.random().publicKey());

describe('Worker mount: 503 without a database', () => {
  it.each(ALL_ROUTES)(
    '%s %s answers 503 UPSTREAM_UNAVAILABLE with no DATABASE_URL',
    async (m, p) => {
      delete env.DATABASE_URL;
      const res = await call(m, concrete(p), m === 'GET' ? {} : { body: {} });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'Sign-in is not available right now.',
          retryable: true,
          details: {},
        },
      });
    },
  );

  it.each(AUTH_SECRET_NAMES)('answers 503 when %s is missing or empty', async (name) => {
    env[name] = '';
    expect((await call('GET', '/me')).status).toBe(503);
    delete env[name];
    expect((await call('GET', '/me')).status).toBe(503);
  });

  it.each(['EMAIL_FROM', 'DASHBOARD_ORIGIN'])(
    'answers 503 when var %s is missing',
    async (name) => {
      delete env[name];
      expect((await call('GET', '/me')).status).toBe(503);
    },
  );

  it('answers 503, not a crash, on a malformed seed, origin or setting', async () => {
    for (const patch of [
      { CHALLENGE_SIGNING_KEY: 'not-a-seed' },
      { DASHBOARD_ORIGIN: 'not a url' },
      { SESSION_IDLE_TIMEOUT: '0' },
    ]) {
      const res = await handle(req('GET', '/me'), { ...env, ...patch }, options);
      expect(res.status).toBe(503);
    }
  });

  it('answers 503 while no store is wired, even with every secret set', async () => {
    const res = await handle(req('GET', '/me'), env, {});
    expect(res.status).toBe(503);
  });

  it('never echoes a secret in the 503', async () => {
    delete env.DATABASE_URL;
    const text = await (
      await call('POST', '/auth/email/start', { body: { email: 'a@b.test' } })
    ).text();
    for (const v of Object.values(env)) if (v !== undefined) expect(text).not.toContain(v);
  });

  it('still answers health and 404 without any secret', async () => {
    expect((await handle(req('GET', '/health'), {})).status).toBe(200);
    expect((await handle(req('GET', '/nope'), {})).status).toBe(404);
    expect((await handle(req('GET', '/wallets/a/b'), env, options)).status).toBe(404);
  });
});

describe('Worker mount: routes per docs/API.md §4', () => {
  it('serves the full email sign-in through the router, mailing via Resend', async () => {
    const s = await signIn('Person@Example.test');
    const mail = sent[0]!;
    expect(mail.url).toBe('https://api.resend.com/emails');
    const headers = new Headers(mail.init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${env.EMAIL_API_KEY}`);
    const body = JSON.parse(String(mail.init.body)) as { from: string; to: string[] };
    expect(body.from).toBe(env.EMAIL_FROM);
    expect(body.to).toEqual(['person@example.test']);
    const me = (await (await call('GET', '/me', { cookie: s.cookie })).json()) as {
      user: { email: string };
    };
    expect(me.user.email).toBe('person@example.test');
  });

  it('builds wallet challenges with the challenge-signing key and the dashboard host', async () => {
    const s = await signIn();
    const res = await call('POST', '/wallets/challenge', {
      cookie: s.cookie,
      csrf: s.csrf,
      body: { account: Keypair.random().publicKey() },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { challengeXdr: string };
    expect(body.challengeXdr.length).toBeGreaterThan(0);
  });

  it('ResendMailer throws on a provider rejection without echoing the body', async () => {
    const mailer = new ResendMailer('k', 'f@example.test', (() =>
      Promise.resolve(
        new Response('secret-ish body', { status: 422 }),
      )) as unknown as typeof fetch);
    await expect(mailer.sendSigninCode('a@example.test', '12345678')).rejects.toThrow(
      /^Email provider returned HTTP 422\.$/,
    );
  });
});

describe('guard removal through the router: every write path', () => {
  const sessionRoutes = AUTH_WRITE_ROUTES.filter(([, p]) => !p.startsWith('/auth/email/'));

  it.each(sessionRoutes)('%s %s: no session -> 401', async (m, p) => {
    expect((await call(m, concrete(p), { body: {} })).status).toBe(401);
  });

  it.each(sessionRoutes)('%s %s: no CSRF token -> 403', async (m, p) => {
    const s = await signIn();
    expect((await call(m, concrete(p), { cookie: s.cookie, body: {} })).status).toBe(403);
    expect(store.sessions.size).toBe(1);
  });

  it.each(sessionRoutes)('%s %s: foreign Origin -> 403', async (m, p) => {
    const s = await signIn();
    const res = await call(m, concrete(p), {
      cookie: s.cookie,
      csrf: s.csrf,
      origin: 'https://evil.example.test',
      body: {},
    });
    expect(res.status).toBe(403);
  });

  it.each(sessionRoutes)('%s %s: expired session -> 401 and the row is deleted', async (m, p) => {
    const s = await signIn();
    clock = START + 30 * DAY;
    expect((await call(m, concrete(p), { cookie: s.cookie, csrf: s.csrf, body: {} })).status).toBe(
      401,
    );
    expect(store.sessions.size).toBe(0);
  });

  it('POST /auth/email/start is rate-limited per address', async () => {
    for (let i = 0; i < 3; i++) {
      await call('POST', '/auth/email/start', { body: { email: 'a@example.test' } });
    }
    const res = await call('POST', '/auth/email/start', { body: { email: 'a@example.test' } });
    expect(res.status).toBe(429);
    expect(sent).toHaveLength(3);
  });

  it('POST /auth/email/verify without the right code makes no session', async () => {
    await call('POST', '/auth/email/start', { body: { email: 'a@example.test' } });
    const res = await call('POST', '/auth/email/verify', {
      body: { email: 'a@example.test', code: '00000000' },
    });
    expect(res.status).toBe(401);
    expect(store.sessions.size).toBe(0);
  });
});
