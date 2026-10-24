/**
 * PH2-E2-05 watchlist routes (docs/API.md §6), driven through the Worker's own
 * `handle` so the mount, the router and the routes are tested together. The
 * database is the in-memory fake and the global `fetch` throws: nothing here
 * touches the network.
 */
import { Keypair, StrKey, xdr } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE,
  CSRF_HEADER,
  DAY_SECONDS,
  MemoryAuthStore,
  MemoryWatchlistStore,
  WATCHLIST_WRITE_ROUTES,
  handle,
  type Env,
  type WatchlistMountOptions,
  type WatchlistStore,
} from '../src/index.js';

const ORIGIN = 'https://dashboard.example.test';
const START = 1_800_000_000;
const FLOOR = 15_888;

const contract = (n: number): string => StrKey.encodeContract(Buffer.alloc(32, n));
const C1 = contract(1);
const C2 = contract(2);
const dataKey = (): string =>
  xdr.LedgerKey.account(
    new xdr.LedgerKeyAccount({ accountId: Keypair.random().xdrPublicKey() }),
  ).toXDR('base64');

let clock: number;
let auth: MemoryAuthStore;
let watch: MemoryWatchlistStore;
let sent: string[];
let env: Env;
let options: WatchlistMountOptions;

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is off in tests');
  });
  clock = START;
  auth = new MemoryAuthStore(() => clock);
  watch = new MemoryWatchlistStore();
  sent = [];
  env = {
    DATABASE_URL: 'postgres://user:pw@db.invalid/evergreen',
    SIGNIN_CODE_PEPPER: 'test-pepper-not-a-secret',
    EMAIL_API_KEY: 're_test_not_a_key',
    CHALLENGE_SIGNING_KEY: Keypair.random().secret(),
    EMAIL_FROM: 'Evergreen <signin@example.test>',
    DASHBOARD_ORIGIN: ORIGIN,
    THRESHOLD_FLOOR_LEDGERS: String(FLOOR),
  };
  options = {
    createStore: () => auth,
    createWatchlistStore: () => watch,
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

interface Opts {
  body?: unknown;
  cookie?: string;
  csrf?: string;
  origin?: string | null;
}

function req(method: string, path: string, o: Opts = {}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (o.origin !== null) headers.set('origin', o.origin ?? ORIGIN);
  if (o.cookie !== undefined) headers.set('cookie', o.cookie);
  if (o.csrf !== undefined) headers.set(CSRF_HEADER, o.csrf);
  return new Request(`${ORIGIN}${API_BASE}${path}`, {
    method,
    headers,
    ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }),
  });
}

const call = (method: string, path: string, o: Opts = {}) =>
  handle(req(method, path, o), env, options);

interface Session {
  cookie: string;
  csrf: string;
  userId: string;
}

async function signIn(email = 'a@example.test'): Promise<Session> {
  expect((await call('POST', '/auth/email/start', { body: { email } })).status).toBe(202);
  const code = /\b(\d{8})\b/.exec((JSON.parse(sent.at(-1)!) as { text: string }).text)![1]!;
  const res = await call('POST', '/auth/email/verify', { body: { email, code } });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const me = (await (await call('GET', '/me', { cookie })).json()) as {
    csrfToken: string;
    user: { id: string };
  };
  return { cookie, csrf: me.csrfToken, userId: me.user.id };
}

/** A wallet the user linked (the SEP-10 flow itself is tested in auth-routes.test.ts). */
function linkWallet(s: Session): string {
  const account = Keypair.random().publicKey();
  auth.wallets.set(account, {
    userId: s.userId,
    link: { account, network: 'testnet', linkedAt: clock },
  });
  return account;
}

const write = (method: string, path: string, s: Session, body?: unknown) =>
  call(method, path, { cookie: s.cookie, csrf: s.csrf, ...(body === undefined ? {} : { body }) });
const get = (path: string, s: Session) => call('GET', path, { cookie: s.cookie });

interface ItemJson {
  network: string;
  contractId: string;
  label?: string;
  addedAt: string;
  scope: unknown;
  autopilot: { enabled: boolean } & Record<string, unknown>;
  extendNow: { limitPerDay: number; usedToday: number; resetsAt: string };
  lastObservation: Record<string, unknown> | null;
}
const listOf = async (s: Session) =>
  ((await (await get('/watchlist', s)).json()) as { items: ItemJson[] }).items;

const NO_KEYS = { noDataKeys: true };
const add = (s: Session, contractId = C1, extra: Record<string, unknown> = {}) =>
  write('POST', '/watchlist', s, { network: 'testnet', contractId, scope: NO_KEYS, ...extra });
const itemPath = (contractId = C1, network = 'testnet') => `/watchlist/${network}/${contractId}`;
const autopilot = (payerWallet: string, over: Record<string, unknown> = {}) => ({
  enabled: true,
  payerWallet,
  thresholdLedgers: FLOOR,
  extendToLedgers: FLOOR * 4,
  budget: { perJobMaxStroops: '50000000', per30DaysMaxStroops: '200000000' },
  ...over,
});
const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; retryable: boolean; details: unknown } }).error;

/** The rows, as a value, to prove a refused request changed nothing. */
const snapshot = () => JSON.stringify([watch.rows, watch.jobs]);

describe('every write path is guarded (guard-removal tests)', () => {
  const pathOf = (p: string) => p.replace('{network}', 'testnet').replace('{contractId}', C1);
  const bodyOf = (method: string) =>
    method === 'POST'
      ? { network: 'testnet', contractId: C1, scope: NO_KEYS }
      : method === 'PATCH'
        ? { label: 'changed' }
        : undefined;
  const run = (method: string, p: string, o: Opts) =>
    call(method, pathOf(p), {
      ...o,
      ...(bodyOf(method) === undefined ? {} : { body: bodyOf(method) }),
    });

  it('covers exactly the three state-changing routes', () => {
    expect(WATCHLIST_WRITE_ROUTES.map(([m, p]) => `${m} ${p}`)).toEqual([
      'POST /watchlist',
      'PATCH /watchlist/{network}/{contractId}',
      'DELETE /watchlist/{network}/{contractId}',
    ]);
  });

  it('GET /watchlist refuses no session with 401', async () => {
    expect((await call('GET', '/watchlist')).status).toBe(401);
  });

  it.each(WATCHLIST_WRITE_ROUTES)('%s %s refuses no session with 401', async (method, p) => {
    const s = await signIn();
    await add(s);
    const before = snapshot();
    const res = await run(method, p, {});
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe('UNAUTHENTICATED');
    expect(snapshot()).toBe(before);
  });

  it.each(WATCHLIST_WRITE_ROUTES)(
    '%s %s refuses a missing CSRF token with 403',
    async (method, p) => {
      const s = await signIn();
      await add(s);
      const before = snapshot();
      const res = await run(method, p, { cookie: s.cookie });
      expect(res.status).toBe(403);
      expect((await errorOf(res)).code).toBe('CSRF_FAILED');
      expect(snapshot()).toBe(before);
    },
  );

  it.each(WATCHLIST_WRITE_ROUTES)(
    '%s %s refuses a wrong CSRF token with 403',
    async (method, p) => {
      const s = await signIn();
      await add(s);
      const before = snapshot();
      const res = await run(method, p, { cookie: s.cookie, csrf: 'x'.repeat(43) });
      expect(res.status).toBe(403);
      expect(snapshot()).toBe(before);
    },
  );

  it.each(WATCHLIST_WRITE_ROUTES)('%s %s refuses a foreign Origin with 403', async (method, p) => {
    const s = await signIn();
    await add(s);
    const before = snapshot();
    const res = await run(method, p, {
      cookie: s.cookie,
      csrf: s.csrf,
      origin: 'https://evil.test',
    });
    expect(res.status).toBe(403);
    expect(snapshot()).toBe(before);
  });

  it.each(WATCHLIST_WRITE_ROUTES)('%s %s refuses a missing Origin with 403', async (method, p) => {
    const s = await signIn();
    await add(s);
    const before = snapshot();
    const res = await run(method, p, { cookie: s.cookie, csrf: s.csrf, origin: null });
    expect(res.status).toBe(403);
    expect(snapshot()).toBe(before);
  });
});

describe('a user sees and changes only their own items (guard-removal tests)', () => {
  it("never lists another user's item", async () => {
    const a = await signIn('a@example.test');
    const b = await signIn('b@example.test');
    await add(a, C1, { label: 'a-only' });
    await add(b, C2);
    expect((await listOf(a)).map((i) => i.contractId)).toEqual([C1]);
    expect((await listOf(b)).map((i) => i.contractId)).toEqual([C2]);
    expect(JSON.stringify(await listOf(b))).not.toContain('a-only');
  });

  it("answers 404 to another user's PATCH and changes nothing", async () => {
    const a = await signIn('a@example.test');
    const b = await signIn('b@example.test');
    await add(a, C1, { label: 'mine' });
    const before = snapshot();
    const res = await write('PATCH', itemPath(C1), b, { label: 'taken' });
    expect(res.status).toBe(404);
    expect(snapshot()).toBe(before);
    expect((await listOf(a))[0]!.label).toBe('mine');
  });

  it("answers 404 to another user's DELETE and leaves the item and its queued jobs", async () => {
    const a = await signIn('a@example.test');
    const b = await signIn('b@example.test');
    await add(a, C1);
    watch.jobs.push({ userId: a.userId, network: 'testnet', contractId: C1, status: 'queued' });
    const before = snapshot();
    expect((await write('DELETE', itemPath(C1), b)).status).toBe(404);
    expect(snapshot()).toBe(before);
    expect(await listOf(a)).toHaveLength(1);
  });

  it("refuses another user's wallet as the payer: Evergreen never pays for it", async () => {
    const a = await signIn('a@example.test');
    const b = await signIn('b@example.test');
    const theirs = linkWallet(a);
    await add(b, C1);
    const res = await write('PATCH', itemPath(C1), b, { autopilot: autopilot(theirs) });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe('INVALID_REQUEST');
    expect((await listOf(b))[0]!.autopilot).toEqual({ enabled: false });
  });

  it('refuses a payer that is not linked at all', async () => {
    const a = await signIn();
    await add(a);
    const res = await write('PATCH', itemPath(), a, {
      autopilot: autopilot(Keypair.random().publicKey()),
    });
    expect(res.status).toBe(422);
    expect((await listOf(a))[0]!.autopilot).toEqual({ enabled: false });
  });

  it('a user can add a contract another user already watches', async () => {
    const a = await signIn('a@example.test');
    const b = await signIn('b@example.test');
    expect((await add(a)).status).toBe(201);
    expect((await add(b)).status).toBe(201);
  });
});

describe('POST /watchlist', () => {
  it('adds with 201 and answers 200 when already present, without overwriting', async () => {
    const s = await signIn();
    const first = await add(s, C1, { label: 'first' });
    expect(first.status).toBe(201);
    const body = (await first.json()) as { item: ItemJson };
    expect(body.item).toMatchObject({
      network: 'testnet',
      contractId: C1,
      label: 'first',
      scope: NO_KEYS,
      autopilot: { enabled: false },
      lastObservation: null,
    });
    const again = await add(s, C1, { label: 'second', scope: { dataKeys: [dataKey()] } });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { item: ItemJson }).item.label).toBe('first');
    expect(await listOf(s)).toHaveLength(1);
  });

  it('stores a scope with declared data keys', async () => {
    const s = await signIn();
    const k = dataKey();
    const res = await add(s, C1, { scope: { dataKeys: [k, k] } });
    expect(res.status).toBe(201);
    expect((await listOf(s))[0]!.scope).toEqual({ dataKeys: [k] });
  });

  it('refuses mainnet with 422 NETWORK_NOT_WRITABLE and stores nothing', async () => {
    const s = await signIn();
    const res = await write('POST', '/watchlist', s, {
      network: 'mainnet',
      contractId: C1,
      scope: NO_KEYS,
    });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe('NETWORK_NOT_WRITABLE');
    expect(watch.rows).toHaveLength(0);
  });

  it.each([
    ['an unknown network', { network: 'futurenet', contractId: C1, scope: NO_KEYS }],
    ['a malformed contract id', { network: 'testnet', contractId: 'CABC', scope: NO_KEYS }],
    [
      'a G-account as contract id',
      { network: 'testnet', contractId: Keypair.random().publicKey(), scope: NO_KEYS },
    ],
    [
      'a contract id with a bad checksum',
      { network: 'testnet', contractId: `${C1.slice(0, -1)}A`, scope: NO_KEYS },
    ],
    ['a missing scope', { network: 'testnet', contractId: C1 }],
    ['an empty dataKeys', { network: 'testnet', contractId: C1, scope: { dataKeys: [] } }],
    [
      'a data key that is not a LedgerKey',
      { network: 'testnet', contractId: C1, scope: { dataKeys: ['AAAA'] } },
    ],
    ['noDataKeys false', { network: 'testnet', contractId: C1, scope: { noDataKeys: false } }],
    [
      'both scopes',
      { network: 'testnet', contractId: C1, scope: { noDataKeys: true, dataKeys: [] } },
    ],
    [
      'an unknown field',
      { network: 'testnet', contractId: C1, scope: NO_KEYS, autopilot: { enabled: true } },
    ],
    ['a blank label', { network: 'testnet', contractId: C1, scope: NO_KEYS, label: '  ' }],
    [
      'a label with a control character',
      { network: 'testnet', contractId: C1, scope: NO_KEYS, label: 'a\nb' },
    ],
    [
      'a label over 100 characters',
      { network: 'testnet', contractId: C1, scope: NO_KEYS, label: 'x'.repeat(101) },
    ],
    ['a non-string label', { network: 'testnet', contractId: C1, scope: NO_KEYS, label: 7 }],
    ['an array body', [1]],
  ])('refuses %s with 400 INVALID_REQUEST and stores nothing', async (_name, body) => {
    const s = await signIn();
    const res = await write('POST', '/watchlist', s, body);
    expect(res.status).toBe(400);
    const err = await errorOf(res);
    expect(err.code).toBe('INVALID_REQUEST');
    expect(err.retryable).toBe(false);
    expect(watch.rows).toHaveLength(0);
  });

  it('refuses a body that is not JSON', async () => {
    const s = await signIn();
    const res = await handle(
      new Request(`${ORIGIN}${API_BASE}/watchlist`, {
        method: 'POST',
        body: '{nope',
        headers: { origin: ORIGIN, cookie: s.cookie, [CSRF_HEADER]: s.csrf },
      }),
      env,
      options,
    );
    expect(res.status).toBe(400);
  });

  it('does not echo the request value in an error', async () => {
    const s = await signIn();
    const res = await write('POST', '/watchlist', s, {
      network: 'testnet',
      contractId: 'SECRET-LOOKING-VALUE',
      scope: NO_KEYS,
    });
    expect(JSON.stringify(await res.json())).not.toContain('SECRET-LOOKING-VALUE');
  });
});

describe('GET /watchlist', () => {
  it('lists the items with the extendNow count and its limit', async () => {
    const s = await signIn();
    await add(s, C1);
    const [item] = await listOf(s);
    expect(item!.extendNow).toEqual({
      limitPerDay: 3,
      usedToday: 0,
      resetsAt: new Date(START * 1000).toISOString(),
    });
  });

  it('counts only this caller’s pulled uses in the rolling 24 hours', async () => {
    const a = await signIn('a@example.test');
    const b = await signIn('b@example.test');
    await add(a, C1);
    const use = (userId: string, pulledAt: number) =>
      watch.uses.push({ userId, network: 'testnet', contractId: C1, pulledAt });
    use(a.userId, START - DAY_SECONDS); // exactly 24 h old: out of the window
    use(a.userId, START - DAY_SECONDS + 600); // oldest counted
    use(a.userId, START - 60);
    use(b.userId, START - 30); // someone else's use is not mine
    const [item] = await listOf(a);
    expect(item!.extendNow.usedToday).toBe(2);
    expect(item!.extendNow.resetsAt).toBe(new Date((START + 600) * 1000).toISOString());
  });

  it('reads the limit from EXTEND_NOW_PER_USER_CONTRACT_PER_DAY', async () => {
    env = { ...env, EXTEND_NOW_PER_USER_CONTRACT_PER_DAY: '5' };
    const s = await signIn();
    await add(s);
    expect((await listOf(s))[0]!.extendNow.limitPerDay).toBe(5);
  });

  it('passes the latest observation through with its ledger and time', async () => {
    const s = await signIn();
    await add(s, C1);
    const obs = (observedAtLedger: number, health: string) => ({
      network: 'testnet' as const,
      contractId: C1,
      observedAtLedger,
      observedAt: START - 10,
      scan: { marker: observedAtLedger },
      health,
    });
    watch.observations.push(obs(100, 'healthy'), obs(200, 'warning'));
    expect((await listOf(s))[0]!.lastObservation).toEqual({
      observedAtLedger: 200,
      observedAt: new Date((START - 10) * 1000).toISOString(),
      scan: { marker: 200 },
      health: 'warning',
    });
  });

  it('sets no-store and returns JSON', async () => {
    const s = await signIn();
    const res = await get('/watchlist', s);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
  });
});

describe('PATCH /watchlist/{network}/{contractId}', () => {
  it('updates the label and scope', async () => {
    const s = await signIn();
    await add(s);
    const k = dataKey();
    const res = await write('PATCH', itemPath(), s, {
      label: ' renamed ',
      scope: { dataKeys: [k] },
    });
    expect(res.status).toBe(200);
    const { item } = (await res.json()) as { item: ItemJson };
    expect(item.label).toBe('renamed');
    expect(item.scope).toEqual({ dataKeys: [k] });
  });

  it('answers 404 for an item that is not on the list, and 400 for a malformed path', async () => {
    const s = await signIn();
    expect((await write('PATCH', itemPath(C2), s, { label: 'x' })).status).toBe(404);
    expect((await write('PATCH', itemPath('nope'), s, { label: 'x' })).status).toBe(400);
    expect((await write('PATCH', itemPath(C1, 'futurenet'), s, { label: 'x' })).status).toBe(400);
    expect((await write('PATCH', '/watchlist/testnet/%E0%A4%A', s, { label: 'x' })).status).toBe(
      400,
    );
  });

  it.each([
    ['an empty body', {}],
    ['an unknown field', { label: 'x', network: 'mainnet' }],
    ['autopilot that is not an object', { autopilot: true }],
    ['autopilot without enabled', { autopilot: {} }],
    ['autopilot off with extra settings', { autopilot: { enabled: false, thresholdLedgers: 1 } }],
  ])('refuses %s with 400', async (_name, body) => {
    const s = await signIn();
    await add(s);
    const before = snapshot();
    expect((await write('PATCH', itemPath(), s, body)).status).toBe(400);
    expect(snapshot()).toBe(before);
  });

  describe('turning autopilot on', () => {
    it('stores the settings for a linked payer and returns them as strings', async () => {
      const s = await signIn();
      await add(s);
      const payer = linkWallet(s);
      const res = await write('PATCH', itemPath(), s, { autopilot: autopilot(payer) });
      expect(res.status).toBe(200);
      const { item } = (await res.json()) as { item: ItemJson };
      expect(item.autopilot).toEqual({
        enabled: true,
        payerWallet: payer,
        thresholdLedgers: FLOOR,
        extendToLedgers: FLOOR * 4,
        budget: { perJobMaxStroops: '50000000', per30DaysMaxStroops: '200000000' },
      });
    });

    it('refuses a threshold below the floor and quotes the floor', async () => {
      const s = await signIn();
      await add(s);
      const payer = linkWallet(s);
      const res = await write('PATCH', itemPath(), s, {
        autopilot: autopilot(payer, { thresholdLedgers: FLOOR - 1 }),
      });
      expect(res.status).toBe(422);
      const err = await errorOf(res);
      expect(err.code).toBe('THRESHOLD_BELOW_FLOOR');
      expect(err.details).toEqual({ floorLedgers: FLOOR });
      expect((await listOf(s))[0]!.autopilot).toEqual({ enabled: false });
    });

    it('accepts a threshold exactly at the floor', async () => {
      const s = await signIn();
      await add(s);
      const payer = linkWallet(s);
      expect((await write('PATCH', itemPath(), s, { autopilot: autopilot(payer) })).status).toBe(
        200,
      );
    });

    it('answers 503 and enables nothing when no floor is configured', async () => {
      env = { ...env };
      delete env['THRESHOLD_FLOOR_LEDGERS'];
      const s = await signIn();
      await add(s);
      const payer = linkWallet(s);
      const res = await write('PATCH', itemPath(), s, { autopilot: autopilot(payer) });
      expect(res.status).toBe(503);
      expect((await errorOf(res)).code).toBe('UPSTREAM_UNAVAILABLE');
      expect((await listOf(s))[0]!.autopilot).toEqual({ enabled: false });
      // Other routes keep working without it.
      expect((await write('PATCH', itemPath(), s, { label: 'ok' })).status).toBe(200);
    });

    it('refuses extendToLedgers that does not exceed the threshold', async () => {
      const s = await signIn();
      await add(s);
      const payer = linkWallet(s);
      const res = await write('PATCH', itemPath(), s, {
        autopilot: autopilot(payer, { extendToLedgers: FLOOR }),
      });
      expect(res.status).toBe(422);
    });

    it('refuses an item that is not on testnet', async () => {
      const s = await signIn();
      watch.rows.push({
        userId: s.userId,
        network: 'mainnet',
        contractId: C1,
        scope: { noDataKeys: true },
        addedAt: START,
      });
      const payer = linkWallet(s);
      const res = await write('PATCH', itemPath(C1, 'mainnet'), s, { autopilot: autopilot(payer) });
      expect(res.status).toBe(422);
      expect((await errorOf(res)).code).toBe('NETWORK_NOT_WRITABLE');
      expect(watch.rows[0]!.autopilot).toBeUndefined();
    });

    it.each([
      ['no budget', (a: Record<string, unknown>) => ({ ...a, budget: undefined })],
      [
        'a numeric budget',
        (a: Record<string, unknown>) => ({
          ...a,
          budget: { perJobMaxStroops: 5, per30DaysMaxStroops: 5 },
        }),
      ],
      [
        'a negative budget',
        (a: Record<string, unknown>) => ({
          ...a,
          budget: { perJobMaxStroops: '-1', per30DaysMaxStroops: '5' },
        }),
      ],
      [
        'a budget with a leading zero',
        (a: Record<string, unknown>) => ({
          ...a,
          budget: { perJobMaxStroops: '05', per30DaysMaxStroops: '5' },
        }),
      ],
      [
        'a budget over i128',
        (a: Record<string, unknown>) => ({
          ...a,
          budget: { perJobMaxStroops: '1'.repeat(40), per30DaysMaxStroops: '5' },
        }),
      ],
      [
        'an XLM float',
        (a: Record<string, unknown>) => ({
          ...a,
          budget: { perJobMaxStroops: '1.5', per30DaysMaxStroops: '5' },
        }),
      ],
      [
        'a fractional threshold',
        (a: Record<string, unknown>) => ({ ...a, thresholdLedgers: 20000.5 }),
      ],
      ['a zero threshold', (a: Record<string, unknown>) => ({ ...a, thresholdLedgers: 0 })],
      ['a string threshold', (a: Record<string, unknown>) => ({ ...a, thresholdLedgers: '20000' })],
      ['a malformed payer', (a: Record<string, unknown>) => ({ ...a, payerWallet: 'GABC' })],
      ['no payer', (a: Record<string, unknown>) => ({ ...a, payerWallet: undefined })],
      ['an unknown setting', (a: Record<string, unknown>) => ({ ...a, mainnet: true })],
    ])('refuses %s with 400', async (_name, mutate) => {
      const s = await signIn();
      await add(s);
      const payer = linkWallet(s);
      const res = await write('PATCH', itemPath(), s, { autopilot: mutate(autopilot(payer)) });
      expect(res.status).toBe(400);
      expect((await listOf(s))[0]!.autopilot).toEqual({ enabled: false });
    });
  });

  it('turns autopilot off and releases the payer', async () => {
    const s = await signIn();
    await add(s);
    const payer = linkWallet(s);
    await write('PATCH', itemPath(), s, { autopilot: autopilot(payer) });
    const res = await write('PATCH', itemPath(), s, { autopilot: { enabled: false } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { item: ItemJson }).item.autopilot).toEqual({ enabled: false });
    expect(watch.rows[0]!.autopilot).toBeUndefined();
  });
});

describe('DELETE /watchlist/{network}/{contractId}', () => {
  it('soft-deletes with 204 and the item leaves the list', async () => {
    const s = await signIn();
    await add(s, C1);
    await add(s, C2);
    const res = await write('DELETE', itemPath(C1), s);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect((await listOf(s)).map((i) => i.contractId)).toEqual([C2]);
    expect(watch.rows).toHaveLength(2); // the row stays: jobs keep their FK target
  });

  it('cancels queued jobs and leaves jobs that already pulled', async () => {
    const s = await signIn();
    await add(s, C1);
    await add(s, C2);
    const job = (contractId: string, status: 'queued' | 'pulled') =>
      watch.jobs.push({ userId: s.userId, network: 'testnet', contractId, status });
    job(C1, 'queued');
    job(C1, 'pulled');
    job(C2, 'queued');
    await write('DELETE', itemPath(C1), s);
    expect(watch.jobs.map((j) => `${j.contractId === C1 ? 'C1' : 'C2'}:${j.status}`)).toEqual([
      'C1:cancelled',
      'C1:pulled',
      'C2:queued',
    ]);
  });

  it('turns autopilot off and releases the payer', async () => {
    const s = await signIn();
    await add(s);
    const payer = linkWallet(s);
    await write('PATCH', itemPath(), s, { autopilot: autopilot(payer) });
    await write('DELETE', itemPath(), s);
    expect(watch.rows[0]!.autopilot).toBeUndefined();
    expect(watch.rows[0]!.removedAt).toBe(START);
  });

  it('answers 404 for an item that is gone or never existed', async () => {
    const s = await signIn();
    await add(s);
    expect((await write('DELETE', itemPath(), s)).status).toBe(204);
    expect((await write('DELETE', itemPath(), s)).status).toBe(404);
    expect((await write('DELETE', itemPath(C2), s)).status).toBe(404);
    expect((await write('DELETE', itemPath('nope'), s)).status).toBe(400);
  });

  it('a removed item cannot be patched', async () => {
    const s = await signIn();
    await add(s);
    await write('DELETE', itemPath(), s);
    expect((await write('PATCH', itemPath(), s, { label: 'ghost' })).status).toBe(404);
  });

  it('re-adding restores it with its old label, scope and no autopilot', async () => {
    const s = await signIn();
    const k = dataKey();
    await add(s, C1, { label: 'kept', scope: { dataKeys: [k] } });
    const payer = linkWallet(s);
    await write('PATCH', itemPath(), s, { autopilot: autopilot(payer) });
    await write('DELETE', itemPath(), s);
    const res = await add(s, C1, { label: 'ignored', scope: NO_KEYS });
    expect(res.status).toBe(201);
    const { item } = (await res.json()) as { item: ItemJson };
    expect(item).toMatchObject({
      label: 'kept',
      scope: { dataKeys: [k] },
      autopilot: { enabled: false },
    });
    expect(watch.rows).toHaveLength(1);
  });
});

describe('the Worker mount', () => {
  it('answers 405 with Allow, and 404 for other paths under /watchlist', async () => {
    const s = await signIn();
    const put = await call('PUT', '/watchlist', { cookie: s.cookie, csrf: s.csrf });
    expect(put.status).toBe(405);
    expect(put.headers.get('allow')).toBe('GET, POST');
    expect((await errorOf(put)).code).toBe('METHOD_NOT_ALLOWED');
    const get1 = await call('GET', itemPath(), { cookie: s.cookie });
    expect(get1.status).toBe(405);
    expect(get1.headers.get('allow')).toBe('PATCH, DELETE');
    expect((await call('GET', '/watchlist/testnet', { cookie: s.cookie })).status).toBe(404);
    expect((await call('GET', '/watchlist/a/b/c', { cookie: s.cookie })).status).toBe(404);
  });

  it('answers 503 UPSTREAM_UNAVAILABLE without a database, naming nothing', async () => {
    const rest = { ...env };
    delete rest['DATABASE_URL'];
    const res = await handle(req('GET', '/watchlist'), rest, options);
    expect(res.status).toBe(503);
    const err = await errorOf(res);
    expect(err).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', retryable: true });
    expect(JSON.stringify(err)).not.toMatch(/DATABASE_URL/);
  });

  it.each([
    ['THRESHOLD_FLOOR_LEDGERS', 'soon'],
    ['THRESHOLD_FLOOR_LEDGERS', '0'],
    ['EXTEND_NOW_PER_USER_CONTRACT_PER_DAY', '-1'],
  ])('answers 503 when %s is malformed (%s)', async (name, value) => {
    const s = await signIn();
    env = { ...env, [name]: value };
    expect((await get('/watchlist', s)).status).toBe(503);
  });

  it('answers 503 when the database fails, without leaking the failure', async () => {
    const s = await signIn();
    const broken: WatchlistStore = {
      ...watch,
      list: () => Promise.reject(new Error('connection to db.invalid with password pw failed')),
    } as WatchlistStore;
    options = { ...options, createWatchlistStore: () => broken };
    const res = await get('/watchlist', s);
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('password');
  });

  it('delivers a rotated session cookie on a watchlist response', async () => {
    const s = await signIn();
    clock = START + 24 * 60 * 60 + 1;
    const res = await get('/watchlist', s);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/^__Host-evergreen_session=/);
  });

  it('serves no job, allowance or autopilot-run route', async () => {
    const s = await signIn();
    for (const p of ['/jobs', '/wallets/G/allowance', '/ledger']) {
      expect((await write('POST', p, s, {})).status).not.toBe(200);
    }
  });
});
