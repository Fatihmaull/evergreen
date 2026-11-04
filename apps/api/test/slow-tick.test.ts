import { describe, expect, it } from 'vitest';
import {
  LATEST_OK_TICK_SQL,
  SLOW_TICK_RPC_MS,
  runSlowTickCheck,
  slowTickNotification,
  slowTickState,
  type LatestOkTick,
  type SlowTickDeps,
} from '../src/alerts/slow-tick.js';
import type { AlertNotification } from '../src/alerts/sender.js';

const NOW = 1_800_000_000;
const tick = (rpcMs: number | undefined, ageSeconds = 100): LatestOkTick => ({
  tickedAt: NOW - ageSeconds,
  rpcMs,
});

describe('F9 slow-tick state', () => {
  it('🔴 the threshold is 3000 ms and the comparison is strictly above (PM, 2026-10-31)', () => {
    expect(SLOW_TICK_RPC_MS).toBe(3000);
    expect(slowTickState(tick(3000), NOW, undefined)).toEqual({ state: 'fine', rpcMs: 3000 });
    expect(slowTickState(tick(3001), NOW, undefined)).toEqual({
      state: 'slow',
      rpcMs: 3001,
      tickedAt: NOW - 100,
    });
    expect(slowTickState(tick(0), NOW, undefined)).toEqual({ state: 'fine', rpcMs: 0 });
  });

  it('🔴 no row is no_tick, never fine and never slow: absence is F11’s to report', () => {
    expect(slowTickState(undefined, NOW, 900)).toEqual({ state: 'no_tick' });
  });

  it('🔴 a row with no rpc_ms (written before 0010) is unmeasured, not fine', () => {
    expect(slowTickState(tick(undefined), NOW, 900)).toEqual({ state: 'unmeasured' });
  });

  it('🔴 a slow tick older than the heartbeat threshold is left to F11', () => {
    expect(slowTickState(tick(9000, 901), NOW, 900)).toEqual({ state: 'stale' });
    // exactly at the threshold is still fresh, as in F11 (age > threshold is stale)
    expect(slowTickState(tick(9000, 900), NOW, 900)).toMatchObject({ state: 'slow' });
  });

  it('without a heartbeat threshold it cannot judge staleness, so it judges the tick', () => {
    expect(slowTickState(tick(9000, 100_000), NOW, undefined)).toMatchObject({ state: 'slow' });
  });
});

describe('F9 notification', () => {
  it('names F9 and the measured time, as a warning, with no address or key', () => {
    const n = slowTickNotification({ state: 'slow', rpcMs: 4321, tickedAt: NOW });
    expect(n.severity).toBe('warn');
    expect(n.subject).toContain('F9');
    expect(n.body).toContain('4321 ms');
    expect(n.body).toContain('3000 ms');
  });
});

function harness(latest: LatestOkTick | undefined | Error) {
  const delivered: { to: string; n: AlertNotification; eventId: string }[] = [];
  const deps: SlowTickDeps = {
    latestOkTick: () =>
      latest instanceof Error ? Promise.reject(latest) : Promise.resolve(latest),
    nowSeconds: () => NOW,
    transportFor: (to) => ({
      deliver: (n, eventId) => {
        delivered.push({ to, n, eventId });
        return Promise.resolve({ status: 200 });
      },
    }),
  };
  return { deps, delivered };
}
const sendEnv = { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: 'a@example.invalid,b@example.invalid' };

describe('runSlowTickCheck', () => {
  it('🔴 a slow tick with sending on mails every operator, one event id per tick', async () => {
    const { deps, delivered } = harness(tick(5000));
    expect(await runSlowTickCheck(sendEnv, deps)).toEqual({
      action: 'sent',
      recipients: 2,
      rpcMs: 5000,
    });
    expect(delivered.map((d) => d.to).sort()).toEqual(['a@example.invalid', 'b@example.invalid']);
    expect(new Set(delivered.map((d) => d.eventId))).toEqual(
      new Set([`f9-slow-tick:${NOW - 100}`]),
    );
  });

  it.each([
    ['unset', undefined],
    ['off', 'off'],
    ['upper case', 'SEND'],
    ['true', 'true'],
    ['padded', ' send'],
  ])('🔴 ALERTS_SEND %s sends nothing (only the exact word send does)', async (_, value) => {
    const { deps, delivered } = harness(tick(5000));
    const env = { ...sendEnv, ...(value === undefined ? {} : { ALERTS_SEND: value }) };
    if (value === undefined) delete (env as Record<string, unknown>)['ALERTS_SEND'];
    expect(await runSlowTickCheck(env, deps)).toEqual({
      action: 'dry-run',
      reason: 'alerts_send_off',
      rpcMs: 5000,
    });
    expect(delivered).toEqual([]);
  });

  it('🔴 sending on with nobody on the allowlist is a dry run', async () => {
    const { deps, delivered } = harness(tick(5000));
    expect(await runSlowTickCheck({ ALERTS_SEND: 'send' }, deps)).toEqual({
      action: 'dry-run',
      reason: 'no_operator',
      rpcMs: 5000,
    });
    expect(delivered).toEqual([]);
  });

  it.each([
    ['fine', tick(1200), 'fine'],
    ['at the threshold', tick(3000), 'fine'],
    ['unmeasured', tick(undefined), 'unmeasured'],
    ['nothing recorded', undefined, 'no_tick'],
  ] as const)('%s sends nothing', async (_, latest, reason) => {
    const { deps, delivered } = harness(latest);
    expect(await runSlowTickCheck(sendEnv, deps)).toEqual({ action: 'none', reason });
    expect(delivered).toEqual([]);
  });

  it('🔴 a stale slow tick is not mailed by F9 (F11 owns it)', async () => {
    const { deps, delivered } = harness(tick(9000, 5000));
    expect(await runSlowTickCheck({ ...sendEnv, HEARTBEAT_STALE_SECONDS: '900' }, deps)).toEqual({
      action: 'none',
      reason: 'stale',
    });
    expect(delivered).toEqual([]);
  });

  it('🔴 a failing read is read_failed and sends nothing, never "fine"', async () => {
    const { deps, delivered } = harness(new Error('connection to postgres://u:PW@h failed'));
    expect(await runSlowTickCheck(sendEnv, deps)).toEqual({ action: 'read_failed' });
    expect(delivered).toEqual([]);
  });
});

describe('the read', () => {
  it('🔴 reads only successful ticks, newest first, one row', () => {
    expect(LATEST_OK_TICK_SQL).toMatch(/FROM scheduler_ticks WHERE ok /);
    expect(LATEST_OK_TICK_SQL).toMatch(/ORDER BY ticked_at DESC, id DESC LIMIT 1$/);
    expect(LATEST_OK_TICK_SQL).toContain('rpc_ms');
  });
});
