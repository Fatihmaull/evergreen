/**
 * PH2-E2-06 planning: event + recipient state -> DispatchRequest rendered from
 * templates.ts, then dispatched through an injected memory store. No network:
 * global fetch throws and the transport is a fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchUserAlertEvent,
  eventIdProblem,
  memoryOutboxStore,
  planUserAlert,
  renderAlertEmail,
  type AlertTransport,
  type UserAlertEvent,
} from '../src/index.js';

const RECIPIENT = 'tester@alerts.example.test';
const SEND = { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: RECIPIENT };

const ev = (over: Partial<UserAlertEvent> = {}): UserAlertEvent => ({
  userId: 'u1',
  kind: 'refund_delayed',
  eventId: 'job:j1:refund-delayed',
  recipient: RECIPIENT,
  context: { entry: 'CABC', network: 'testnet' },
  prefs: {},
  deactivated: false,
  ...over,
});

function fake(): AlertTransport & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    deliver(_n, id) {
      calls.push(id);
      return Promise.resolve({ id: 'em_1' });
    },
  };
}

const deps = (t: AlertTransport) => ({
  store: memoryOutboxStore(),
  transportFor: () => t,
  nowSeconds: () => 1_000,
});

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is forbidden in tests');
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('planUserAlert', () => {
  it('renders the notification from templates.ts', () => {
    const p = planUserAlert(ev());
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const e = renderAlertEmail('refund_delayed', { entry: 'CABC', network: 'testnet' });
    expect(p.request.notification).toEqual({
      subject: e.subject,
      body: e.body,
      severity: e.severity,
    });
    expect(p.request.eventId).toBe('job:j1:refund-delayed');
  });

  it.each([
    ['', 'empty'],
    ['x'.repeat(201), 'too_long'],
    ['job:j1 refund', 'whitespace'],
    ['job:j1\r\nX: y', 'whitespace'],
    [`job:${RECIPIENT}`, 'contains_at'],
  ])('refuses event id %j (%s)', (id, problem) => {
    expect(eventIdProblem(id)).toBe(problem);
    expect(planUserAlert(ev({ eventId: id }))).toEqual({
      ok: false,
      reason: 'invalid_event_id',
      problem,
    });
  });
});

describe('dispatchUserAlertEvent', () => {
  it('nothing sends by default: ALERTS_SEND unset is dry-run, no row, no deliver', async () => {
    const t = fake();
    const d = deps(t);
    expect(await dispatchUserAlertEvent({}, ev(), d)).toEqual({
      action: 'dry-run',
      reason: 'alerts_send_off',
    });
    expect(t.calls).toEqual([]);
    expect(d.store.rows.size).toBe(0);
  });

  it('guard-removal check: the same event sends exactly once when the gate is open', async () => {
    // If the ALERTS_SEND gate were removed, the dry-run test above would see a
    // deliver call; this proves the fake would record one.
    const t = fake();
    const d = deps(t);
    expect(await dispatchUserAlertEvent(SEND, ev(), d)).toEqual({ action: 'sent' });
    expect(await dispatchUserAlertEvent(SEND, ev(), d)).toEqual({
      action: 'duplicate',
      status: 'sent',
    });
    expect(t.calls).toEqual(['job:j1:refund-delayed']);
  });

  it.each(['SEND', ' send', 'send ', 'Send', 'dry-run', ''])(
    'ALERTS_SEND=%j stays dry-run',
    async (v) => {
      const t = fake();
      const out = await dispatchUserAlertEvent({ ...SEND, ALERTS_SEND: v }, ev(), deps(t));
      expect(out.action).toBe('dry-run');
      expect(t.calls).toEqual([]);
    },
  );

  it('recipient outside the allowlist is dry-run', async () => {
    const t = fake();
    const out = await dispatchUserAlertEvent(
      { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: 'other@alerts.example.test' },
      ev(),
      deps(t),
    );
    expect(out).toEqual({ action: 'dry-run', reason: 'not_allowlisted' });
    expect(t.calls).toEqual([]);
  });

  it('optional kind opted out is skipped; required kind ignores prefs', async () => {
    const t = fake();
    const d = deps(t);
    expect(
      await dispatchUserAlertEvent(
        SEND,
        ev({
          kind: 'extend_succeeded',
          eventId: 'job:j2:extended',
          prefs: { extend_succeeded: false },
        }),
        d,
      ),
    ).toEqual({ action: 'skip', reason: 'opted_out' });
    expect(
      await dispatchUserAlertEvent(
        SEND,
        ev({ prefs: { refund_delayed: false } as UserAlertEvent['prefs'] }),
        d,
      ),
    ).toEqual({ action: 'sent' });
  });

  it('invalid event id never reaches the store or transport', async () => {
    const t = fake();
    const d = deps(t);
    const out = await dispatchUserAlertEvent(SEND, ev({ eventId: `x:${RECIPIENT}` }), d);
    expect(out).toEqual({ action: 'invalid', reason: 'invalid_event_id', problem: 'contains_at' });
    expect(t.calls).toEqual([]);
    expect(d.store.rows.size).toBe(0);
  });

  it('deactivated user gets nothing', async () => {
    const t = fake();
    expect(await dispatchUserAlertEvent(SEND, ev({ deactivated: true }), deps(t))).toEqual({
      action: 'skip',
      reason: 'deactivated',
    });
    expect(t.calls).toEqual([]);
  });
});
