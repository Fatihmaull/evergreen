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
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  pg: undefined as undefined | { query: (t: string, p: unknown[]) => Promise<{ rows: unknown[] }> },
  failReads: false,
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: () => ({
    query: async (text: string, params: unknown[]) => {
      if (db.failReads) throw new Error('connection refused');
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
  resendStatus = 200;
  resend = [];
  logs = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW * 1000);
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const h = new Headers(init.headers);
    resend.push({
      url,
      auth: h.get('authorization'),
      key: h.get('idempotency-key'),
      body: JSON.parse(String(init.body)),
    });
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

  it('the cron runs exactly these four checks today; change the DoD-2 evidence table when this list changes', async () => {
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

  it('F14 gap: a database that cannot be read logs read_failed and sends NOTHING', async () => {
    await tick(2701, 1000);
    db.failReads = true;
    await run({ ...PROD });
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
    expect(resend).toEqual([]);
  });

  it('F17: THRESHOLD_FLOOR_LEDGERS unset is logged as a problem and sends NOTHING', async () => {
    await tick(0, 1000);
    const env: Env = { ...PROD };
    delete env['THRESHOLD_FLOOR_LEDGERS'];
    await run(env);
    expect(logOf('alerts.f17_f18_config')).toMatchObject({
      thresholdFloor: 'unset',
      problem: true,
    });
    expect(resend).toEqual([]);
  });

  it('F18: a missing required secret is logged by name only, and sends NOTHING', async () => {
    await tick(0, 1000);
    const env: Env = { ...PROD };
    delete env['EMAIL_API_KEY'];
    await run(env);
    const line = logOf('alerts.f17_f18_config');
    expect(line).toMatchObject({ missingSettings: ['EMAIL_API_KEY'], problem: true });
    expect(JSON.stringify(logs)).not.toContain('re_test_key');
    expect(resend).toEqual([]);
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
