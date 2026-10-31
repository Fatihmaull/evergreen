/**
 * F11 read path (#517) on a real Postgres engine (PGlite) with migration 0005 applied: the
 * statement the API Worker cron runs (`LATEST_TICK_SQL`) feeds `runHeartbeatCheck`. Unit tests
 * fake the reader; these run the SQL. No network: the transport is a recording fake.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LATEST_TICK_SQL, runHeartbeatCheck } from '../src/alerts/heartbeat.js';
import type { AlertNotification, AlertTransport } from '../src/alerts/sender.js';

const db = (f: string): string => readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8');

let pg: PGlite;

const latestTickedAt = async (): Promise<number | undefined> => {
  const rows = (await pg.query<Record<string, unknown>>(LATEST_TICK_SQL, [])).rows;
  const t = rows[0]?.['t'];
  return t === null || t === undefined ? undefined : Number(t);
};

const sent: { n: AlertNotification; eventId: string }[] = [];
const transportFor = (): AlertTransport => ({
  deliver: async (n, eventId) => {
    sent.push({ n, eventId });
    return { status: 200 };
  },
});

const NOW = 1_800_000_000;
const tickAt = (unix: number): Promise<unknown> =>
  pg.query(
    'INSERT INTO scheduler_ticks (ticked_at, observed_ledger) VALUES (to_timestamp($1), 1)',
    [unix],
  );

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(db('0005_scheduler_ticks.sql'));
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  sent.length = 0;
  await pg.exec('TRUNCATE scheduler_ticks');
});

const env = { HEARTBEAT_STALE_SECONDS: '900' } as const;
const sendEnv = { ...env, ALERTS_SEND: 'send', ALERTS_ALLOWLIST: 'ops@example.invalid' } as const;
const deps = { latestTickedAt, nowSeconds: () => NOW, transportFor };

describe('F11 LATEST_TICK_SQL on PGlite', () => {
  it('empty table reads as undefined, which is stale (absence is not health)', async () => {
    expect(await latestTickedAt()).toBeUndefined();
    expect(await runHeartbeatCheck(env, deps)).toEqual({
      action: 'dry-run',
      reason: 'alerts_send_off',
      ageSeconds: undefined,
    });
  });

  it('reads the newest row, not the first inserted', async () => {
    await tickAt(NOW - 100);
    await tickAt(NOW - 5000);
    expect(await latestTickedAt()).toBe(NOW - 100);
    expect(await runHeartbeatCheck(sendEnv, deps)).toEqual({ action: 'none', reason: 'fresh' });
    expect(sent).toEqual([]);
  });

  it('a gap over the threshold is stale but sends nothing without ALERTS_SEND=send', async () => {
    await tickAt(NOW - 901);
    expect(await runHeartbeatCheck(env, deps)).toEqual({
      action: 'dry-run',
      reason: 'alerts_send_off',
      ageSeconds: 901,
    });
    expect(sent).toEqual([]);
  });

  it('guard removal: same stale row with every guard satisfied delivers once per operator', async () => {
    await tickAt(NOW - 901);
    expect(await runHeartbeatCheck(sendEnv, deps)).toEqual({
      action: 'sent',
      recipients: 1,
      ageSeconds: 901,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.eventId).toBe(`f11-heartbeat-stale:${NOW - 901}`);
  });

  it('a missing table is read_failed, never fresh', async () => {
    await pg.exec('ALTER TABLE scheduler_ticks RENAME TO scheduler_ticks_x');
    try {
      expect(await runHeartbeatCheck(sendEnv, deps)).toEqual({ action: 'read_failed' });
    } finally {
      await pg.exec('ALTER TABLE scheduler_ticks_x RENAME TO scheduler_ticks');
    }
    expect(sent).toEqual([]);
  });
});
