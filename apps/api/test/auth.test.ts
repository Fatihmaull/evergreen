import { Keypair, Networks, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  AUTH_DEFAULTS,
  AuthConfigError,
  createSession,
  csrfAllows,
  hashSessionToken,
  hitLimit,
  issueSigninCode,
  issueWalletChallenge,
  loadAuthConfig,
  MemoryCounterStore,
  normalizeEmail,
  readSessionToken,
  sessionCookie,
  sessionState,
  verifySigninCode,
  verifyWalletChallenge,
  type ChallengeStore,
  type SigninCodeRecord,
} from '../src/index.js';
import { randomDigits, timingSafeEqual } from '../src/auth/crypto.js';

const config = loadAuthConfig({});
const PEPPER = 'test-pepper-not-a-secret';
const NOW = 1_800_000_000;

describe('auth configuration', () => {
  it("defaults to Fatih's starting values (2026-10-20)", () => {
    expect(config.sessionIdleTimeout).toBe(7 * 86_400);
    expect(config.sessionAbsoluteTimeout).toBe(30 * 86_400);
    expect(config.signinCodeTtl).toBe(600);
    expect(config.signinCodeMaxFailures).toBe(5);
    expect(config.emailSendsPerAddress).toEqual({ limit: 3, window: 900 });
    expect(config.emailSendsPerIp).toEqual({ limit: 20, window: 3600 });
    expect(config.signinCodeDigits).toBe(8);
  });

  it('reads each setting from the environment by name, and an empty value is unset', () => {
    const tuned = loadAuthConfig({ SIGNIN_CODE_MAX_FAILURES: '3', SESSION_IDLE_TIMEOUT: '' });
    expect(tuned.signinCodeMaxFailures).toBe(3);
    expect(tuned.sessionIdleTimeout).toBe(AUTH_DEFAULTS.SESSION_IDLE_TIMEOUT);
  });

  it.each(['0', '-1', '1.5', 'ten', ' 5', '5s'])('refuses %j rather than guessing', (raw) => {
    expect(() => loadAuthConfig({ EMAIL_SENDS_PER_IP: raw })).toThrow(AuthConfigError);
  });

  it('refuses an idle timeout longer than the absolute one', () => {
    expect(() =>
      loadAuthConfig({ SESSION_IDLE_TIMEOUT: '100', SESSION_ABSOLUTE_TIMEOUT: '50' }),
    ).toThrow(/cannot exceed/);
  });
});

describe('crypto helpers', () => {
  it('draws digits only, at the requested length', () => {
    for (const n of [1, 6, 8, 12]) expect(randomDigits(n)).toMatch(new RegExp(`^\\d{${n}}$`));
  });

  it('compares in full', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('email sign-in codes', () => {
  const email = 'user@example.test';
  async function issued(): Promise<{ code: string; record: SigninCodeRecord }> {
    return issueSigninCode({ email, now: NOW, config, pepper: PEPPER });
  }
  const verify = (
    record: SigninCodeRecord | undefined,
    code: string,
    now = NOW + 1,
    mail = email,
  ) => verifySigninCode({ record, email: mail, code, now, config, pepper: PEPPER });
  const wrong = (code: string) => (code === '00000000' ? '11111111' : '00000000');

  it('normalises an address and refuses what is not one', () => {
    expect(normalizeEmail('  User@Example.TEST ')).toBe('user@example.test');
    for (const bad of ['', 'no-at', '@x', 'x@', 'a@b@c', 'a b@c']) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });

  it('stores a keyed MAC, never the code', async () => {
    const { code, record } = await issued();
    expect(code).toMatch(/^\d{8}$/);
    expect(JSON.stringify(record)).not.toContain(code);
    expect(record.expiresAt).toBe(NOW + 600);
  });

  it('🔴 accepts the right code exactly once', async () => {
    const { code, record } = await issued();
    const first = await verify(record, code);
    expect(first.result).toBe('ok');
    expect((await verify(first.record, code)).result).toBe('invalid');
  });

  it('🔴 refuses an expired code, at the expiry instant', async () => {
    const { code, record } = await issued();
    expect((await verify(record, code, NOW + 599)).result).toBe('ok');
    expect((await verify(record, code, NOW + 600)).result).toBe('invalid');
  });

  it('🔴 voids a code after the failure limit, even when the next guess is right', async () => {
    const { code, record } = await issued();
    let current = record;
    for (let i = 0; i < 5; i++) {
      const r = await verify(current, wrong(code));
      expect(r.result).toBe('invalid');
      current = r.record!;
    }
    expect(current.failures).toBe(5);
    expect((await verify(current, code)).result).toBe('invalid');
  });

  it('counts a malformed guess as a failure', async () => {
    const { record } = await issued();
    expect((await verify(record, '12ab')).record?.failures).toBe(1);
  });

  it('🔴 a code works only for its own address and under its own key', async () => {
    const { code, record } = await issued();
    expect((await verify(record, code, NOW + 1, 'other@example.test')).result).toBe('invalid');
    const otherKey = await verifySigninCode({
      record,
      email,
      code,
      now: NOW + 1,
      config,
      pepper: 'another-pepper',
    });
    expect(otherKey.result).toBe('invalid');
  });

  it('gives every refusal the same answer', async () => {
    const { code, record } = await issued();
    const used = (await verify(record, code)).record!;
    const answers = [
      await verify(undefined, code),
      await verify(used, code),
      await verify(record, code, NOW + 600),
      await verify(record, wrong(code)),
    ];
    expect(new Set(answers.map((a) => a.result))).toEqual(new Set(['invalid']));
  });
});

describe('sessions', () => {
  it('stores the hash of the token, not the token', async () => {
    const { token, row } = await createSession('user-1', NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row.tokenHash).toBe(await hashSessionToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.csrfToken).not.toBe(token);
  });

  it('🔴 expires at the idle limit since last use', async () => {
    const { row } = await createSession('user-1', NOW);
    expect(sessionState(row, NOW + config.sessionIdleTimeout - 1, config)).toBe('valid');
    expect(sessionState(row, NOW + config.sessionIdleTimeout, config)).toBe('expired');
  });

  it('🔴 expires at the absolute limit, however recently used', async () => {
    const { row } = await createSession('user-1', NOW);
    const justUsed = { ...row, lastSeenAt: NOW + config.sessionAbsoluteTimeout - 1 };
    expect(sessionState(justUsed, NOW + config.sessionAbsoluteTimeout - 1, config)).toBe('valid');
    expect(sessionState(justUsed, NOW + config.sessionAbsoluteTimeout, config)).toBe('expired');
  });

  it('treats a missing row as no session', () => {
    expect(sessionState(undefined, NOW, config)).toBe('none');
  });

  it('sets the ADR-008 cookie attributes', async () => {
    const { token } = await createSession('user-1', NOW);
    const cookie = sessionCookie(token, config);
    for (const part of [
      '__Host-evergreen_session=',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Path=/',
    ]) {
      expect(cookie).toContain(part);
    }
    expect(cookie).not.toContain('Domain=');
  });

  it('reads its token from a Cookie header and nothing malformed', async () => {
    const { token } = await createSession('user-1', NOW);
    expect(readSessionToken(`a=b; __Host-evergreen_session=${token}; c=d`)).toBe(token);
    expect(readSessionToken('__Host-evergreen_session=short')).toBeUndefined();
    expect(readSessionToken(null)).toBeUndefined();
  });
});

describe('CSRF', () => {
  const ok = {
    method: 'POST',
    origin: 'https://evergreen-stellar.pages.dev',
    allowedOrigin: 'https://evergreen-stellar.pages.dev',
    headerToken: 'tok',
    sessionCsrfToken: 'tok',
  };

  it('lets a correct state-changing request through, and every safe method', () => {
    expect(csrfAllows(ok)).toBe(true);
    expect(csrfAllows({ ...ok, method: 'GET', origin: null, headerToken: null })).toBe(true);
  });

  it.each([
    ['another origin', { origin: 'https://evil.pages.dev' }],
    ['no Origin header', { origin: null }],
    ['no token header', { headerToken: null }],
    ['the wrong token', { headerToken: 'nope' }],
    ['a lower-case method', { method: 'delete', headerToken: 'nope' }],
  ])('🔴 refuses %s', (_, change) => {
    expect(csrfAllows({ ...ok, ...change })).toBe(false);
  });
});

describe('rate limits', () => {
  const limit = { limit: 3, window: 900 };

  it('🔴 allows the limit, then refuses with the time left in the window', async () => {
    const store = new MemoryCounterStore();
    const start = 900 * 2_000_000;
    for (let i = 0; i < 3; i++) {
      expect(
        await hitLimit(store, { scope: 'email', subject: 'a', limit, now: start + i }),
      ).toEqual({
        allowed: true,
      });
    }
    expect(
      await hitLimit(store, { scope: 'email', subject: 'a', limit, now: start + 100 }),
    ).toEqual({
      allowed: false,
      retryAfterSeconds: 800,
    });
  });

  it('keeps subjects and windows apart', async () => {
    const store = new MemoryCounterStore();
    const start = 900 * 2_000_000;
    for (let i = 0; i < 4; i++)
      await hitLimit(store, { scope: 'email', subject: 'a', limit, now: start });
    expect(
      (await hitLimit(store, { scope: 'email', subject: 'b', limit, now: start })).allowed,
    ).toBe(true);
    expect(
      (await hitLimit(store, { scope: 'email', subject: 'a', limit, now: start + 900 })).allowed,
    ).toBe(true);
  });
});

describe('wallet linking by signed challenge', () => {
  const server = Keypair.random();
  const wallet = Keypair.random();
  const domains = {
    homeDomain: 'evergreen-stellar.pages.dev',
    webAuthDomain: 'evergreen-stellar.pages.dev',
  };

  /** In memory, keyed by challenge ID, for one test at a time. */
  function store(): ChallengeStore {
    const issued = new Map<string, string>();
    return {
      remember: (id, session) => {
        issued.set(id, session);
        return Promise.resolve();
      },
      consume: (id, session) => {
        const ok = issued.get(id) === session;
        if (ok) issued.delete(id);
        return Promise.resolve(ok);
      },
    };
  }
  const sign = (xdr: string, ...keys: Keypair[]) => {
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    for (const k of keys) tx.sign(k);
    return tx.toXDR();
  };
  async function challenge(s: ChallengeStore, account = wallet.publicKey(), session = 'session-a') {
    return issueWalletChallenge({
      serverKeypair: server,
      account,
      domains,
      timeoutSeconds: 300,
      sessionTokenHash: session,
      now: NOW,
      store: s,
    });
  }
  const verify = (s: ChallengeStore, signedXdr: string, session = 'session-a') =>
    verifyWalletChallenge({
      signedXdr,
      serverPublicKey: server.publicKey(),
      domains,
      sessionTokenHash: session,
      store: s,
    });

  it('issues a testnet challenge', async () => {
    const issued = await challenge(store());
    expect(issued.networkPassphrase).toBe(Networks.TESTNET);
    expect(issued.expiresAt).toBe(NOW + 300);
  });

  it('🔴 links the wallet that signed', async () => {
    const s = store();
    const { challengeXdr } = await challenge(s);
    expect(await verify(s, sign(challengeXdr, wallet))).toBe(wallet.publicKey());
  });

  it('🔴 a signed challenge works once', async () => {
    const s = store();
    const signed = sign((await challenge(s)).challengeXdr, wallet);
    expect(await verify(s, signed)).toBe(wallet.publicKey());
    expect(await verify(s, signed)).toBeNull();
  });

  it('🔴 a signed challenge works only for the session it was issued to', async () => {
    const s = store();
    const signed = sign((await challenge(s)).challengeXdr, wallet);
    expect(await verify(s, signed, 'session-b')).toBeNull();
    // And the failed attempt did not burn it for its real owner.
    expect(await verify(s, signed, 'session-a')).toBe(wallet.publicKey());
  });

  it.each([
    ['unsigned', (xdr: string) => xdr],
    ['signed by another key', (xdr: string) => sign(xdr, Keypair.random())],
    ['garbage', () => 'not-xdr'],
  ])('🔴 refuses a challenge that is %s', async (_, mangle) => {
    const s = store();
    const { challengeXdr } = await challenge(s);
    expect(await verify(s, mangle(challengeXdr))).toBeNull();
  });

  it('🔴 refuses a challenge another server issued', async () => {
    const s = store();
    const foreign = WebAuth.buildChallengeTx(
      Keypair.random(),
      wallet.publicKey(),
      domains.homeDomain,
      300,
      Networks.TESTNET,
      domains.webAuthDomain,
    );
    expect(await verify(s, sign(foreign, wallet))).toBeNull();
  });
});
