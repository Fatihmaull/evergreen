/**
 * PH2-E2-08 read routes (docs/API.md §7): GET /jobs, GET /jobs/{jobId} and
 * GET /ledger, driven through the Worker's own `handle` with the in-memory
 * stores. The global `fetch` throws: nothing here touches the network.
 *
 * POST /jobs is deliberately not built (Fatih, 2026-11-24): it must answer 405.
 */
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE,
  CSRF_HEADER,
  MemoryAuthStore,
  MemoryJobsStore,
  decodeCursor,
  encodeCursor,
  handle,
  type Env,
  type HandleOptions,
  memoryOutboxStore,
  type Job,
  type LedgerRow,
} from '../src/index.js';

const ORIGIN = 'https://dashboard.example.test';
const C1 = StrKey.encodeContract(Buffer.alloc(32, 1));
const C2 = StrKey.encodeContract(Buffer.alloc(32, 2));
const G1 = Keypair.random().publicKey();

let clock: number;
let auth: MemoryAuthStore;
let jobs: MemoryJobsStore;
let sent: string[];
let env: Env;
let options: HandleOptions;

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is off in tests');
  });
  clock = 1_800_000_000;
  auth = new MemoryAuthStore(() => clock);
  jobs = new MemoryJobsStore();
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
    createJobsStore: () => jobs,
    now: () => clock,
    fetch: ((_url: string, init: RequestInit) => {
      sent.push(String(init.body));
      return Promise.resolve(new Response('{"id":"x"}', { status: 200 }));
    }) as unknown as typeof fetch,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function req(method: string, path: string, cookie?: string, body?: unknown): Request {
  const headers = new Headers({ 'content-type': 'application/json', origin: ORIGIN });
  if (cookie !== undefined) headers.set('cookie', cookie);
  return new Request(`${ORIGIN}${API_BASE}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const call = (method: string, path: string, cookie?: string, body?: unknown) =>
  handle(req(method, path, cookie, body), env, options);

interface Session {
  cookie: string;
  csrf: string;
  userId: string;
}
async function signIn(email: string): Promise<Session> {
  expect((await call('POST', '/auth/email/start', undefined, { email })).status).toBe(202);
  const code = /\b(\d{8})\b/.exec((JSON.parse(sent.at(-1)!) as { text: string }).text)![1]!;
  const res = await call('POST', '/auth/email/verify', undefined, { email, code });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const me = (await (await call('GET', '/me', cookie)).json()) as {
    csrfToken: string;
    user: { id: string };
  };
  return { cookie, csrf: me.csrfToken, userId: me.user.id };
}

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const job = (n: number, over: Partial<Job> = {}): Job => ({
  id: uuid(n),
  network: 'testnet',
  contractId: C1,
  kind: 'autopilot',
  payerWallet: G1,
  createdAt: new Date(Date.UTC(2026, 10, 24, 3, n)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 10, 24, 3, n)).toISOString(),
  status: 'queued',
  steps: {},
  ...over,
});
const row = (n: number, jobId: string, over: Partial<LedgerRow> = {}): LedgerRow => ({
  id: String(n),
  jobId,
  network: 'testnet',
  wallet: G1,
  contractId: C1,
  kind: 'pull',
  amountStroops: '288405',
  txHash: `hash${n}`,
  ledger: 100 + n,
  recordedAt: new Date(Date.UTC(2026, 10, 24, 4, n)).toISOString(),
  ...over,
});

type ListBody<T> = { items: T[]; nextCursor: string | null };
const body = async <T>(res: Response): Promise<T> => (await res.json()) as T;

describe('GET /jobs', () => {
  it('🔴 needs a session', async () => {
    const res = await call('GET', '/jobs');
    expect(res.status).toBe(401);
  });

  it('🔴 returns only the caller’s jobs, newest first, never cached', async () => {
    const a = await signIn('a@example.test');
    const b = await signIn('b@example.test');
    jobs.addJob(a.userId, job(1));
    jobs.addJob(a.userId, job(3, { status: 'extended' }));
    jobs.addJob(b.userId, job(2));
    const res = await call('GET', '/jobs', a.cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const out = await body<ListBody<Job>>(res);
    expect(out.items.map((j) => j.id)).toEqual([uuid(3), uuid(1)]);
    expect(out.nextCursor).toBeNull();
  });

  it('filters by contractId and pages with an opaque cursor', async () => {
    const a = await signIn('a@example.test');
    for (let n = 1; n <= 5; n += 1)
      jobs.addJob(a.userId, job(n, n === 4 ? { contractId: C2 } : {}));
    const only = await body<ListBody<Job>>(await call('GET', `/jobs?contractId=${C2}`, a.cookie));
    expect(only.items.map((j) => j.id)).toEqual([uuid(4)]);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const q: string = cursor === null ? '' : `&cursor=${cursor}`;
      const page: ListBody<Job> = await body(await call('GET', `/jobs?limit=2${q}`, a.cookie));
      seen.push(...page.items.map((j) => j.id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(seen).toEqual([5, 4, 3, 2, 1].map(uuid));
  });

  it.each([
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=abc', 'limit'],
    ['cursor=!!', 'cursor'],
    [`cursor=${encodeCursor({ t: '1', id: 'not-a-uuid' })}`, 'cursor'],
    ['contractId=CNOPE', 'contractId'],
  ])('refuses %s with 400 naming %s', async (query, field) => {
    const a = await signIn('a@example.test');
    const res = await call('GET', `/jobs?${query}`, a.cookie);
    expect(res.status).toBe(400);
    expect(await body<{ error: { code: string; details: { field: string } } }>(res)).toMatchObject({
      error: { code: 'INVALID_REQUEST', details: { field } },
    });
  });

  it('answers 503 when the database is not configured, naming nothing', async () => {
    const a = await signIn('a@example.test');
    options = { ...options, createJobsStore: () => undefined };
    const res = await call('GET', '/jobs', a.cookie);
    expect(res.status).toBe(503);
    expect(await body<{ error: { code: string } }>(res)).toMatchObject({
      error: { code: 'UPSTREAM_UNAVAILABLE' },
    });
  });

  it('answers 503 when the store throws', async () => {
    const a = await signIn('a@example.test');
    jobs.listJobs = () => Promise.reject(new Error('connection refused to db.internal'));
    const res = await call('GET', '/jobs', a.cookie);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('db.internal');
  });
});

describe('GET /jobs/{jobId}', () => {
  it('returns the caller’s job with its steps', async () => {
    const a = await signIn('a@example.test');
    const steps = {
      pull: { at: '2026-11-24T03:30:05.000Z', txHash: 'p', amountStroops: '288405' },
      refund: { at: '2026-11-24T03:30:12.000Z', txHash: 'r', amountStroops: '121445' },
    };
    jobs.addJob(a.userId, job(1, { status: 'extended', steps }));
    const res = await call('GET', `/jobs/${uuid(1)}`, a.cookie);
    expect(res.status).toBe(200);
    expect(await body<{ job: Job }>(res)).toEqual({ job: job(1, { status: 'extended', steps }) });
  });

  it('🔴 another user’s job is a 404, the same as no job', async () => {
    const a = await signIn('a@example.test');
    const b = await signIn('b@example.test');
    jobs.addJob(b.userId, job(1));
    expect((await call('GET', `/jobs/${uuid(1)}`, a.cookie)).status).toBe(404);
    expect((await call('GET', `/jobs/${uuid(2)}`, a.cookie)).status).toBe(404);
  });

  it('refuses a malformed id with 400 and other methods with 405', async () => {
    const a = await signIn('a@example.test');
    expect((await call('GET', '/jobs/nope', a.cookie)).status).toBe(400);
    const del = await call('DELETE', `/jobs/${uuid(1)}`, a.cookie);
    expect(del.status).toBe(405);
    expect(del.headers.get('allow')).toBe('GET');
  });
});

describe('GET /ledger', () => {
  it('🔴 needs a session and returns only rows of the caller’s jobs', async () => {
    expect((await call('GET', '/ledger')).status).toBe(401);
    const a = await signIn('a@example.test');
    const b = await signIn('b@example.test');
    jobs.addJob(a.userId, job(1));
    jobs.addJob(b.userId, job(2));
    jobs.addLedgerRow(row(1, uuid(1)));
    jobs.addLedgerRow(row(2, uuid(1), { kind: 'rent', txHash: null, ledger: null }));
    jobs.addLedgerRow(row(3, uuid(2)));
    const out = await body<ListBody<LedgerRow>>(await call('GET', '/ledger', a.cookie));
    expect(out.items.map((r) => r.id)).toEqual(['2', '1']);
    expect(out.items[0]).toMatchObject({ kind: 'rent', txHash: null, ledger: null });
  });

  it('filters by wallet, contract and job', async () => {
    const a = await signIn('a@example.test');
    const other = Keypair.random().publicKey();
    jobs.addJob(a.userId, job(1));
    jobs.addJob(a.userId, job(2, { contractId: C2 }));
    jobs.addLedgerRow(row(1, uuid(1)));
    jobs.addLedgerRow(row(2, uuid(2), { contractId: C2, wallet: other }));
    const ids = async (q: string) =>
      (await body<ListBody<LedgerRow>>(await call('GET', `/ledger?${q}`, a.cookie))).items.map(
        (r) => r.id,
      );
    expect(await ids(`wallet=${other}`)).toEqual(['2']);
    expect(await ids(`contractId=${C1}`)).toEqual(['1']);
    expect(await ids(`jobId=${uuid(1)}`)).toEqual(['1']);
  });

  it('refuses a malformed wallet, job id or cursor', async () => {
    const a = await signIn('a@example.test');
    expect((await call('GET', '/ledger?wallet=GNOPE', a.cookie)).status).toBe(400);
    expect((await call('GET', '/ledger?jobId=7', a.cookie)).status).toBe(400);
    const uuidCursor = encodeCursor({ t: '1', id: uuid(1) });
    expect((await call('GET', `/ledger?cursor=${uuidCursor}`, a.cookie)).status).toBe(400);
  });
});

describe('cursor', () => {
  it('round-trips and rejects anything it did not make', () => {
    const key = { t: '1795000000123456', id: uuid(7) };
    expect(decodeCursor(encodeCursor(key), /^[0-9a-f-]{36}$/)).toEqual(key);
    expect(decodeCursor('e30', /./)).toBeUndefined(); // {}
    expect(decodeCursor('a'.repeat(201), /./)).toBeUndefined();
  });
});

describe('POST /jobs (Extend now, option A)', () => {
  const KEY = '3b241101-e2bb-4255-8caf-4136c566a962';
  const KEY2 = '9b2d1c3e-1f2a-4b5c-9d6e-7f8a9b0c1d2e';
  const G = Keypair.random().publicKey();
  const extendBody = { network: 'testnet', contractId: C1, kind: 'extend-now' };

  async function post(
    s: Session,
    o: { key?: string | null; body?: unknown; csrf?: string | null } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      origin: ORIGIN,
      cookie: s.cookie,
      'content-type': 'application/json',
    };
    if (o.csrf !== null) headers[CSRF_HEADER] = o.csrf ?? s.csrf;
    if (o.key !== null) headers['idempotency-key'] = o.key ?? KEY;
    return handle(
      new Request(`${ORIGIN}${API_BASE}/jobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(o.body ?? extendBody),
      }),
      env,
      options,
    );
  }
  const code = async (res: Response): Promise<string> =>
    (await body<{ error: { code: string } }>(res)).error.code;

  let outbox: ReturnType<typeof memoryOutboxStore>;
  beforeEach(() => {
    outbox = memoryOutboxStore();
    env = {
      ...env,
      EXTEND_NOW_ENABLED: 'true',
      ALERTS_SEND: 'send',
      ALERTS_ALLOWLIST: 'a@example.test',
    } as Env;
    options = { ...options, createAlertOutboxStore: () => outbox };
  });

  it('🔴 queues one extend-now job paid by the item’s autopilot payer, and emails the user', async () => {
    const a = await signIn('a@example.test');
    jobs.setItem(a.userId, C1, G);
    const before = sent.length;
    const res = await post(a);
    expect(res.status).toBe(202);
    const { job } = await body<{ job: Job }>(res);
    expect(job).toMatchObject({
      contractId: C1,
      kind: 'extend-now',
      payerWallet: G,
      status: 'queued',
      steps: {},
    });
    const mail = sent.slice(before).map((b) => JSON.parse(b) as { subject: string; text: string });
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toContain('Extend now was requested');
    expect(mail[0]!.text).toContain('runs within about 15 minutes');
    expect([...outbox.rows.values()][0]).toMatchObject({ status: 'sent' });
  });

  it('🔴 the same key and body return the same job, never a second one, and email once', async () => {
    const a = await signIn('a@example.test');
    jobs.setItem(a.userId, C1, G);
    const first = await body<{ job: Job }>(await post(a));
    const before = sent.length;
    const again = await post(a);
    expect(again.status).toBe(200);
    expect((await body<{ job: Job }>(again)).job.id).toBe(first.job.id);
    expect(sent.length).toBe(before);
    expect((await body<ListBody<Job>>(await call('GET', '/jobs', a.cookie))).items).toHaveLength(1);
  });

  it('the same key with a different body is 409', async () => {
    const a = await signIn('a@example.test');
    jobs.setItem(a.userId, C1, G);
    jobs.setItem(a.userId, C2, G);
    await post(a);
    const res = await post(a, { body: { ...extendBody, contractId: C2 } });
    expect(res.status).toBe(409);
    expect(await code(res)).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('🔴 a second Extend now on the same contract within 24 hours is 429 with when it resets', async () => {
    const a = await signIn('a@example.test');
    jobs.setItem(a.userId, C1, G);
    await post(a);
    clock += 3600;
    const res = await post(a, { key: KEY2 });
    expect(res.status).toBe(429);
    const err = (await body<{ error: { code: string; details: Record<string, unknown> } }>(res))
      .error;
    expect(err.code).toBe('DAILY_LIMIT_REACHED');
    expect(err.details).toMatchObject({ limit: 1, used: 1 });
    expect(typeof err.details['resetsAt']).toBe('string');
  });

  it('a pre-flight failure does not use the day’s Extend now', async () => {
    const a = await signIn('a@example.test');
    jobs.setItem(a.userId, C1, G);
    jobs.addJob(a.userId, {
      ...job(1, { kind: 'extend-now', status: 'preflight-failed' }),
      createdAt: new Date(clock * 1000 - 60_000).toISOString(),
    });
    expect((await post(a)).status).toBe(202);
  });

  it('🔴 refuses an item with autopilot off (422) and a contract not on the caller’s list (404)', async () => {
    const a = await signIn('a@example.test');
    const b = await signIn('b@example.test');
    jobs.setItem(a.userId, C1, null);
    jobs.setItem(b.userId, C2, G);
    const off = await post(a);
    expect(off.status).toBe(422);
    expect(await code(off)).toBe('AUTOPILOT_OFF');
    const other = await post(a, { key: KEY2, body: { ...extendBody, contractId: C2 } });
    expect(other.status).toBe(404);
  });

  it('🔴 is off unless EXTEND_NOW_ENABLED is exactly "true"', async () => {
    const a = await signIn('a@example.test');
    jobs.setItem(a.userId, C1, G);
    for (const flag of [undefined, '', 'TRUE', '1', 'yes']) {
      env = { ...env, EXTEND_NOW_ENABLED: flag } as Env;
      const res = await post(a);
      expect(res.status).toBe(403);
      expect(await code(res)).toBe('EXTEND_NOW_DISABLED');
    }
    expect((await body<ListBody<Job>>(await call('GET', '/jobs', a.cookie))).items).toEqual([]);
  });

  it('🔴 needs CSRF, an Idempotency-Key (UUID v4), testnet and kind extend-now', async () => {
    const a = await signIn('a@example.test');
    jobs.setItem(a.userId, C1, G);
    expect((await post(a, { csrf: null })).status).toBe(403);
    const nokey = await post(a, { key: null });
    expect(nokey.status).toBe(400);
    expect(await code(nokey)).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect((await post(a, { key: 'not-a-uuid' })).status).toBe(400);
    const main = await post(a, { body: { ...extendBody, network: 'mainnet' } });
    expect(main.status).toBe(422);
    expect(await code(main)).toBe('NETWORK_NOT_WRITABLE');
    expect((await post(a, { body: { ...extendBody, kind: 'autopilot' } })).status).toBe(400);
    expect((await body<ListBody<Job>>(await call('GET', '/jobs', a.cookie))).items).toEqual([]);
  });

  it('a failed email never changes the answer', async () => {
    const a = await signIn('a@example.test');
    jobs.setItem(a.userId, C1, G);
    options = {
      ...options,
      fetch: (() => Promise.reject(new Error('resend down'))) as unknown as typeof fetch,
    };
    // Sign-in already happened, so only the notice uses this fetch.
    expect((await post(a)).status).toBe(202);
  });
});
