/**
 * PH2-E2-06 dispatch: outbox before send, dedupe, retry bound, F10 signal 2.
 * No network: global fetch throws and the transport is a fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ALERT_MAX_ATTEMPTS,
  alertRetryDelaySeconds,
  dispatchUserAlert,
  memoryOutboxStore,
  testnetResetUserEvents,
  type AlertTransport,
  type DispatchRequest,
} from '../src/index.js';

const RECIPIENT = 'tester@alerts.example.test';
const SEND = { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: RECIPIENT };

function fake(fail = false): AlertTransport & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    deliver(_n, eventId) {
      calls.push(eventId);
      return fail ? Promise.reject(new Error('boom')) : Promise.resolve({ id: 'em_1' });
    },
  };
}

const req = (over: Partial<DispatchRequest> = {}): DispatchRequest => ({
  userId: 'u1',
  kind: 'refund_delayed',
  eventId: 'job:j1:refund-delayed',
  recipient: RECIPIENT,
  notification: { subject: 'Refund delayed', body: 'body', severity: 'critical' },
  prefs: {},
  deactivated: false,
  ...over,
});

const clock = { now: 1_000 };
const deps = (t: AlertTransport, store = memoryOutboxStore()) => ({
  store,
  transportFor: () => t,
  nowSeconds: () => clock.now,
});

beforeEach(() => {
  clock.now = 1_000;
  vi.stubGlobal('fetch', () => {
    throw new Error('network is not allowed in tests');
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('dispatchUserAlert', () => {
  it('guard: ALERTS_SEND unset writes no row and makes no send', async () => {
    const t = fake();
    const d = deps(t);
    const out = await dispatchUserAlert({ ALERTS_ALLOWLIST: RECIPIENT }, req(), d);
    expect(out).toEqual({ action: 'dry-run', reason: 'alerts_send_off' });
    expect(t.calls).toEqual([]);
    expect(d.store.rows.size).toBe(0);
  });

  it('guard: a recipient off the allowlist is never sent to', async () => {
    const t = fake();
    const out = await dispatchUserAlert({ ALERTS_SEND: 'send' }, req(), deps(t));
    expect(out).toEqual({ action: 'dry-run', reason: 'not_allowlisted' });
    expect(t.calls).toEqual([]);
  });

  it('writes the outbox row before the send and marks it sent', async () => {
    const store = memoryOutboxStore();
    const seen: string[] = [];
    const t: AlertTransport = {
      deliver(_n, e) {
        seen.push(store.rows.get(`u1\u0000${e}`)?.status ?? 'missing');
        return Promise.resolve({ id: 'em_1' });
      },
    };
    expect(await dispatchUserAlert(SEND, req(), deps(t, store))).toEqual({ action: 'sent' });
    expect(seen).toEqual(['pending']);
    const row = [...store.rows.values()][0]!;
    expect(row).toMatchObject({ status: 'sent', attempts: 1, resendEmailId: 'em_1' });
  });

  it('guard: the same event twice sends once', async () => {
    const t = fake();
    const d = deps(t);
    await dispatchUserAlert(SEND, req(), d);
    expect(await dispatchUserAlert(SEND, req(), d)).toEqual({
      action: 'duplicate',
      status: 'sent',
    });
    expect(t.calls).toEqual(['job:j1:refund-delayed']);
  });

  it('backoff is 0, 300 s, 900 s; default max attempts is 3', () => {
    expect(DEFAULT_ALERT_MAX_ATTEMPTS).toBe(3);
    expect([0, 1, 2].map(alertRetryDelaySeconds)).toEqual([0, 300, 900]);
  });

  it('a retry inside the backoff window does not send', async () => {
    const t = fake(true);
    const d = deps(t);
    expect(await dispatchUserAlert(SEND, req(), d)).toEqual({ action: 'failed', attempts: 1 });
    clock.now += 299;
    expect(await dispatchUserAlert(SEND, req(), d)).toEqual({
      action: 'backoff',
      attempts: 1,
      retryAt: 1_300,
    });
    expect(t.calls).toHaveLength(1);
  });

  it('a failed send is retried with the same event id after backoff, then stops at 3 attempts', async () => {
    const t = fake(true);
    const d = deps(t);
    for (let i = 1; i <= 3; i++) {
      expect(await dispatchUserAlert(SEND, req(), d)).toEqual({ action: 'failed', attempts: i });
      clock.now += alertRetryDelaySeconds(i);
    }
    expect(await dispatchUserAlert(SEND, req(), d)).toEqual({ action: 'exhausted', attempts: 3 });
    expect(new Set(t.calls)).toEqual(new Set(['job:j1:refund-delayed']));
    expect(t.calls).toHaveLength(3);
  });

  it('optional alerts are rate limited from the outbox count', async () => {
    const t = fake();
    const d = deps(t);
    for (let i = 0; i < 5; i++)
      await dispatchUserAlert(SEND, req({ kind: 'extend_succeeded', eventId: `ok:${i}` }), d);
    const out = await dispatchUserAlert(
      SEND,
      req({ kind: 'extend_succeeded', eventId: 'ok:5' }),
      d,
    );
    expect(out).toEqual({ action: 'skip', reason: 'rate_limited' });
    expect(t.calls).toHaveLength(5);
  });
});

describe('F10 signal 2: user email only when the next tick <= pre-drop ledger', () => {
  const t = (tickedAt: number, l: number) => ({ tickedAt, observedLedger: BigInt(l) });
  it('an unconfirmed drop on the latest tick sends nothing', () => {
    expect(testnetResetUserEvents([t(1, 100), t(2, 10)])).toEqual([]);
  });
  it('a recovery above the pre-drop ledger sends nothing', () => {
    expect(testnetResetUserEvents([t(1, 100), t(2, 10), t(3, 101)])).toEqual([]);
  });
  it('next tick <= pre-drop confirms one event, stable across later ticks', () => {
    expect(testnetResetUserEvents([t(1, 100), t(2, 10), t(3, 100)])).toEqual([
      'f10-testnet-reset:100->10',
    ]);
    expect(testnetResetUserEvents([t(1, 100), t(2, 10), t(3, 20), t(4, 30)])).toEqual([
      'f10-testnet-reset:100->10',
    ]);
  });
});
