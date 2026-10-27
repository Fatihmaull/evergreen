/**
 * PH2-E2-04: `fetch` must be called with no `this`. Workers' global `fetch`
 * throws `TypeError: Illegal invocation: function called with incorrect this
 * reference` when it is called as a method of another object, so
 * `this.fetcher(url, init)` inside `ResendMailer` failed instantly on the preview
 * Worker (`fetchStage: send`, `elapsedMs: 0`) while Node and a fake `fetch` did
 * not notice. The fetchers below copy that one rule. Simulation only: the
 * Workers runtime itself is not exercised here.
 *
 * No network: the global `fetch` is replaced in every test.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE,
  MemoryAuthStore,
  ResendMailer,
  handle,
  type AuthLogEntry,
  type Env,
} from '../src/index.js';

const ORIGIN = 'https://dashboard.example.test';
const START = 1_800_000_000;
const API_KEY = 're_test_not_a_key_0123456789abcdef';
const ADDRESS = 'someone@private.example';
const FROM = 'Evergreen <onboarding@resend.dev>';

interface StrictFetch {
  calls: number;
  fetcher: typeof fetch;
}

/** A `function` (not an arrow), so `this` is whatever the caller gave it. */
function strictFetch(): StrictFetch {
  const state = { calls: 0 } as StrictFetch;
  state.fetcher = function (this: unknown): Promise<Response> {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError('Illegal invocation: function called with incorrect this reference');
    }
    state.calls += 1;
    return Promise.resolve(new Response('{"id":"x"}', { status: 200 }));
  } as unknown as typeof fetch;
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the mailer calls fetch without itself as `this`', () => {
  it('a fetch that needs no `this` but the global one sends OK', async () => {
    const strict = strictFetch();
    await new ResendMailer(API_KEY, FROM, strict.fetcher).sendSigninCode(ADDRESS, '12345678');
    expect(strict.calls).toBe(1);
  });

  it('the strict stand-in does throw when called as a method (the stand-in itself is honest)', () => {
    const strict = strictFetch();
    const holder = { fetcher: strict.fetcher };
    expect(() => holder.fetcher('https://x.invalid')).toThrow(/Illegal invocation/);
  });

  it('the default fetch (the global one) is called the same way, through POST /auth/email/start', async () => {
    const strict = strictFetch();
    vi.stubGlobal('fetch', strict.fetcher);
    const logs: AuthLogEntry[] = [];
    const store = new MemoryAuthStore(() => START);
    const env: Env = {
      ENVIRONMENT: 'preview',
      DATABASE_URL: 'postgres://user:pw@db.invalid/evergreen',
      SIGNIN_CODE_PEPPER: 'test-pepper-not-a-secret',
      EMAIL_API_KEY: API_KEY,
      CHALLENGE_SIGNING_KEY: Keypair.random().secret(),
      EMAIL_FROM: 'onboarding@resend.dev',
      DASHBOARD_ORIGIN: ORIGIN,
    };
    const res = await handle(
      new Request(`${ORIGIN}${API_BASE}/auth/email/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ email: ADDRESS }),
      }),
      env,
      { createStore: () => store, now: () => START, log: (entry) => logs.push(entry) },
    );
    expect(res.status).toBe(202);
    expect(strict.calls).toBe(1);
    expect(logs).toEqual([]);
  });
});
