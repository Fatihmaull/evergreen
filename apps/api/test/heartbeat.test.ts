/**
 * PH2-E4-05 F11 heartbeat cron. No network: fetch throws, transports are fakes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  heartbeatState,
  operatorIdempotencyKey,
  resendOperatorTransport,
  runHeartbeatCheck,
  staleThresholdSeconds,
  type AlertTransport,
  type HeartbeatDeps,
} from '../src/index.js';

const OP = 'operator@alerts.example.test';

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is not allowed in tests');
  });
});
afterEach(() => vi.unstubAllGlobals());

function deps(latest: number | undefined, now = 1000) {
  const sent: { to: string; eventId: string }[] = [];
  const d: HeartbeatDeps = {
    latestTickedAt: () => Promise.resolve(latest),
    nowSeconds: () => now,
    transportFor: (to): AlertTransport => ({
      deliver: (_n, eventId) => {
        sent.push({ to, eventId });
        return Promise.resolve({ ok: true });
      },
    }),
  };
  return { d, sent };
}

const SEND = { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: OP, HEARTBEAT_STALE_SECONDS: '600' };

describe('F11 heartbeat check', () => {
  it('threshold must be a whole positive number; no default', () => {
    expect(staleThresholdSeconds(undefined)).toBeUndefined();
    expect(staleThresholdSeconds('')).toBeUndefined();
    expect(staleThresholdSeconds(' 600')).toBeUndefined();
    expect(staleThresholdSeconds('0')).toBeUndefined();
    expect(staleThresholdSeconds('600')).toBe(600);
  });

  it('heartbeatState: fresh, stale, and no tick is stale', () => {
    expect(heartbeatState(500, 1000, 600)).toEqual({ state: 'fresh', ageSeconds: 500 });
    expect(heartbeatState(399, 1000, 600)).toEqual({ state: 'stale', ageSeconds: 601 });
    expect(heartbeatState(undefined, 1000, 600)).toEqual({ state: 'stale', ageSeconds: undefined });
    expect(heartbeatState(1, 1000, undefined)).toEqual({ state: 'threshold_unset' });
  });

  it('sends to each allowlisted operator when stale and ALERTS_SEND is exactly send', async () => {
    const { d, sent } = deps(100);
    const out = await runHeartbeatCheck(
      { ...SEND, ALERTS_ALLOWLIST: `${OP}, second@alerts.example.test` },
      d,
    );
    expect(out).toEqual({ action: 'sent', recipients: 2, ageSeconds: 900 });
    expect(sent.map((s) => s.to)).toEqual([OP, 'second@alerts.example.test']);
    expect(sent[0]!.eventId).toBe('f11-heartbeat-stale:100');
  });

  it('kill switch: anything but exactly send is a dry run', async () => {
    for (const v of [undefined, '', 'SEND', 'Send', ' send', 'send ', 'true']) {
      const { d, sent } = deps(100);
      const out = await runHeartbeatCheck({ ...SEND, ALERTS_SEND: v }, d);
      expect(out.action).toBe('dry-run');
      expect(sent).toEqual([]);
    }
  });

  it('no operator in the allowlist: dry run, nothing sent', async () => {
    const { d, sent } = deps(100);
    expect(await runHeartbeatCheck({ ...SEND, ALERTS_ALLOWLIST: ' , ' }, d)).toMatchObject({
      action: 'dry-run',
      reason: 'no_operator',
    });
    expect(sent).toEqual([]);
  });

  it('fresh, threshold unset, or a failed read: nothing sent', async () => {
    const fresh = deps(900);
    expect((await runHeartbeatCheck(SEND, fresh.d)).action).toBe('none');
    const unset = deps(100);
    expect(
      await runHeartbeatCheck({ ...SEND, HEARTBEAT_STALE_SECONDS: undefined }, unset.d),
    ).toEqual({
      action: 'none',
      reason: 'threshold_unset',
    });
    const failing = deps(100);
    const out = await runHeartbeatCheck(SEND, {
      ...failing.d,
      latestTickedAt: () => Promise.reject(new Error('permission denied')),
    });
    expect(out).toEqual({ action: 'read_failed' });
    expect([...fresh.sent, ...unset.sent, ...failing.sent]).toEqual([]);
  });

  it('guard removal would send: the same stale input with every guard satisfied delivers', async () => {
    // Proves the dry-run tests above are held by the guards, not by a broken send path.
    const { d, sent } = deps(100);
    await runHeartbeatCheck({ ...SEND, ALERTS_SEND: 'nope' }, d);
    expect(sent).toHaveLength(0);
    await runHeartbeatCheck(SEND, d);
    expect(sent).toHaveLength(1);
  });

  it('operator idempotency keys are stable per (event, operator) and differ across operators', async () => {
    const a = await operatorIdempotencyKey('f11-heartbeat-stale:100', OP);
    expect(await operatorIdempotencyKey('f11-heartbeat-stale:100', OP)).toBe(a);
    expect(
      await operatorIdempotencyKey('f11-heartbeat-stale:100', 'second@alerts.example.test'),
    ).not.toBe(a);
    expect(a.length).toBeLessThanOrEqual(256);
  });

  it('resendOperatorTransport posts once to Resend with the event id, via the injected fetch', async () => {
    const calls: [string, RequestInit][] = [];
    const t = resendOperatorTransport('k', 'from@alerts.example.test', OP, (u, i) => {
      calls.push([String(u), i!]);
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    await t.deliver({ subject: 's', body: 'b', severity: 'critical' }, 'ev-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('https://api.resend.com/emails');
    const key = (calls[0]![1].headers as Record<string, string>)['idempotency-key'];
    expect(key).toMatch(/^ev-1\/[0-9a-f]{16}$/);
    expect(key).not.toContain(OP);
    const failing = resendOperatorTransport('k', 'f@x.test', OP, () =>
      Promise.resolve(new Response('', { status: 500 })),
    );
    await expect(
      failing.deliver({ subject: 's', body: 'b', severity: 'info' }, 'e'),
    ).rejects.toThrow('500');
  });
});
