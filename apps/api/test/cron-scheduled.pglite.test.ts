/**
 * The API Worker's `scheduled()` handler, end to end (PH2-E4-05, DoD-2 "every failure mode is
 * shown to raise an alert"). The unit tests prove `runHeartbeatCheck`, `runTestnetResetCheck` and
 * `runSlowTickCheck` with fakes; nothing proved that the handler in `src/index.ts` actually calls
 * them, with the real
 * SQL, the real Resend request and the right settings. That wiring is what pages someone.
 *
 * Real: the default export's `scheduled`, `LATEST_TICK_SQL`, `RECENT_TICKS_SQL`,
 * `LATEST_OK_TICK_SQL`, the Resend transport, `configCheck`, and migrations 0005 and 0010 on
 * PGlite (`ok` and `rpc_ms`; 0010's grants name the `eg_scheduler` role). Faked: the Neon driver
 * (it hands the handler PGlite's rows) and `fetch` (it records the Resend request). No network.
 *
 * 0005 alone is not enough. On main the three reads are `WHERE ok`, and F9 also selects `rpc_ms`.
 * A table without those columns makes every read throw, and each check logs `read_failed`.
 * A `read_failed` also sends one F14 email for the invocation. F17/F18 sends when `configCheck`
 * reports a problem, except when the missing setting is the email channel itself.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  pg: undefined as undefined | { query: (t: string, p: unknown[]) => Promise<{ rows: unknown[] }> },
  failReads: false,
  /** When set, a query whose text contains this fragment throws. One check, not all three. */
  failSql: undefined as undefined | string,
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: () => ({
    query: async (text: string, params: unknown[]) => {
      if (db.failReads) throw new Error('connection refused');
      if (db.failSql !== undefined && text.includes(db.failSql))
        throw new Error('connection refused');
      if (!db.pg) throw new Error('no database');
      return (await db.pg.query(text, params)).rows;
    },
    transaction: () => Promise.reject(new Error('not used by the cron')),
  }),
}));

import worker from '../src/index.js';

const NOW = 1_800_000_000;
const OP_A = 'ops-a@example.invalid';
const OP_B = 'ops-b@example.invalid';

/** The production plain settings, `apps/api/wrangler.jsonc`, plus the secrets the cron needs. */
const PROD = {
  ENVIRONMENT: 'production',
  HEARTBEAT_STALE_SECONDS: '2700',
  TESTNET_RESET_LOOKBACK_TICKS: '12',
  THRESHOLD_FLOOR_LEDGERS: '2165',
  DASHBOARD_ORIGIN: 'https://dashboard.example.invalid',
  EMAIL_FROM: 'alerts@mail.example.invalid',
  DATABASE_URL: 'postgres://u:p@db.example.invalid/neondb',
  SIGNIN_CODE_PEPPER: 'pepper',
  CHALLENGE_SIGNING_KEY: 'seed',
  EMAIL_API_KEY: 're_test_key',
  ALERTS_SEND: 'send',
  ALERTS_ALLOWLIST: `${OP_A}, ${OP_B}`,
} as const;

type Env = Record<string, string>;
const run = (env: Env): Promise<void> =>
  (worker as unknown as { scheduled(e: unknown, env: Env): Promise<void> }).scheduled({}, env);

interface Resend {
  readonly url: string;
  readonly auth: string | null;
  readonly key: string | null;
  readonly body: { from: string; to: string[]; subject: string; text: string };
}
let resend: Resend[];
let logs: Record<string, unknown>[];
let resendStatus = 200;

/** Fail one operator's send for one check. `to: '*'` fails every recipient of that subject. */
let failSend:
  { readonly subject: string; readonly to: string; readonly how: 'throw' | 'status' } | undefined;

const pg = new PGlite();
const dbFile = (name: string): string =>
  readFileSync(new URL(`../db/${name}`, import.meta.url), 'utf8');

/** A successful tick. `rpcMs` defaults under the F9 line so the other checks are not also slow. */
const tick = (agoSeconds: number, ledger: number, rpcMs: number | null = 100): Promise<unknown> =>
  pg.query(
    'INSERT INTO scheduler_ticks (ticked_at, observed_ledger, rpc_ms, ok) VALUES (to_timestamp($1), $2, $3, true)',
    [NOW - agoSeconds, ledger, rpcMs],
  );

/** A failed tick: no ledger, `ok` false. F9 and F11 must not treat it as the newest heartbeat. */
const failedTick = (agoSeconds: number, rpcMs: number | null): Promise<unknown> =>
  pg.query(
    'INSERT INTO scheduler_ticks (ticked_at, observed_ledger, rpc_ms, ok) VALUES (to_timestamp($1), NULL, $2, false)',
    [NOW - agoSeconds, rpcMs],
  );

beforeAll(async () => {
  await pg.exec(dbFile('0005_scheduler_ticks.sql'));
  await pg.exec('CREATE ROLE eg_scheduler');
  await pg.exec(dbFile('0010_scheduler_ticks_rpc_ms_ok.sql'));
  db.pg = pg as never;
});
afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec('TRUNCATE scheduler_ticks');
  db.failReads = false;
  db.failSql = undefined;
  resendStatus = 200;
  failSend = undefined;
  resend = [];
  logs = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW * 1000);
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const h = new Headers(init.headers);
    const body = JSON.parse(String(init.body)) as Resend['body'];
    resend.push({
      url,
      auth: h.get('authorization'),
      key: h.get('idempotency-key'),
      body,
    });
    const to = body.to[0] ?? '';
    if (
      failSend &&
      body.subject.includes(failSend.subject) &&
      (failSend.to === '*' || failSend.to === to)
    ) {
      if (failSend.how === 'throw') {
        // The message embeds the address and the key on purpose. The log must not.
        const error = new Error(`abort LEAK ${to} ${PROD.EMAIL_API_KEY} ${PROD.DATABASE_URL}`);
        error.name = 'AbortError';
        throw error;
      }
      return new Response('{"message":"LEAK_BODY"}', { status: 500 });
    }
    return new Response('{"id":"x"}', { status: resendStatus });
  });
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    try {
      logs.push(JSON.parse(String(line)));
    } catch {
      /* not a JSON log line */
    }
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const logOf = (event: string): Record<string, unknown> | undefined =>
  logs.find((l) => l['event'] === event);

const sentTo = (subject: string): (string | undefined)[] =>
  resend.filter((r) => r.body.subject.includes(subject)).map((r) => r.body.to[0]);

/** A stale heartbeat and a ledger drop. F9 runs and leaves the stale tick to F11. */
const staleDrop = async (): Promise<void> => {
  await tick(4000, 5000, 5000);
  await tick(2701, 1200, 5000);
};

/** A fresh slow tick and a ledger drop, so F10 and F9 both send and F11 does not. */
const freshSlowDrop = async (): Promise<void> => {
  await tick(1800, 5000, 100);
  await tick(60, 1200, 3001);
};

const assertNoLeak = (): void => {
  const all = JSON.stringify(logs);
  for (const secret of [OP_A, OP_B, PROD.DATABASE_URL, PROD.EMAIL_API_KEY, 'LEAK', 'LEAK_BODY']) {
    expect(all).not.toContain(secret);
  }
};

describe('the cron as deployed: F11, F10, F9, F17/F18', () => {
  it('a healthy scheduler sends nothing and logs all four checks', async () => {
    await tick(900, 1000);
    await tick(0, 1060);
    await run({ ...PROD });
    expect(resend).toEqual([]);
    expect(logOf('alerts.f11_heartbeat')).toMatchObject({ action: 'none', reason: 'fresh' });
    expect(logOf('alerts.f10_testnet_reset')).toMatchObject({
      action: 'none',
      reason: 'no_decrease',
    });
    expect(logOf('alerts.f9_slow_tick')).toMatchObject({ action: 'none', reason: 'fine' });
    expect(logOf('alerts.f17_f18_config')).toMatchObject({ problem: false });
  });

  it('a healthy run logs exactly these four checks; F14 is a fifth event only after read_failed', async () => {
    await tick(0, 1000);
    await run({ ...PROD });
    expect(
      logs
        .map((l) => String(l['event']))
        .filter((e) => e.startsWith('alerts.'))
        .sort(),
    ).toEqual([
      'alerts.f10_testnet_reset',
      'alerts.f11_heartbeat',
      'alerts.f17_f18_config',
      'alerts.f9_slow_tick',
    ]);
  });

  it('F11: a heartbeat older than HEARTBEAT_STALE_SECONDS emails each operator once', async () => {
    // Slow as well as stale. F9 must leave it to F11: one email per operator, not two.
    await tick(2701, 1000, 5000);
    await run({ ...PROD });
    expect(resend.map((r) => r.body.to)).toEqual([[OP_A], [OP_B]]);
    const first = resend[0]!;
    expect(first.url).toBe('https://api.resend.com/emails');
    expect(first.auth).toBe('Bearer re_test_key');
    expect(first.body.from).toBe('alerts@mail.example.invalid');
    expect(first.body.subject).toContain('scheduler heartbeat stale (F11)');
    expect(first.body.text).toContain('2701 seconds old');
    expect(first.key).toMatch(/^f11-heartbeat-stale:\d+\/[0-9a-f]{16}$/);
    expect(resend[0]!.key).not.toBe(resend[1]!.key);
    expect(logOf('alerts.f11_heartbeat')).toMatchObject({ action: 'sent', recipients: 2 });
    expect(logOf('alerts.f9_slow_tick')).toMatchObject({ action: 'none', reason: 'stale' });
    expect(resend.every((r) => r.body.subject.includes('(F11)'))).toBe(true);
  });

  it('F11: exactly at the threshold is still fresh', async () => {
    await tick(2700, 1000);
    await run({ ...PROD });
    expect(resend).toEqual([]);
    expect(logOf('alerts.f11_heartbeat')).toMatchObject({ action: 'none', reason: 'fresh' });
  });

  it('F11: an empty scheduler_ticks table is stale, not healthy', async () => {
    await run({ ...PROD });
    expect(resend).toHaveLength(2);
    expect(resend[0]!.body.text).toContain('no scheduler tick has been recorded');
    expect(logOf('alerts.f9_slow_tick')).toMatchObject({ action: 'none', reason: 'no_tick' });
  });

  it('F10: a decreasing observed ledger emails each operator, even with a fresh heartbeat', async () => {
    await tick(1800, 5000);
    await tick(900, 1200);
    await tick(0, 1260);
    await run({ ...PROD });
    expect(resend.map((r) => r.body.to)).toEqual([[OP_A], [OP_B]]);
    expect(resend[0]!.url).toBe('https://api.resend.com/emails');
    expect(resend[0]!.auth).toBe('Bearer re_test_key');
    expect(resend[0]!.body.from).toBe('alerts@mail.example.invalid');
    expect(resend[0]!.body.subject).toContain('observed ledger decreased (F10');
    expect(resend[0]!.body.text).toContain('from 5000 to 1200');
    expect(resend[0]!.key).toMatch(/^f10-ledger-decrease:5000->1200\/[0-9a-f]{16}$/);
    expect(logOf('alerts.f10_testnet_reset')).toMatchObject({
      action: 'sent',
      recipients: 2,
      decreases: 1,
    });
    expect(logOf('alerts.f11_heartbeat')).toMatchObject({ action: 'none', reason: 'fresh' });
    expect(logOf('alerts.f9_slow_tick')).toMatchObject({ action: 'none', reason: 'fine' });
  });

  it('F9: a fresh tick slower than 3000 ms emails each operator once', async () => {
    await tick(60, 1000, 3001);
    await run({ ...PROD });
    expect(resend.map((r) => r.body.to)).toEqual([[OP_A], [OP_B]]);
    const first = resend[0]!;
    expect(first.url).toBe('https://api.resend.com/emails');
    expect(first.auth).toBe('Bearer re_test_key');
    expect(first.body.from).toBe('alerts@mail.example.invalid');
    expect(first.body.subject).toContain('scheduler RPC slow (F9)');
    expect(first.body.text).toContain('3001 ms');
    expect(first.body.text).toContain('3000 ms');
    expect(first.key).toMatch(/^f9-slow-tick:\d+\/[0-9a-f]{16}$/);
    expect(resend[0]!.key).not.toBe(resend[1]!.key);
    expect(logOf('alerts.f9_slow_tick')).toMatchObject({
      action: 'sent',
      recipients: 2,
      rpcMs: 3001,
    });
    expect(logOf('alerts.f11_heartbeat')).toMatchObject({ action: 'none', reason: 'fresh' });
    expect(logOf('alerts.f10_testnet_reset')).toMatchObject({
      action: 'none',
      reason: 'no_decrease',
    });
  });

  it('F9: exactly 3000 ms is not slow', async () => {
    await tick(0, 1000, 3000);
    await run({ ...PROD });
    expect(resend).toEqual([]);
    expect(logOf('alerts.f9_slow_tick')).toMatchObject({ action: 'none', reason: 'fine' });
  });

  it('F9: a failed tick with a long rpc_ms is not the alert; the newest ok row is', async () => {
    await tick(900, 1000, 200);
    await failedTick(10, 9000);
    await run({ ...PROD });
    expect(resend).toEqual([]);
    expect(logOf('alerts.f9_slow_tick')).toMatchObject({ action: 'none', reason: 'fine' });
  });

  it('F10: an equal ledger is a stall, not a reset', async () => {
    await tick(900, 5000);
    await tick(0, 5000);
    await run({ ...PROD });
    expect(resend).toEqual([]);
  });

  it('F10: a drop older than the lookback is not looked at', async () => {
    await tick(9000, 5000);
    await tick(8999, 1200);
    for (let i = 0; i < 12; i++) await tick(900 - i, 1300 + i);
    await run({ ...PROD });
    expect(resend).toEqual([]);
  });

  it('kill switch: anything but exactly "send" is a dry run, and nothing is sent', async () => {
    await tick(2702, 5000);
    await tick(2701, 1200);
    for (const v of [undefined, '', 'SEND', ' send', 'send ']) {
      logs.length = 0;
      const env: Env = { ...PROD };
      if (v === undefined) delete env['ALERTS_SEND'];
      else env['ALERTS_SEND'] = v;
      await run(env);
      expect(logOf('alerts.f11_heartbeat')).toMatchObject({
        action: 'dry-run',
        reason: 'alerts_send_off',
      });
      expect(logOf('alerts.f10_testnet_reset')).toMatchObject({
        action: 'dry-run',
        reason: 'alerts_send_off',
      });
      // Stale, so F9 leaves it to F11 and never reaches its own send gate.
      expect(logOf('alerts.f9_slow_tick')).toMatchObject({ action: 'none', reason: 'stale' });
    }
    expect(resend).toEqual([]);
  });

  it('F9 kill switch: a fresh slow tick with anything but exactly "send" is a dry run', async () => {
    await tick(0, 1000, 4200);
    for (const v of [undefined, '', 'SEND', ' send', 'send ']) {
      logs.length = 0;
      resend.length = 0;
      const env: Env = { ...PROD };
      if (v === undefined) delete env['ALERTS_SEND'];
      else env['ALERTS_SEND'] = v;
      await run(env);
      expect(logOf('alerts.f9_slow_tick')).toMatchObject({
        action: 'dry-run',
        reason: 'alerts_send_off',
        rpcMs: 4200,
      });
      expect(resend).toEqual([]);
    }
  });

  it('no allowlist: a dry run, nothing sent', async () => {
    await tick(2701, 1000);
    const env: Env = { ...PROD };
    delete env['ALERTS_ALLOWLIST'];
    await run(env);
    expect(resend).toEqual([]);
    expect(logOf('alerts.f11_heartbeat')).toMatchObject({
      action: 'dry-run',
      reason: 'no_operator',
    });
  });

  it('F9: no allowlist on a fresh slow tick is a dry run, nothing sent', async () => {
    await tick(0, 1000, 4200);
    const env: Env = { ...PROD };
    delete env['ALERTS_ALLOWLIST'];
    await run(env);
    expect(resend).toEqual([]);
    expect(logOf('alerts.f9_slow_tick')).toMatchObject({
      action: 'dry-run',
      reason: 'no_operator',
      rpcMs: 4200,
    });
  });

  it('HEARTBEAT_STALE_SECONDS unset: F11 does nothing, and says so', async () => {
    await tick(99999, 1000);
    const env: Env = { ...PROD };
    delete env['HEARTBEAT_STALE_SECONDS'];
    await run(env);
    expect(resend).toEqual([]);
    expect(logOf('alerts.f11_heartbeat')).toMatchObject({
      action: 'none',
      reason: 'threshold_unset',
    });
  });

  const F14_TEXT =
    'F14: the API cron could not read the database. The scheduler checks did not complete. This alert is sent without reading the database. Checked by the API Worker cron.';

  it('F14: a database that cannot be read emails each operator once', async () => {
    await tick(2701, 1000);
    db.failReads = true;
    await expect(run({ ...PROD })).resolves.toBeUndefined();
    expect(logOf('alerts.f11_heartbeat')).toEqual({
      event: 'alerts.f11_heartbeat',
      action: 'read_failed',
    });
    expect(logOf('alerts.f10_testnet_reset')).toEqual({
      event: 'alerts.f10_testnet_reset',
      action: 'read_failed',
    });
    expect(logOf('alerts.f9_slow_tick')).toEqual({
      event: 'alerts.f9_slow_tick',
      action: 'read_failed',
    });
    expect(sentTo('(F14)')).toEqual([OP_A, OP_B]);
    expect(resend).toHaveLength(2);
    const first = resend[0]!;
    expect(first.url).toBe('https://api.resend.com/emails');
    expect(first.auth).toBe('Bearer re_test_key');
    expect(first.body.from).toBe(PROD.EMAIL_FROM);
    expect(first.body.subject).toBe('Evergreen operator alert: database unavailable (F14)');
    expect(first.body.text).toBe(F14_TEXT);
    expect(first.body.text).not.toContain(OP_A);
    expect(first.body.text).not.toContain('postgres');
    expect(first.key).toMatch(/^f14-database-unavailable:2027-01-15T08\/[0-9a-f]{16}$/);
    expect(first.key).not.toBe(resend[1]!.key);
    expect(first.key).not.toContain(OP_A);
    expect(logs.filter((l) => l['event'] === 'alerts.f14_database')).toEqual([
      { event: 'alerts.f14_database', action: 'sent', recipients: 2, readFailures: 3 },
    ]);
    expect(JSON.stringify(logs)).not.toContain('connection refused');
    assertNoLeak();
  });

  it('F14: one failed read still emails once, and the other checks do not', async () => {
    await tick(0, 1000);
    db.failSql = 'rpc_ms';
    await run({ ...PROD });
    expect(logOf('alerts.f9_slow_tick')).toEqual({
      event: 'alerts.f9_slow_tick',
      action: 'read_failed',
    });
    expect(logOf('alerts.f11_heartbeat')).toMatchObject({ action: 'none', reason: 'fresh' });
    expect(logOf('alerts.f10_testnet_reset')).toMatchObject({
      action: 'none',
      reason: 'no_decrease',
    });
    expect(sentTo('(F14)')).toEqual([OP_A, OP_B]);
    expect(resend).toHaveLength(2);
    expect(logs.filter((l) => l['event'] === 'alerts.f14_database')).toEqual([
      { event: 'alerts.f14_database', action: 'sent', recipients: 2, readFailures: 1 },
    ]);
  });

  it('F14: the same UTC hour reuses the idempotency key; the next hour does not', async () => {
    db.failReads = true;
    await run({ ...PROD });
    const first = resend.find((r) => r.body.to[0] === OP_A)?.key;
    expect(first).toMatch(/^f14-database-unavailable:2027-01-15T08\/[0-9a-f]{16}$/);
    resend.length = 0;
    await run({ ...PROD });
    expect(resend.find((r) => r.body.to[0] === OP_A)?.key).toBe(first);
    vi.setSystemTime((NOW + 1800) * 1000);
    resend.length = 0;
    await run({ ...PROD });
    expect(resend.find((r) => r.body.to[0] === OP_A)?.key).toBe(first);
    vi.setSystemTime((NOW + 3600) * 1000);
    resend.length = 0;
    await run({ ...PROD });
    const next = resend.find((r) => r.body.to[0] === OP_A)?.key;
    expect(next).toMatch(/^f14-database-unavailable:2027-01-15T09\/[0-9a-f]{16}$/);
    expect(next).not.toBe(first);
  });

  it('F14 kill switch: anything but exactly "send" logs read_failed and sends nothing', async () => {
    db.failReads = true;
    for (const v of [undefined, '', 'SEND', ' send', 'send ']) {
      logs.length = 0;
      resend.length = 0;
      const env: Env = { ...PROD };
      if (v === undefined) delete env['ALERTS_SEND'];
      else env['ALERTS_SEND'] = v;
      await run(env);
      expect(logs.filter((l) => l['event'] === 'alerts.f14_database')).toEqual([
        {
          event: 'alerts.f14_database',
          action: 'dry-run',
          reason: 'alerts_send_off',
          readFailures: 3,
        },
      ]);
      expect(resend).toEqual([]);
    }
  });

  it('F14: no allowlist is a dry run', async () => {
    db.failReads = true;
    const env: Env = { ...PROD };
    delete env['ALERTS_ALLOWLIST'];
    await run(env);
    expect(resend).toEqual([]);
    expect(logs.filter((l) => l['event'] === 'alerts.f14_database')).toEqual([
      { event: 'alerts.f14_database', action: 'dry-run', reason: 'no_operator', readFailures: 3 },
    ]);
  });

  it('F17: THRESHOLD_FLOOR_LEDGERS unset emails each operator the setting name', async () => {
    await tick(0, 1000);
    const env: Env = { ...PROD };
    delete env['THRESHOLD_FLOOR_LEDGERS'];
    await run(env);
    expect(sentTo('(F17/F18)')).toEqual([OP_A, OP_B]);
    expect(resend).toHaveLength(2);
    const first = resend[0]!;
    expect(first.url).toBe('https://api.resend.com/emails');
    expect(first.auth).toBe('Bearer re_test_key');
    expect(first.body.from).toBe(PROD.EMAIL_FROM);
    expect(first.body.text).toBe(
      'F17/F18: configuration problem. Setting names: THRESHOLD_FLOOR_LEDGERS. Checked by the API Worker cron.',
    );
    expect(first.body.text).not.toContain(OP_A);
    expect(first.key).toMatch(/^f17-f18:THRESHOLD_FLOOR_LEDGERS:2027-01-15\/[0-9a-f]{16}$/);
    expect(first.key).not.toBe(resend[1]!.key);
    expect(first.key).not.toContain(OP_A);
    expect(logs.filter((l) => l['event'] === 'alerts.f17_f18_config')).toEqual([
      {
        event: 'alerts.f17_f18_config',
        thresholdFloor: 'unset',
        missingSettings: [],
        problem: true,
      },
      {
        event: 'alerts.f17_f18_config',
        action: 'sent',
        recipients: 2,
        settings: ['THRESHOLD_FLOOR_LEDGERS'],
      },
    ]);
    expect(sentTo('(F14)')).toEqual([]);
    assertNoLeak();
  });

  it('F17: the same UTC day reuses the key; the next day, or a new name, does not', async () => {
    const env: Env = { ...PROD };
    delete env['THRESHOLD_FLOOR_LEDGERS'];
    await run(env);
    const first = resend.find((r) => r.body.to[0] === OP_A)?.key;
    expect(first).toMatch(/^f17-f18:THRESHOLD_FLOOR_LEDGERS:2027-01-15\/[0-9a-f]{16}$/);
    vi.setSystemTime((NOW + 3600) * 1000);
    resend.length = 0;
    await run(env);
    expect(resend.find((r) => r.body.to[0] === OP_A)?.key).toBe(first);
    vi.setSystemTime((NOW + 86400) * 1000);
    resend.length = 0;
    await run(env);
    const nextDay = resend.find((r) => r.body.to[0] === OP_A)?.key;
    expect(nextDay).toMatch(/^f17-f18:THRESHOLD_FLOOR_LEDGERS:2027-01-16\/[0-9a-f]{16}$/);
    expect(nextDay).not.toBe(first);
    vi.setSystemTime(NOW * 1000);
    resend.length = 0;
    const more: Env = { ...env };
    delete more['DASHBOARD_ORIGIN'];
    await run(more);
    expect(resend.find((r) => r.body.to[0] === OP_A)?.key).toMatch(
      /^f17-f18:DASHBOARD_ORIGIN,THRESHOLD_FLOOR_LEDGERS:2027-01-15\/[0-9a-f]{16}$/,
    );
  });

  it('F17 kill switch: a config problem with anything but exactly "send" sends nothing', async () => {
    for (const v of [undefined, '', 'SEND', ' send', 'send ']) {
      logs.length = 0;
      resend.length = 0;
      const env: Env = { ...PROD };
      delete env['THRESHOLD_FLOOR_LEDGERS'];
      if (v === undefined) delete env['ALERTS_SEND'];
      else env['ALERTS_SEND'] = v;
      await run(env);
      expect(
        logs.filter((l) => l['event'] === 'alerts.f17_f18_config' && l['action'] === 'dry-run'),
      ).toEqual([
        {
          event: 'alerts.f17_f18_config',
          action: 'dry-run',
          reason: 'alerts_send_off',
          settings: ['THRESHOLD_FLOOR_LEDGERS'],
        },
      ]);
      expect(resend).toEqual([]);
    }
  });

  it('F17: no allowlist is a dry run', async () => {
    const env: Env = { ...PROD };
    delete env['THRESHOLD_FLOOR_LEDGERS'];
    delete env['ALERTS_ALLOWLIST'];
    await run(env);
    expect(resend).toEqual([]);
    expect(
      logs.filter((l) => l['event'] === 'alerts.f17_f18_config' && l['action'] === 'dry-run'),
    ).toEqual([
      {
        event: 'alerts.f17_f18_config',
        action: 'dry-run',
        reason: 'no_operator',
        settings: ['THRESHOLD_FLOOR_LEDGERS'],
      },
    ]);
  });

  it('F18: EMAIL_API_KEY missing logs email_channel_down and does not send', async () => {
    await tick(0, 1000);
    const env: Env = { ...PROD };
    delete env['EMAIL_API_KEY'];
    await run(env);
    expect(resend).toEqual([]);
    expect(logs.filter((l) => l['event'] === 'alerts.f17_f18_config')).toEqual([
      {
        event: 'alerts.f17_f18_config',
        thresholdFloor: null,
        missingSettings: ['EMAIL_API_KEY'],
        problem: true,
      },
      {
        event: 'alerts.f17_f18_config',
        action: 'email_channel_down',
        settings: ['EMAIL_API_KEY'],
        blockedBy: ['EMAIL_API_KEY'],
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain('re_test_key');
    expect(JSON.stringify(logs)).not.toContain(PROD.DATABASE_URL);
    expect(JSON.stringify(logs)).not.toContain(OP_A);
  });

  it('F18: EMAIL_FROM missing does not send, even with another missing name', async () => {
    await tick(0, 1000);
    const env: Env = { ...PROD };
    delete env['EMAIL_FROM'];
    delete env['DASHBOARD_ORIGIN'];
    await run(env);
    expect(sentTo('(F17/F18)')).toEqual([]);
    expect(sentTo('(F14)')).toEqual([]);
    expect(logOf('alerts.f17_f18_config')).toMatchObject({
      missingSettings: ['EMAIL_FROM', 'DASHBOARD_ORIGIN'],
      problem: true,
    });
    expect(logs.filter((l) => l['action'] === 'email_channel_down')).toEqual([
      {
        event: 'alerts.f17_f18_config',
        action: 'email_channel_down',
        settings: ['DASHBOARD_ORIGIN', 'EMAIL_FROM'],
        blockedBy: ['EMAIL_FROM'],
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain(PROD.EMAIL_FROM);
    expect(JSON.stringify(logs)).not.toContain(PROD.DASHBOARD_ORIGIN);
  });

  it('F18: a missing required secret other than the email channel emails the name only', async () => {
    await tick(0, 1000);
    const env: Env = { ...PROD, SIGNIN_CODE_PEPPER: 'pepper-secret-value' };
    delete env['DASHBOARD_ORIGIN'];
    env['THRESHOLD_FLOOR_LEDGERS'] = '10xSECRET';
    await run(env);
    expect(sentTo('(F17/F18)')).toEqual([OP_A, OP_B]);
    expect(resend).toHaveLength(2);
    const text = resend[0]!.body.text;
    expect(text).toBe(
      'F17/F18: configuration problem. Setting names: DASHBOARD_ORIGIN, THRESHOLD_FLOOR_LEDGERS. Checked by the API Worker cron.',
    );
    expect(text).not.toContain('10xSECRET');
    expect(text).not.toContain('pepper-secret-value');
    expect(text).not.toContain(OP_A);
    expect(text).not.toContain(PROD.DATABASE_URL);
    expect(resend[0]!.key).toMatch(
      /^f17-f18:DASHBOARD_ORIGIN,THRESHOLD_FLOOR_LEDGERS:2027-01-15\/[0-9a-f]{16}$/,
    );
    const all = JSON.stringify(logs);
    expect(all).not.toContain('10xSECRET');
    expect(all).not.toContain('pepper-secret-value');
    expect(all).not.toContain(OP_A);
    expect(all).not.toContain(PROD.DATABASE_URL);
    expect(logs.filter((l) => l['event'] === 'alerts.f17_f18_config')).toEqual([
      {
        event: 'alerts.f17_f18_config',
        thresholdFloor: 'malformed',
        missingSettings: ['DASHBOARD_ORIGIN'],
        problem: true,
      },
      {
        event: 'alerts.f17_f18_config',
        action: 'sent',
        recipients: 2,
        settings: ['DASHBOARD_ORIGIN', 'THRESHOLD_FLOOR_LEDGERS'],
      },
    ]);
  });

  it('F14 and F18: DATABASE_URL unset sends one of each, not three F14 emails', async () => {
    const env: Env = { ...PROD };
    delete env['DATABASE_URL'];
    await run(env);
    expect(sentTo('(F14)')).toEqual([OP_A, OP_B]);
    expect(sentTo('(F17/F18)')).toEqual([OP_A, OP_B]);
    expect(resend).toHaveLength(4);
    const config = resend.find((r) => r.body.subject.includes('(F17/F18)'));
    expect(config?.body.text).toContain('DATABASE_URL');
    expect(config?.body.text).not.toContain('postgres');
    expect(logOf('alerts.f11_heartbeat')).toEqual({
      event: 'alerts.f11_heartbeat',
      action: 'read_failed',
    });
    expect(logs.filter((l) => l['event'] === 'alerts.f14_database')).toEqual([
      { event: 'alerts.f14_database', action: 'sent', recipients: 2, readFailures: 3 },
    ]);
    expect(JSON.stringify(logs)).not.toContain('postgres');
  });

  it('no log line carries an operator address, the database URL or a key', async () => {
    await tick(2701, 5000);
    await tick(2700, 1200);
    await run({ ...PROD });
    const all = JSON.stringify(logs);
    for (const secret of [
      OP_A,
      OP_B,
      PROD.DATABASE_URL,
      PROD.EMAIL_API_KEY,
      PROD.SIGNIN_CODE_PEPPER,
    ])
      expect(all).not.toContain(secret);
  });
});

describe('a failed operator send does not stop the cron', () => {
  it('F11: a thrown fetch for one operator still mails the other, and F10 still sends', async () => {
    await staleDrop();
    failSend = { subject: '(F11)', to: OP_A, how: 'throw' };
    await expect(run({ ...PROD })).resolves.toBeUndefined();
    expect(sentTo('(F11)')).toEqual([OP_A, OP_B]);
    expect(sentTo('(F10')).toEqual([OP_A, OP_B]);
    expect(sentTo('(F9)')).toEqual([]);
    expect(logs.filter((l) => l['event'] === 'alerts.f11_heartbeat')).toEqual([
      { event: 'alerts.f11_heartbeat', action: 'send_failed', errorName: 'AbortError' },
      { event: 'alerts.f11_heartbeat', action: 'sent', recipients: 1, failed: 1, ageSeconds: 2701 },
    ]);
    expect(logOf('alerts.f10_testnet_reset')).toMatchObject({
      action: 'sent',
      recipients: 2,
      decreases: 1,
    });
    // A stale slow tick stays F11's. F9 ran; it did not send.
    expect(logOf('alerts.f9_slow_tick')).toMatchObject({ action: 'none', reason: 'stale' });
    const f11Key = resend.find((r) => r.body.subject.includes('(F11)') && r.body.to[0] === OP_B);
    expect(f11Key?.key).toMatch(/^f11-heartbeat-stale:\d+\/[0-9a-f]{16}$/);
    expect(f11Key?.key).not.toContain(OP_B);
    assertNoLeak();
  });

  it('F11: a 5xx for one operator still mails the other, and F10 still sends', async () => {
    await staleDrop();
    failSend = { subject: '(F11)', to: OP_A, how: 'status' };
    await expect(run({ ...PROD })).resolves.toBeUndefined();
    expect(sentTo('(F11)')).toEqual([OP_A, OP_B]);
    expect(sentTo('(F10')).toEqual([OP_A, OP_B]);
    expect(logs.filter((l) => l['event'] === 'alerts.f11_heartbeat')).toEqual([
      { event: 'alerts.f11_heartbeat', action: 'send_failed', httpStatus: 500 },
      { event: 'alerts.f11_heartbeat', action: 'sent', recipients: 1, failed: 1, ageSeconds: 2701 },
    ]);
    expect(logOf('alerts.f10_testnet_reset')).toMatchObject({ action: 'sent', recipients: 2 });
    expect(logOf('alerts.f9_slow_tick')).toMatchObject({ action: 'none', reason: 'stale' });
    assertNoLeak();
  });

  it('F11: every operator 5xx is send_failed, and F10 still mails both operators', async () => {
    await staleDrop();
    failSend = { subject: '(F11)', to: '*', how: 'status' };
    await expect(run({ ...PROD })).resolves.toBeUndefined();
    expect(sentTo('(F11)')).toEqual([OP_A, OP_B]);
    expect(sentTo('(F10')).toEqual([OP_A, OP_B]);
    expect(logs.filter((l) => l['event'] === 'alerts.f11_heartbeat')).toEqual([
      { event: 'alerts.f11_heartbeat', action: 'send_failed', httpStatus: 500 },
      { event: 'alerts.f11_heartbeat', action: 'send_failed', httpStatus: 500 },
      { event: 'alerts.f11_heartbeat', action: 'send_failed', failed: 2, ageSeconds: 2701 },
    ]);
    expect(logOf('alerts.f9_slow_tick')).toEqual({
      event: 'alerts.f9_slow_tick',
      action: 'none',
      reason: 'stale',
    });
    assertNoLeak();
  });

  it('F10: a thrown fetch for one operator still mails the other, and F9 still sends', async () => {
    await freshSlowDrop();
    failSend = { subject: '(F10', to: OP_A, how: 'throw' };
    await expect(run({ ...PROD })).resolves.toBeUndefined();
    expect(sentTo('(F11)')).toEqual([]);
    expect(sentTo('(F10')).toEqual([OP_A, OP_B]);
    expect(sentTo('(F9)')).toEqual([OP_A, OP_B]);
    expect(logOf('alerts.f11_heartbeat')).toMatchObject({ action: 'none', reason: 'fresh' });
    expect(logs.filter((l) => l['event'] === 'alerts.f10_testnet_reset')).toEqual([
      { event: 'alerts.f10_testnet_reset', action: 'send_failed', errorName: 'AbortError' },
      {
        event: 'alerts.f10_testnet_reset',
        action: 'sent',
        recipients: 1,
        failed: 1,
        decreases: 1,
      },
    ]);
    expect(logOf('alerts.f9_slow_tick')).toMatchObject({
      action: 'sent',
      recipients: 2,
      rpcMs: 3001,
    });
    assertNoLeak();
  });

  it('F9: a 5xx for one operator still mails the other, and the cron resolves', async () => {
    await tick(60, 1000, 3001);
    failSend = { subject: '(F9)', to: OP_A, how: 'status' };
    await expect(run({ ...PROD })).resolves.toBeUndefined();
    expect(sentTo('(F9)')).toEqual([OP_A, OP_B]);
    expect(logs.filter((l) => l['event'] === 'alerts.f9_slow_tick')).toEqual([
      { event: 'alerts.f9_slow_tick', action: 'send_failed', httpStatus: 500 },
      { event: 'alerts.f9_slow_tick', action: 'sent', recipients: 1, failed: 1, rpcMs: 3001 },
    ]);
    expect(logOf('alerts.f11_heartbeat')).toMatchObject({ action: 'none', reason: 'fresh' });
    expect(logOf('alerts.f10_testnet_reset')).toMatchObject({
      action: 'none',
      reason: 'no_decrease',
    });
    expect(
      logs
        .map((l) => String(l['event']))
        .filter((e) => e.startsWith('alerts.'))
        .filter((e, i, all) => all.indexOf(e) === i)
        .sort(),
    ).toEqual([
      'alerts.f10_testnet_reset',
      'alerts.f11_heartbeat',
      'alerts.f17_f18_config',
      'alerts.f9_slow_tick',
    ]);
    assertNoLeak();
  });

  it('F14: a thrown fetch for one operator still mails the other', async () => {
    db.failReads = true;
    failSend = { subject: '(F14)', to: OP_A, how: 'throw' };
    await expect(run({ ...PROD })).resolves.toBeUndefined();
    expect(sentTo('(F14)')).toEqual([OP_A, OP_B]);
    expect(logs.filter((l) => l['event'] === 'alerts.f14_database')).toEqual([
      { event: 'alerts.f14_database', action: 'send_failed', errorName: 'AbortError' },
      {
        event: 'alerts.f14_database',
        action: 'sent',
        recipients: 1,
        failed: 1,
        readFailures: 3,
      },
    ]);
    assertNoLeak();
  });

  it('F14: a 5xx for every operator is send_failed and the cron resolves', async () => {
    db.failReads = true;
    failSend = { subject: '(F14)', to: '*', how: 'status' };
    await expect(run({ ...PROD })).resolves.toBeUndefined();
    expect(sentTo('(F14)')).toEqual([OP_A, OP_B]);
    expect(logs.filter((l) => l['event'] === 'alerts.f14_database')).toEqual([
      { event: 'alerts.f14_database', action: 'send_failed', httpStatus: 500 },
      { event: 'alerts.f14_database', action: 'send_failed', httpStatus: 500 },
      { event: 'alerts.f14_database', action: 'send_failed', failed: 2, readFailures: 3 },
    ]);
    assertNoLeak();
  });

  it('F17: a thrown fetch for one operator still mails the other, and F11 still runs', async () => {
    await tick(0, 1000);
    const env: Env = { ...PROD };
    delete env['THRESHOLD_FLOOR_LEDGERS'];
    failSend = { subject: '(F17', to: OP_A, how: 'throw' };
    await expect(run(env)).resolves.toBeUndefined();
    expect(sentTo('(F17/F18)')).toEqual([OP_A, OP_B]);
    expect(logOf('alerts.f11_heartbeat')).toMatchObject({ action: 'none', reason: 'fresh' });
    expect(logs.filter((l) => l['event'] === 'alerts.f17_f18_config')).toEqual([
      {
        event: 'alerts.f17_f18_config',
        thresholdFloor: 'unset',
        missingSettings: [],
        problem: true,
      },
      { event: 'alerts.f17_f18_config', action: 'send_failed', errorName: 'AbortError' },
      {
        event: 'alerts.f17_f18_config',
        action: 'sent',
        recipients: 1,
        failed: 1,
        settings: ['THRESHOLD_FLOOR_LEDGERS'],
      },
    ]);
    assertNoLeak();
  });

  it('F17 and F14: a thrown config send still emails F14 once', async () => {
    db.failReads = true;
    const env: Env = { ...PROD };
    delete env['DASHBOARD_ORIGIN'];
    failSend = { subject: '(F17', to: OP_A, how: 'throw' };
    await expect(run(env)).resolves.toBeUndefined();
    expect(sentTo('(F17/F18)')).toEqual([OP_A, OP_B]);
    expect(sentTo('(F14)')).toEqual([OP_A, OP_B]);
    expect(resend.filter((r) => r.body.subject.includes('(F14)'))).toHaveLength(2);
    assertNoLeak();
  });
});
