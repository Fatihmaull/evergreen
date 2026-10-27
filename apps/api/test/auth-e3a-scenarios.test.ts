/**
 * E3 part A (login + sign-out) as API-level scenarios, PH2-E3-01.
 *
 * Each `describe` is one stage of the sign-in journey a person walks on
 * `/login/` (docs/PH2-E3-01-AUTH-SCENARIOS.md maps the stages to what to
 * watch on preview). Everything goes through the Worker's `handle()`, the same
 * entry production uses, over `MemoryAuthStore` and an injected clock and
 * `fetch`: nothing here touches the network or a database.
 *
 * Only behaviour that exists on main is asserted. Where the spec names
 * behaviour that is not implemented or not reachable, the scenario doc lists it
 * as undetermined instead of this file inventing it.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE,
  AUTH_DEFAULTS,
  CSRF_HEADER,
  MemoryAuthStore,
  SESSION_ROTATE_AFTER_SECONDS,
  SESSION_ROTATION_GRACE_SECONDS,
  handle,
  type Env,
  type MountOptions,
} from '../src/index.js';

const ORIGIN = 'https://dashboard.example.test';
const START = 1_800_000_000; // divisible by 900 and 3600: windows start exactly here
const MINUTE = 60;
const HOUR = 3_600;
const DAY = 86_400;

let clock: number;
let store: MemoryAuthStore;
let mails: { to: string; code: string }[];
let env: Env;
let options: MountOptions;

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is off in tests');
  });
  clock = START;
  store = new MemoryAuthStore(() => clock);
  mails = [];
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
    fetch: ((_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { to: string[]; text: string };
      mails.push({ to: body.to[0]!, code: /\b(\d{8})\b/.exec(body.text)![1]! });
      return Promise.resolve(new Response('{"id":"x"}', { status: 200 }));
    }) as unknown as typeof fetch,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Opts {
  body?: unknown;
  cookie?: string;
  csrf?: string;
  ip?: string;
}

function call(method: string, path: string, o: Opts = {}): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json', origin: ORIGIN });
  if (o.cookie !== undefined) headers.set('cookie', o.cookie);
  if (o.csrf !== undefined) headers.set(CSRF_HEADER, o.csrf);
  if (o.ip !== undefined) headers.set('cf-connecting-ip', o.ip);
  return handle(
    new Request(`${ORIGIN}${API_BASE}${path}`, {
      method,
      headers,
      ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }),
    }),
    env,
    options,
  );
}

const start = (email: string, ip?: string) =>
  call('POST', '/auth/email/start', { body: { email }, ...(ip === undefined ? {} : { ip }) });
const verify = (email: string, code: string, cookie?: string) =>
  call('POST', '/auth/email/verify', {
    body: { email, code },
    ...(cookie === undefined ? {} : { cookie }),
  });
const cookieOf = (res: Response) => res.headers.get('set-cookie')?.split(';')[0];
const lastCode = () => mails.at(-1)!.code;
const wrongCode = () => (lastCode() === '00000000' ? '00000001' : '00000000');

interface ErrorBody {
  error: { code: string; message: string; retryable: boolean };
}

describe('A1 · request a code', () => {
  it('answers 202 with no body, mails one 8-digit code to the normalised address, and stores only a MAC', async () => {
    const res = await start('  Person@Example.TEST ');
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe('person@example.test');
    expect(mails[0]!.code).toMatch(/^\d{8}$/);
    const record = store.codes.get('person@example.test')!;
    expect(JSON.stringify(record)).not.toContain(mails[0]!.code);
    expect(record.expiresAt).toBe(START + AUTH_DEFAULTS.SIGNIN_CODE_TTL);
  });

  it('answers the same 202 for an address that has an account and one that has none', async () => {
    const s = await signInFully('known@example.test');
    await call('POST', '/auth/logout', { cookie: s.cookie, csrf: s.csrf });
    const known = await start('known@example.test');
    const fresh = await start('never-seen@example.test');
    expect(known.status).toBe(202);
    expect(fresh.status).toBe(202);
    expect(await known.text()).toBe(await fresh.text());
  });

  it('answers 202 and sends nothing for a string that is not an address', async () => {
    expect((await start('not-an-address')).status).toBe(202);
    expect(mails).toHaveLength(0);
    expect(store.codes.size).toBe(0);
  });

  it('a new code replaces the old one: only the latest works', async () => {
    await start('a@example.test');
    const first = lastCode();
    clock += 1;
    await start('a@example.test');
    const second = lastCode();
    expect(second).not.toBe(first);
    expect((await verify('a@example.test', first)).status).toBe(401);
    expect((await verify('a@example.test', second)).status).toBe(200);
  });
});

async function signInFully(email: string, cookie?: string) {
  expect((await start(email)).status).toBe(202);
  const res = await verify(email, lastCode(), cookie);
  expect(res.status).toBe(200);
  const c = cookieOf(res)!;
  const me = (await (await call('GET', '/me', { cookie: c })).json()) as { csrfToken: string };
  return { cookie: c, csrf: me.csrfToken, res };
}

describe('A2 · verify the code: the session cookie', () => {
  it('answers 200 { user } and sets one __Host- cookie with the ADR-008 attributes', async () => {
    await start('a@example.test');
    const res = await verify('a@example.test', lastCode());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string; createdAt: string } };
    expect(body.user.email).toBe('a@example.test');
    expect(body.user.createdAt).toBe(new Date(START * 1000).toISOString());
    expect(Object.keys(body)).toEqual(['user']);

    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^__Host-evergreen_session=[A-Za-z0-9_-]{43}; /);
    expect(cookies[0]).toContain('HttpOnly; Secure; SameSite=Lax; Path=/');
    expect(cookies[0]).not.toMatch(/Domain=/i); // __Host- forbids it
    expect(cookies[0]).toContain(`Max-Age=${AUTH_DEFAULTS.SESSION_ABSOLUTE_TIMEOUT}`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('keeps the token out of the body and stores only its hash', async () => {
    const s = await signInFully('a@example.test');
    const token = s.cookie.split('=')[1]!;
    expect(await s.res.clone().text()).not.toContain(token);
    expect([...store.sessions.keys()].every((k) => k !== token)).toBe(true);
    expect(store.sessions.size).toBe(1);
  });

  it('is case-insensitive about the address, and one address is one account', async () => {
    const one = await signInFully('Same@Example.test');
    const two = await signInFully('same@example.test');
    const idOf = async (cookie: string) =>
      ((await (await call('GET', '/me', { cookie })).json()) as { user: { id: string } }).user.id;
    expect(await idOf(one.cookie)).toBe(await idOf(two.cookie));
    expect(store.users.size).toBe(1);
  });
});

describe('A3 · GET /me', () => {
  it('returns the user, no wallets yet and the CSRF token', async () => {
    const s = await signInFully('a@example.test');
    const res = await call('GET', '/me', { cookie: s.cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { email: string };
      wallets: unknown[];
      csrfToken: string;
    };
    expect(body.user.email).toBe('a@example.test');
    expect(body.wallets).toEqual([]);
    expect(body.csrfToken).toMatch(/\S{16,}/);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 401 UNAUTHENTICATED in the error envelope without a cookie, or with a malformed one', async () => {
    for (const cookie of [undefined, '__Host-evergreen_session=short', 'other=1']) {
      const res = await call('GET', '/me', cookie === undefined ? {} : { cookie });
      expect(res.status).toBe(401);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe('UNAUTHENTICATED');
      expect(body.error.retryable).toBe(false);
    }
  });

  it('answers 401 for a well-formed token that no row holds', async () => {
    const res = await call('GET', '/me', { cookie: `__Host-evergreen_session=${'A'.repeat(43)}` });
    expect(res.status).toBe(401);
  });
});

describe('A4 · rotation during a signed-in day (ADR-008, option 2)', () => {
  it('rotates once after 24 h, honours the old token for the grace window, then drops it', async () => {
    const s = await signInFully('a@example.test');
    clock = START + SESSION_ROTATE_AFTER_SECONDS + 1;
    const rotated = await call('GET', '/me', { cookie: s.cookie });
    expect(rotated.status).toBe(200);
    const next = cookieOf(rotated)!;
    expect(next).not.toBe(s.cookie);
    const rotatedAt = clock;

    // Grace: the old token still works and is not rotated again.
    clock = rotatedAt + SESSION_ROTATION_GRACE_SECONDS - 1;
    const grace = await call('GET', '/me', { cookie: s.cookie });
    expect(grace.status).toBe(200);
    expect(grace.headers.get('set-cookie')).toBeNull();

    // The new token carries the same CSRF token, so an open tab keeps working.
    const viaNew = (await (await call('GET', '/me', { cookie: next })).json()) as {
      csrfToken: string;
    };
    expect(viaNew.csrfToken).toBe(s.csrf);

    clock = rotatedAt + SESSION_ROTATION_GRACE_SECONDS;
    expect((await call('GET', '/me', { cookie: s.cookie })).status).toBe(401);
    expect((await call('GET', '/me', { cookie: next })).status).toBe(200);
  });

  it('does not rotate inside 24 h', async () => {
    const s = await signInFully('a@example.test');
    clock = START + SESSION_ROTATE_AFTER_SECONDS - 1;
    const res = await call('GET', '/me', { cookie: s.cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('a new sign-in on the same browser revokes the session cookie it sent', async () => {
    const first = await signInFully('a@example.test');
    const second = await signInFully('a@example.test', first.cookie);
    expect(second.cookie).not.toBe(first.cookie);
    expect((await call('GET', '/me', { cookie: first.cookie })).status).toBe(401);
    expect((await call('GET', '/me', { cookie: second.cookie })).status).toBe(200);
  });

  it('ends 30 days after login, however often the session is used', async () => {
    let cookie = (await signInFully('a@example.test')).cookie;
    for (let day = 1; day < 30; day++) {
      clock = START + day * DAY;
      const res = await call('GET', '/me', { cookie });
      expect(res.status).toBe(200);
      cookie = cookieOf(res) ?? cookie;
    }
    clock = START + 30 * DAY;
    expect((await call('GET', '/me', { cookie })).status).toBe(401);
  });
});

describe('A5 · sign out', () => {
  it('answers 204, clears the cookie, deletes the row, and /me then answers 401', async () => {
    const s = await signInFully('a@example.test');
    const out = await call('POST', '/auth/logout', { cookie: s.cookie, csrf: s.csrf });
    expect(out.status).toBe(204);
    expect(await out.text()).toBe('');
    const cookies = out.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^__Host-evergreen_session=; .*Max-Age=0/);
    expect(store.sessions.size).toBe(0);

    const after = await call('GET', '/me', { cookie: s.cookie });
    expect(after.status).toBe(401);
    expect(((await after.json()) as ErrorBody).error.code).toBe('UNAUTHENTICATED');
  });

  it('a second sign-out with the dead cookie answers 401, and nothing is revived', async () => {
    const s = await signInFully('a@example.test');
    await call('POST', '/auth/logout', { cookie: s.cookie, csrf: s.csrf });
    const again = await call('POST', '/auth/logout', { cookie: s.cookie, csrf: s.csrf });
    expect(again.status).toBe(401);
    expect(store.sessions.size).toBe(0);
  });

  it('sign-out without a session answers 401', async () => {
    expect((await call('POST', '/auth/logout')).status).toBe(401);
  });

  it('is refused without the CSRF token, and the session survives the refusal', async () => {
    const s = await signInFully('a@example.test');
    const refused = await call('POST', '/auth/logout', { cookie: s.cookie });
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as ErrorBody).error.code).toBe('CSRF_FAILED');
    expect((await call('GET', '/me', { cookie: s.cookie })).status).toBe(200);
  });

  it('signing out on one browser does not end another browser session of the same user', async () => {
    const laptop = await signInFully('a@example.test');
    const phone = await signInFully('a@example.test');
    expect(store.sessions.size).toBe(2);
    await call('POST', '/auth/logout', { cookie: laptop.cookie, csrf: laptop.csrf });
    expect((await call('GET', '/me', { cookie: laptop.cookie })).status).toBe(401);
    expect((await call('GET', '/me', { cookie: phone.cookie })).status).toBe(200);
  });

  it('sign out after a rotation revokes both tokens of the chain', async () => {
    const s = await signInFully('a@example.test');
    clock = START + SESSION_ROTATE_AFTER_SECONDS + 1;
    const next = cookieOf(await call('GET', '/me', { cookie: s.cookie }))!;
    expect(store.sessions.size).toBe(2);
    expect((await call('POST', '/auth/logout', { cookie: next, csrf: s.csrf })).status).toBe(204);
    expect(store.sessions.size).toBe(0);
    expect((await call('GET', '/me', { cookie: s.cookie })).status).toBe(401);
    expect((await call('GET', '/me', { cookie: next })).status).toBe(401);
  });

  it('after sign-out the same address signs in again to the same account', async () => {
    const first = await signInFully('a@example.test');
    const id = (
      (await (await call('GET', '/me', { cookie: first.cookie })).json()) as {
        user: { id: string };
      }
    ).user.id;
    await call('POST', '/auth/logout', { cookie: first.cookie, csrf: first.csrf });
    const second = await signInFully('a@example.test');
    const me = (await (await call('GET', '/me', { cookie: second.cookie })).json()) as {
      user: { id: string };
    };
    expect(me.user.id).toBe(id);
    expect(second.cookie).not.toBe(first.cookie);
  });
});

describe('A6 · rate limits on requesting a code', () => {
  it('allows 3 per address in a 15-minute window, then 429 with Retry-After to the window end', async () => {
    for (let i = 0; i < AUTH_DEFAULTS.EMAIL_SENDS_PER_ADDRESS; i++) {
      expect((await start('a@example.test')).status).toBe(202);
    }
    const res = await start('a@example.test');
    expect(res.status).toBe(429);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retryable).toBe(true);
    expect(res.headers.get('retry-after')).toBe(
      String(AUTH_DEFAULTS.EMAIL_SENDS_PER_ADDRESS_WINDOW),
    );
    expect(mails).toHaveLength(3);

    clock = START + 5 * MINUTE;
    const later = await start('a@example.test');
    expect(later.status).toBe(429);
    expect(later.headers.get('retry-after')).toBe(String(10 * MINUTE));
  });

  it('opens again when the window rolls over, and a refused request does not extend it', async () => {
    for (let i = 0; i < 4; i++) await start('a@example.test');
    clock = START + 899;
    expect((await start('a@example.test')).status).toBe(429); // hammering inside the window
    clock = START + 900;
    expect((await start('a@example.test')).status).toBe(202);
    expect(mails).toHaveLength(4);
  });

  it('counts per address, case and spaces ignored, and leaves other addresses alone', async () => {
    for (const spelling of ['a@example.test', 'A@Example.test', ' a@example.test ']) {
      expect((await start(spelling)).status).toBe(202);
    }
    expect((await start('A@EXAMPLE.TEST')).status).toBe(429);
    expect((await start('b@example.test')).status).toBe(202);
  });

  it('counts per IP across addresses: 20 an hour, then 429; another IP is unaffected', async () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < AUTH_DEFAULTS.EMAIL_SENDS_PER_IP; i++) {
      expect((await start(`user${i}@example.test`, ip)).status).toBe(202);
    }
    const res = await start('one-more@example.test', ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe(String(HOUR));
    expect(mails).toHaveLength(AUTH_DEFAULTS.EMAIL_SENDS_PER_IP);
    expect((await start('other@example.test', '203.0.113.8')).status).toBe(202);

    clock = START + HOUR;
    expect((await start('one-more@example.test', ip)).status).toBe(202);
  });

  it('is checked before the address is looked at: a limited IP gets 429 even for a malformed address', async () => {
    const ip = '203.0.113.9';
    for (let i = 0; i < AUTH_DEFAULTS.EMAIL_SENDS_PER_IP; i++) await start('not-an-address', ip);
    expect((await start('not-an-address', ip)).status).toBe(429);
  });
});

describe('A7 · wrong, expired and reused codes', () => {
  it('a wrong code answers 401 CODE_INVALID, sets no cookie and makes no session', async () => {
    await start('a@example.test');
    const res = await verify('a@example.test', wrongCode());
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorBody).error.code).toBe('CODE_INVALID');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(store.sessions.size).toBe(0);
  });

  it('a wrong guess does not spoil the right code, up to the failure limit', async () => {
    await start('a@example.test');
    const code = lastCode();
    for (let i = 0; i < AUTH_DEFAULTS.SIGNIN_CODE_MAX_FAILURES - 1; i++) {
      expect((await verify('a@example.test', wrongCode())).status).toBe(401);
    }
    expect((await verify('a@example.test', code)).status).toBe(200);
  });

  it('is void after 5 wrong guesses, even for the right code, until a new code is requested', async () => {
    await start('a@example.test');
    const code = lastCode();
    for (let i = 0; i < AUTH_DEFAULTS.SIGNIN_CODE_MAX_FAILURES; i++) {
      await verify('a@example.test', wrongCode());
    }
    expect((await verify('a@example.test', code)).status).toBe(401);
    expect(store.sessions.size).toBe(0);
    clock += 1;
    await start('a@example.test');
    expect((await verify('a@example.test', lastCode())).status).toBe(200);
  });

  it('expires at 10 minutes: valid at 599 s, refused at 600 s', async () => {
    await start('a@example.test');
    const code = lastCode();
    clock = START + AUTH_DEFAULTS.SIGNIN_CODE_TTL;
    expect((await verify('a@example.test', code)).status).toBe(401);
    expect(store.sessions.size).toBe(0);

    clock = START + 1_000;
    await start('a@example.test');
    const second = lastCode();
    clock += AUTH_DEFAULTS.SIGNIN_CODE_TTL - 1;
    expect((await verify('a@example.test', second)).status).toBe(200);
  });

  it('works once: replaying the same code answers 401 and makes no second session', async () => {
    await start('a@example.test');
    const code = lastCode();
    expect((await verify('a@example.test', code)).status).toBe(200);
    expect((await verify('a@example.test', code)).status).toBe(401);
    expect(store.sessions.size).toBe(1);
  });

  it('is bound to its address: a code mailed to one address does not sign in another', async () => {
    await start('a@example.test');
    await start('b@example.test');
    const forB = lastCode();
    expect((await verify('a@example.test', forB)).status).toBe(401);
    expect(store.sessions.size).toBe(0);
  });

  it('gives every refusal the same status and body, so a refusal says nothing about why', async () => {
    const bodies: string[] = [];
    // Never requested.
    bodies.push(await (await verify('nobody@example.test', '12345678')).text());
    // Malformed code, missing fields, non-string code.
    await start('a@example.test');
    bodies.push(await (await verify('a@example.test', 'abc')).text());
    bodies.push(await (await call('POST', '/auth/email/verify', { body: {} })).text());
    bodies.push(
      await (
        await call('POST', '/auth/email/verify', {
          body: { email: 'a@example.test', code: 12345678 },
        })
      ).text(),
    );
    // Wrong.
    bodies.push(await (await verify('a@example.test', wrongCode())).text());
    // Expired.
    clock = START + AUTH_DEFAULTS.SIGNIN_CODE_TTL;
    bodies.push(await (await verify('a@example.test', lastCode())).text());
    // Used.
    clock = START + 2_000;
    await start('a@example.test');
    const code = lastCode();
    await verify('a@example.test', code);
    bodies.push(await (await verify('a@example.test', code)).text());
    expect(new Set(bodies).size).toBe(1);
    expect((JSON.parse(bodies[0]!) as ErrorBody).error.code).toBe('CODE_INVALID');
  });

  it('a code sent with surrounding spaces still signs in (what a paste does)', async () => {
    await start('a@example.test');
    expect((await verify('a@example.test', ` ${lastCode()} `)).status).toBe(200);
  });
});
