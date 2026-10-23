import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_WRITE_ROUTES,
  CSRF_HEADER,
  handleAuth,
  loadAuthConfig,
  MemoryAuthStore,
  type AuthDeps,
  type Mailer,
} from '../src/index.js';

const ORIGIN = 'https://dashboard.example.test';
const PEPPER = 'test-pepper-not-a-secret';
const START = 1_800_000_000;

class RecordingMailer implements Mailer {
  readonly sent: { email: string; code: string }[] = [];
  sendSigninCode(email: string, code: string): Promise<void> {
    this.sent.push({ email, code });
    return Promise.resolve();
  }
}

let clock: number;
let store: MemoryAuthStore;
let mailer: RecordingMailer;
let deps: AuthDeps;

beforeEach(() => {
  clock = START;
  store = new MemoryAuthStore(() => clock);
  mailer = new RecordingMailer();
  deps = {
    store,
    mailer,
    config: loadAuthConfig({}),
    pepper: PEPPER,
    challengeKeypair: Keypair.random(),
    domains: { homeDomain: 'evergreen.example.test', webAuthDomain: 'evergreen.example.test' },
    challengeTimeoutSeconds: 300,
    allowedOrigin: ORIGIN,
    now: () => clock,
  };
});

function req(
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string; csrf?: string; origin?: string | null } = {},
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.cookie !== undefined) headers.set('cookie', opts.cookie);
  if (opts.csrf !== undefined) headers.set(CSRF_HEADER, opts.csrf);
  if (opts.origin !== null) headers.set('origin', opts.origin ?? ORIGIN);
  return new Request(`${ORIGIN}/api/v1${path}`, {
    method,
    headers,
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
}

async function call(method: string, path: string, opts: Parameters<typeof req>[2] = {}) {
  const res = await handleAuth(req(method, path, opts), path, deps);
  if (res === undefined) throw new Error(`no route ${method} ${path}`);
  return res;
}

async function signIn(email = 'a@example.test') {
  await call('POST', '/auth/email/start', { body: { email } });
  const code = mailer.sent.at(-1)!.code;
  const res = await call('POST', '/auth/email/verify', { body: { email, code } });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const me = (await (await call('GET', '/me', { cookie })).json()) as { csrfToken: string };
  return { cookie, csrf: me.csrfToken };
}

async function linkWallet(s: { cookie: string; csrf: string }, kp = Keypair.random()) {
  const ch = (await (
    await call('POST', '/wallets/challenge', { ...s, body: { account: kp.publicKey() } })
  ).json()) as { challengeXdr: string };
  const tx = TransactionBuilder.fromXDR(ch.challengeXdr, Networks.TESTNET);
  tx.sign(kp);
  return call('POST', '/wallets', { ...s, body: { challengeXdr: tx.toXDR() } });
}

describe('email sign-in', () => {
  it('answers 202 and sends a code, without storing the code itself', async () => {
    const res = await call('POST', '/auth/email/start', { body: { email: 'A@Example.test ' } });
    expect(res.status).toBe(202);
    expect(mailer.sent).toHaveLength(1);
    const record = store.codes.get('a@example.test')!;
    expect(JSON.stringify(record)).not.toContain(mailer.sent[0]!.code);
  });

  it('answers 202 to a malformed address and sends nothing (no enumeration)', async () => {
    const res = await call('POST', '/auth/email/start', { body: { email: 'nope' } });
    expect(res.status).toBe(202);
    expect(mailer.sent).toHaveLength(0);
  });

  it('rate-limits per address with 429 and Retry-After', async () => {
    for (let i = 0; i < 3; i++)
      await call('POST', '/auth/email/start', { body: { email: 'a@x.test' } });
    const res = await call('POST', '/auth/email/start', { body: { email: 'a@x.test' } });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(mailer.sent).toHaveLength(3);
  });

  it('rate-limits per IP across addresses', async () => {
    deps = { ...deps, config: loadAuthConfig({ EMAIL_SENDS_PER_IP: '2' }) };
    await call('POST', '/auth/email/start', { body: { email: 'a@x.test' } });
    await call('POST', '/auth/email/start', { body: { email: 'b@x.test' } });
    const res = await call('POST', '/auth/email/start', { body: { email: 'c@x.test' } });
    expect(res.status).toBe(429);
  });

  it('sets a __Host- session cookie on a right code, and the code is single use', async () => {
    await call('POST', '/auth/email/start', { body: { email: 'a@x.test' } });
    const code = mailer.sent[0]!.code;
    const ok = await call('POST', '/auth/email/verify', { body: { email: 'a@x.test', code } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('set-cookie')).toMatch(
      /^__Host-evergreen_session=.+HttpOnly; Secure; SameSite=Lax; Path=\//,
    );
    const again = await call('POST', '/auth/email/verify', { body: { email: 'a@x.test', code } });
    expect(again.status).toBe(401);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe('CODE_INVALID');
  });

  it('gives a wrong code the same CODE_INVALID and counts the failure', async () => {
    await call('POST', '/auth/email/start', { body: { email: 'a@x.test' } });
    const res = await call('POST', '/auth/email/verify', {
      body: { email: 'a@x.test', code: '00000000x' },
    });
    expect(res.status).toBe(401);
    expect(store.codes.get('a@x.test')!.failures).toBe(1);
  });

  it('refuses an expired code', async () => {
    await call('POST', '/auth/email/start', { body: { email: 'a@x.test' } });
    clock += 600;
    const res = await call('POST', '/auth/email/verify', {
      body: { email: 'a@x.test', code: mailer.sent[0]!.code },
    });
    expect(res.status).toBe(401);
  });
});

describe('sessions', () => {
  it('GET /me returns the user, wallets and a CSRF token', async () => {
    const s = await signIn();
    const body = (await (await call('GET', '/me', { cookie: s.cookie })).json()) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({ user: { email: 'a@example.test' }, wallets: [] });
    expect(typeof body['csrfToken']).toBe('string');
  });

  it('expires after the idle timeout and deletes the row', async () => {
    const s = await signIn();
    clock += 7 * 86_400;
    expect((await call('GET', '/me', { cookie: s.cookie })).status).toBe(401);
    expect(store.sessions.size).toBe(0);
  });

  it('logout deletes the row and clears the cookie', async () => {
    const s = await signIn();
    const res = await call('POST', '/auth/logout', s);
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect((await call('GET', '/me', { cookie: s.cookie })).status).toBe(401);
  });
});

describe('wallet linking (SEP-10)', () => {
  it('links a wallet that signed its challenge', async () => {
    const s = await signIn();
    const kp = Keypair.random();
    const res = await linkWallet(s, kp);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      wallet: { account: kp.publicKey(), network: 'testnet' },
    });
  });

  it('refuses a challenge the wallet did not sign', async () => {
    const s = await signIn();
    const ch = (await (
      await call('POST', '/wallets/challenge', {
        ...s,
        body: { account: Keypair.random().publicKey() },
      })
    ).json()) as { challengeXdr: string };
    const res = await call('POST', '/wallets', { ...s, body: { challengeXdr: ch.challengeXdr } });
    expect(res.status).toBe(400);
    expect(store.wallets.size).toBe(0);
  });

  it('refuses a challenge signed by a different key', async () => {
    const s = await signIn();
    const ch = (await (
      await call('POST', '/wallets/challenge', {
        ...s,
        body: { account: Keypair.random().publicKey() },
      })
    ).json()) as { challengeXdr: string };
    const tx = TransactionBuilder.fromXDR(ch.challengeXdr, Networks.TESTNET);
    tx.sign(Keypair.random());
    const res = await call('POST', '/wallets', { ...s, body: { challengeXdr: tx.toXDR() } });
    expect(res.status).toBe(400);
  });

  it("refuses another session's challenge, even correctly signed", async () => {
    const a = await signIn('a@x.test');
    const b = await signIn('b@x.test');
    const kp = Keypair.random();
    const ch = (await (
      await call('POST', '/wallets/challenge', { ...a, body: { account: kp.publicKey() } })
    ).json()) as { challengeXdr: string };
    const tx = TransactionBuilder.fromXDR(ch.challengeXdr, Networks.TESTNET);
    tx.sign(kp);
    expect(
      (await call('POST', '/wallets', { ...b, body: { challengeXdr: tx.toXDR() } })).status,
    ).toBe(400);
  });

  it('answers 409 WALLET_LINKED_ELSEWHERE for a wallet another user holds', async () => {
    const kp = Keypair.random();
    await linkWallet(await signIn('a@x.test'), kp);
    const res = await linkWallet(await signIn('b@x.test'), kp);
    expect(res.status).toBe(409);
  });

  it('refuses a malformed account with CHALLENGE_INVALID', async () => {
    const s = await signIn();
    expect(
      (await call('POST', '/wallets/challenge', { ...s, body: { account: 'GNOPE' } })).status,
    ).toBe(400);
  });

  it('refuses to unlink a wallet that pays for a watched contract', async () => {
    const s = await signIn();
    const kp = Keypair.random();
    await linkWallet(s, kp);
    const userId = [...store.users.values()][0]!.id;
    store.payers.add(`${userId}\n${kp.publicKey()}`);
    const res = await call('DELETE', `/wallets/${kp.publicKey()}`, s);
    expect(res.status).toBe(409);
    expect(store.wallets.size).toBe(1);
    store.payers.clear();
    expect((await call('DELETE', `/wallets/${kp.publicKey()}`, s)).status).toBe(204);
    expect(store.wallets.size).toBe(0);
  });
});

/**
 * Guard-removal tests: one per write path. Each proves the guard is what
 * refuses the request, so deleting the guard fails a test here.
 */
describe('every write path is guarded', () => {
  const sessionRoutes = AUTH_WRITE_ROUTES.filter(
    ([, p]) => p !== '/auth/email/start' && p !== '/auth/email/verify',
  );
  const pathOf = (p: string) => p.replace('{account}', Keypair.random().publicKey());

  it.each(sessionRoutes)('%s %s refuses no session with 401', async (method, path) => {
    const res = await call(method, pathOf(path), { body: {} });
    expect(res.status).toBe(401);
  });

  it.each(sessionRoutes)('%s %s refuses a missing CSRF token with 403', async (method, path) => {
    const s = await signIn();
    const res = await call(method, pathOf(path), { cookie: s.cookie, body: {} });
    expect(res.status).toBe(403);
    expect(store.sessions.size).toBe(1);
  });

  it.each(sessionRoutes)('%s %s refuses a foreign Origin with 403', async (method, path) => {
    const s = await signIn();
    const res = await call(method, pathOf(path), { ...s, origin: 'https://evil.test', body: {} });
    expect(res.status).toBe(403);
  });

  it.each(sessionRoutes)('%s %s refuses a wrong CSRF token with 403', async (method, path) => {
    const s = await signIn();
    const res = await call(method, pathOf(path), {
      cookie: s.cookie,
      csrf: 'x'.repeat(43),
      body: {},
    });
    expect(res.status).toBe(403);
  });

  it('POST /auth/email/start is guarded by its rate limit', async () => {
    deps = { ...deps, config: loadAuthConfig({ EMAIL_SENDS_PER_ADDRESS: '1' }) };
    await call('POST', '/auth/email/start', { body: { email: 'a@x.test' } });
    expect((await call('POST', '/auth/email/start', { body: { email: 'a@x.test' } })).status).toBe(
      429,
    );
  });

  it('POST /auth/email/verify is guarded by the code: no code, no session', async () => {
    const res = await call('POST', '/auth/email/verify', {
      body: { email: 'a@x.test', code: '12345678' },
    });
    expect(res.status).toBe(401);
    expect(store.sessions.size).toBe(0);
  });

  it('lists every state-changing route handleAuth serves', () => {
    expect(AUTH_WRITE_ROUTES.map(([m, p]) => `${m} ${p}`)).toEqual([
      'POST /auth/email/start',
      'POST /auth/email/verify',
      'POST /auth/logout',
      'POST /wallets/challenge',
      'POST /wallets',
      'DELETE /wallets/{account}',
    ]);
  });
});

describe('email never authorises anything that moves XLM', () => {
  it('an email session alone cannot link a wallet: the wallet must sign', async () => {
    const s = await signIn();
    const res = await call('POST', '/wallets', { ...s, body: { challengeXdr: 'AAAA' } });
    expect(res.status).toBe(400);
    expect(store.wallets.size).toBe(0);
  });

  it('serves no job, allowance or payment route', async () => {
    const s = await signIn();
    for (const path of ['/jobs', '/allowances', '/payments', '/extend']) {
      expect(await handleAuth(req('POST', path, { ...s, body: {} }), path, deps)).toBeUndefined();
    }
  });
});
