/**
 * PH2-E2-06 (docs/PH2-E2-06-ALERTS-DESIGN.md §8): kill switch, allowlist,
 * classification, rate limit and send decision. No network: the transport is
 * a fake and the global fetch throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALERT_RATE_LIMIT,
  ALERT_SPECS,
  alertRateDecision,
  alertsMode,
  canUnsubscribe,
  isRequired,
  parseAllowlist,
  sendAlert,
  wantsAlert,
  type AlertKind,
  type AlertRequest,
  type AlertTransport,
} from '../src/index.js';

const RECIPIENT = 'tester@alerts.example.test';

function fakeTransport(): AlertTransport & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    deliver(notification, eventId) {
      calls.push([notification, eventId]);
      return Promise.resolve({ status: 'accepted', submitted: true });
    },
  };
}

const req = (over: Partial<AlertRequest> = {}): AlertRequest => ({
  kind: 'refund_delayed',
  eventId: 'job:j1:refund-delayed',
  recipient: RECIPIENT,
  notification: { subject: 'Refund delayed', body: 'body', severity: 'critical' },
  prefs: {},
  sentInWindow: 0,
  deactivated: false,
  ...over,
});

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is not allowed in tests');
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('ALERTS_SEND kill switch (tests 2, 2a, 2b, 2c)', () => {
  it.each([[undefined], [''], ['dry-run'], ['SEND'], [' send'], ['send '], ['Send'], ['send\n']])(
    '%j is dry-run and never calls the transport',
    async (value) => {
      expect(alertsMode(value)).toBe('dry-run');
      const t = fakeTransport();
      const out = await sendAlert({ ALERTS_SEND: value, ALERTS_ALLOWLIST: RECIPIENT }, req(), t);
      expect(out).toEqual({ action: 'dry-run', reason: 'alerts_send_off' });
      expect(t.calls).toHaveLength(0);
    },
  );

  it('exactly "send" with an allowlisted recipient delivers once', async () => {
    expect(alertsMode('send')).toBe('send');
    const t = fakeTransport();
    const out = await sendAlert({ ALERTS_SEND: 'send', ALERTS_ALLOWLIST: RECIPIENT }, req(), t);
    expect(out.action).toBe('sent');
    expect(t.calls).toEqual([[req().notification, 'job:j1:refund-delayed']]);
  });
});

describe('ALERTS_ALLOWLIST (tests 2c, 8)', () => {
  it('parses comma-separated entries, trimming whitespace', () => {
    expect([...parseAllowlist(` ${RECIPIENT} , other@alerts.example.test,,`)]).toEqual([
      RECIPIENT,
      'other@alerts.example.test',
    ]);
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist('').size).toBe(0);
  });

  it.each([[undefined], [''], ['other@alerts.example.test'], [RECIPIENT.toUpperCase()]])(
    'send mode with allowlist %j outside the recipient is dry-run',
    async (allow) => {
      const t = fakeTransport();
      const out = await sendAlert({ ALERTS_SEND: 'send', ALERTS_ALLOWLIST: allow }, req(), t);
      expect(out).toEqual({ action: 'dry-run', reason: 'not_allowlisted' });
      expect(t.calls).toHaveLength(0);
    },
  );
});

describe('classification (§3, §6)', () => {
  const required: AlertKind[] = [
    'preflight_failed',
    'allowance_missing',
    'extend_failed_refund',
    'refund_delayed',
    'unexplained_charge',
    'testnet_reset',
    'restore_lost_changes',
  ];
  it('DoD-2 modes F1, F2, F4, F6, F7, F10, F19 are required and cannot be unsubscribed', () => {
    expect(required.map((k) => ALERT_SPECS[k].mode)).toEqual([
      'F1',
      'F2',
      'F4',
      'F6',
      'F7',
      'F10',
      'F19',
    ]);
    for (const k of required) {
      expect(isRequired(k)).toBe(true);
      expect(canUnsubscribe(k)).toBe(false);
      expect(wantsAlert(k, { [k]: false })).toBe(true);
    }
  });
  it('optional alerts can be unsubscribed; extend_succeeded is optional and default ON', () => {
    for (const k of ['allowance_expiring', 'approaching_critical', 'extend_succeeded'] as const) {
      expect(isRequired(k)).toBe(false);
      expect(canUnsubscribe(k)).toBe(true);
      expect(wantsAlert(k, {})).toBe(true);
      expect(wantsAlert(k, { [k]: false })).toBe(false);
    }
    expect(ALERT_SPECS.extend_succeeded).toEqual({
      mode: null,
      class: 'optional',
      defaultOn: true,
    });
  });
});

describe('rate limit (test 5)', () => {
  it('required alerts always pass; optional ones are held at the cap', () => {
    expect(alertRateDecision('refund_delayed', 1_000_000, 1)).toEqual({ allow: true });
    expect(alertRateDecision('extend_succeeded', 0, 1)).toEqual({ allow: true });
    expect(alertRateDecision('extend_succeeded', 1, 1)).toEqual({
      allow: false,
      reason: 'rate_limited',
    });
  });

  it('default cap is 5 optional alerts per 24 hours (Tih, 2026-10-29)', () => {
    expect(ALERT_RATE_LIMIT).toEqual({ maxOptionalPerWindow: 5, windowSeconds: 86_400 });
    expect(alertRateDecision('extend_succeeded', 4)).toEqual({ allow: true });
    expect(alertRateDecision('extend_succeeded', 5)).toEqual({
      allow: false,
      reason: 'rate_limited',
    });
    expect(alertRateDecision('refund_delayed', 5)).toEqual({ allow: true });
  });
});

describe('send decision', () => {
  const on = { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: RECIPIENT };
  it('deactivated users get nothing (test 6)', async () => {
    const t = fakeTransport();
    expect(await sendAlert(on, req({ deactivated: true }), t)).toEqual({
      action: 'skip',
      reason: 'deactivated',
    });
    expect(t.calls).toHaveLength(0);
  });
  it('opted-out optional alert is skipped; required with all prefs off still sends (test 4)', async () => {
    const t = fakeTransport();
    const out = await sendAlert(
      on,
      req({ kind: 'extend_succeeded', prefs: { extend_succeeded: false } }),
      t,
    );
    expect(out).toEqual({ action: 'skip', reason: 'opted_out' });
    expect(t.calls).toHaveLength(0);
    const off = Object.fromEntries(Object.keys(ALERT_SPECS).map((k) => [k, false]));
    expect((await sendAlert(on, req({ prefs: off }), t)).action).toBe('sent');
    expect(t.calls).toHaveLength(1);
  });
  it('rate-limited optional alert is skipped; required past the cap still sends', async () => {
    const t = fakeTransport();
    expect(await sendAlert(on, req({ kind: 'extend_succeeded', sentInWindow: 999 }), t)).toEqual({
      action: 'skip',
      reason: 'rate_limited',
    });
    expect((await sendAlert(on, req({ sentInWindow: 999 }), t)).action).toBe('sent');
    expect(t.calls).toHaveLength(1);
  });

  it('guard removal: without the kill-switch guard a non-"send" value would deliver', async () => {
    // Proves the dry-run assertions above are load-bearing: the same request
    // with only ALERTS_SEND flipped to exactly "send" does reach the transport.
    const t = fakeTransport();
    await sendAlert({ ...on, ALERTS_SEND: 'SEND' }, req(), t);
    expect(t.calls).toHaveLength(0);
    await sendAlert(on, req(), t);
    expect(t.calls).toHaveLength(1);
  });
  it('guard removal: without the allowlist guard the same request would deliver', async () => {
    const t = fakeTransport();
    await sendAlert({ ...on, ALERTS_ALLOWLIST: '' }, req(), t);
    expect(t.calls).toHaveLength(0);
    await sendAlert(on, req(), t);
    expect(t.calls).toHaveLength(1);
  });
});
