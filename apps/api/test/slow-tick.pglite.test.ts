/**
 * The F9 read (`LATEST_OK_TICK_SQL`) and F10's (`RECENT_TICKS_SQL`) on a real Postgres engine
 * (PGlite) with migrations 0005 and 0010 applied, over a table that holds failed ticks too
 * (`ok = false`, no ledger, `rpc_ms` set or NULL). Unit tests fake the reader; these run the SQL.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LATEST_OK_TICK_SQL, runSlowTickCheck } from '../src/alerts/slow-tick.js';
import { RECENT_TICKS_SQL } from '../src/alerts/testnet-reset.js';
import type { AlertNotification } from '../src/alerts/sender.js';

const db = (f: string): string => readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8');
const NOW = 1_800_000_000;
let pg: PGlite;

const insert = (
  unix: number,
  ledger: number | null,
  rpcMs: number | null,
  ok: boolean,
): Promise<unknown> =>
  pg.query(
    'INSERT INTO scheduler_ticks (ticked_at, observed_ledger, rpc_ms, ok) VALUES (to_timestamp($1), $2, $3, $4)',
    [unix, ledger, rpcMs, ok],
  );

const latestOkTick = async () => {
  const row = (await pg.query<Record<string, unknown>>(LATEST_OK_TICK_SQL, [])).rows[0];
  if (row === undefined) return undefined;
  const ms = row['rpc_ms'];
  return {
    tickedAt: Number(row['t']),
    rpcMs: ms === null || ms === undefined ? undefined : Number(ms),
  };
};
const sent: { n: AlertNotification; eventId: string }[] = [];
const deps = {
  latestOkTick,
  nowSeconds: () => NOW,
  transportFor: () => ({
    deliver: (n: AlertNotification, eventId: string) => {
      sent.push({ n, eventId });
      return Promise.resolve({ status: 200 });
    },
  }),
};
const env = { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: 'ops@example.invalid' } as const;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(db('0005_scheduler_ticks.sql'));
  await pg.exec('CREATE ROLE eg_scheduler');
  await pg.exec(db('0010_scheduler_ticks_rpc_ms_ok.sql'));
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  sent.length = 0;
  await pg.exec('TRUNCATE scheduler_ticks');
});

describe('F9 LATEST_OK_TICK_SQL on PGlite', () => {
  it('empty table: no tick, nothing sent', async () => {
    expect(await latestOkTick()).toBeUndefined();
    expect(await runSlowTickCheck(env, deps)).toEqual({ action: 'none', reason: 'no_tick' });
  });

  it('🔴 a slow tick is mailed once per tick, with the tick time in the event id', async () => {
    await insert(NOW - 60, 1000, 4200, true);
    expect(await runSlowTickCheck(env, deps)).toEqual({
      action: 'sent',
      recipients: 1,
      rpcMs: 4200,
    });
    expect(sent[0]!.eventId).toBe(`f9-slow-tick:${NOW - 60}`);
  });

  it('🔴 a failed tick with a long rpc_ms is not a slow tick: F9 reads the newest ok row', async () => {
    await insert(NOW - 900, 1000, 200, true);
    await insert(NOW - 10, null, 9000, false); // an answer that came back unusable after 9 s
    expect(await latestOkTick()).toEqual({ tickedAt: NOW - 900, rpcMs: 200 });
    expect(await runSlowTickCheck(env, deps)).toEqual({ action: 'none', reason: 'fine' });
    expect(sent).toEqual([]);
  });

  it('only failed ticks: no ok row, so no tick (F11 reports the silence)', async () => {
    await insert(NOW - 10, null, null, false);
    expect(await latestOkTick()).toBeUndefined();
  });

  it('a row from before 0010 has rpc_ms NULL: unmeasured, not slow, not fine', async () => {
    await insert(NOW - 60, 1000, null, true);
    expect(await runSlowTickCheck(env, deps)).toEqual({ action: 'none', reason: 'unmeasured' });
  });

  it('reads the newest ok row by ticked_at, not the first inserted', async () => {
    await insert(NOW - 60, 1002, 100, true);
    await insert(NOW - 5000, 1001, 9000, true);
    expect(await latestOkTick()).toEqual({ tickedAt: NOW - 60, rpcMs: 100 });
  });

  it('two rows at the same instant: the later id wins', async () => {
    await insert(NOW - 60, 1001, 100, true);
    await insert(NOW - 60, 1002, 4000, true);
    expect(await latestOkTick()).toEqual({ tickedAt: NOW - 60, rpcMs: 4000 });
  });
});

describe('F10 RECENT_TICKS_SQL on PGlite with failed ticks in the table', () => {
  it('🔴 returns only successful ticks, so no NULL ledger ever reaches the decrease check', async () => {
    await insert(NOW - 300, 1000, 100, true);
    await insert(NOW - 200, null, null, false);
    await insert(NOW - 100, 1180, 100, true);
    const rows = (await pg.query<Record<string, unknown>>(RECENT_TICKS_SQL, [10])).rows;
    expect(rows.map((r) => Number(r['l']))).toEqual([1180, 1000]);
    expect(rows.every((r) => r['l'] !== null)).toBe(true);
  });

  it('the limit counts successful ticks, not failed ones', async () => {
    for (let i = 0; i < 5; i++) await insert(NOW - 1000 + i, null, null, false);
    await insert(NOW - 2000, 500, 100, true);
    const rows = (await pg.query<Record<string, unknown>>(RECENT_TICKS_SQL, [2])).rows;
    expect(rows).toHaveLength(1);
  });
});
