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
  it('renders the notification from templates.ts', async () => {
    const p = await planUserAlert(ev());
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
  ])('refuses event id %j (%s)', async (id, problem) => {
    expect(eventIdProblem(id)).toBe(problem);
    expect(await planUserAlert(ev({ eventId: id }))).toEqual({
      ok: false,
      reason: 'invalid_event_id',
      problem,
    });
  });

  it('an optional alert carries the preferences link and the one-click headers', async () => {
    const p = await planUserAlert(
      ev({
        kind: 'extend_succeeded',
        eventId: 'job:j2:extended',
        userId: 'user-1',
        dashboardOrigin: 'https://dashboard.example.test',
        unsubscribeSecret: 'test-unsubscribe-secret',
        nowSeconds: 1_800_000_000,
      }),
    );
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.request.notification.body).toContain(
      'https://dashboard.example.test/dashboard/alerts/',
    );
    expect(p.request.notification.body).not.toContain('mailto:');
    const headers = p.request.notification.headers;
    expect(headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(headers?.['List-Unsubscribe']).toMatch(
      /^<https:\/\/dashboard\.example\.test\/api\/v1\/alerts\/unsubscribe\?token=[A-Za-z0-9_-]+\.[0-9a-f]{64}>$/,
    );
    expect(JSON.stringify(headers)).not.toContain('mailto:');
    expect(JSON.stringify(p.request.notification)).not.toContain('test-unsubscribe-secret');
  });

  it('a required alert does not gain an unsubscribe header when the secret is set', async () => {
    const p = await planUserAlert(
      ev({
        dashboardOrigin: 'https://dashboard.example.test',
        unsubscribeSecret: 'test-unsubscribe-secret',
        nowSeconds: 1_800_000_000,
      }),
    );
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.request.notification.headers).toBeUndefined();
    expect(p.request.notification.body).toContain('cannot be turned off');
    expect(p.request.notification.body).not.toContain('/dashboard/alerts/');
    expect(p.request.notification.body).not.toContain('mailto:');
  });

  it('a missing secret still links the preferences page and adds no one-click header', async () => {
    const p = await planUserAlert(
      ev({
        kind: 'extend_succeeded',
        eventId: 'job:j2:extended',
        dashboardOrigin: 'https://dashboard.example.test',
        nowSeconds: 1_800_000_000,
      }),
    );
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.request.notification.body).toContain(
      'https://dashboard.example.test/dashboard/alerts/',
    );
    expect(p.request.notification.headers).toBeUndefined();
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

  it('a planned optional alert hands the one-click headers to the transport', async () => {
    const seen: { headers?: Readonly<Record<string, string>> }[] = [];
    const t: AlertTransport = {
      deliver(n) {
        seen.push({ headers: n.headers });
        return Promise.resolve({ id: 'em_1' });
      },
    };
    const out = await dispatchUserAlertEvent(
      SEND,
      ev({
        kind: 'extend_succeeded',
        eventId: 'job:j2:extended',
        userId: 'user-1',
        dashboardOrigin: 'https://dashboard.example.test',
        unsubscribeSecret: 'test-unsubscribe-secret',
        nowSeconds: 1_800_000_000,
      }),
      deps(t),
    );
    expect(out).toEqual({ action: 'sent' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(JSON.stringify(seen)).not.toContain('test-unsubscribe-secret');
    expect(JSON.stringify(seen)).not.toContain(RECIPIENT);
  });
});
