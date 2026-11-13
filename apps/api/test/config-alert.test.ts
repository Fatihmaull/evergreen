/**
 * PH2-E4-05 F17/F18 operator email. No network: fetch throws, the transport is
 * a fake. The alert sees setting names from `configCheck`, never the values.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_REQUIRED_SETTINGS } from '../src/alerts/failure-modes.js';
import {
  configCheck,
  configProblemEventId,
  configProblemNames,
  configProblemNotification,
  runConfigProblemAlert,
  type AlertTransport,
  type ConfigAlertDeps,
} from '../src/index.js';

const OP_A = 'ops-a@example.invalid';
const OP_B = 'ops-b@example.invalid';
const NOW = 1_800_000_000;
const SECRET = '10xSECRET';

const full = Object.fromEntries(API_REQUIRED_SETTINGS.map((n) => [n, `value-of-${n}`]));

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is not allowed in tests');
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function deps(now = NOW) {
  const sent: { to: string; eventId: string; body: string }[] = [];
  const d: ConfigAlertDeps = {
    nowSeconds: () => now,
    transportFor: (to): AlertTransport => ({
      deliver: (n, eventId) => {
        sent.push({ to, eventId, body: n.body });
        return Promise.resolve({ ok: true });
      },
    }),
  };
  return { d, sent };
}

describe('F17/F18 config operator alert', () => {
  it('names are sorted, and the event id is the UTC day', () => {
    const check = configCheck({
      ...full,
      THRESHOLD_FLOOR_LEDGERS: SECRET,
      DASHBOARD_ORIGIN: undefined,
    });
    expect(configProblemNames(check)).toEqual(['DASHBOARD_ORIGIN', 'THRESHOLD_FLOOR_LEDGERS']);
    expect(configProblemEventId(configProblemNames(check), NOW)).toBe(
      'f17-f18:DASHBOARD_ORIGIN,THRESHOLD_FLOOR_LEDGERS:2027-01-15',
    );
    expect(configProblemEventId(['THRESHOLD_FLOOR_LEDGERS'], NOW + 3600)).toBe(
      'f17-f18:THRESHOLD_FLOOR_LEDGERS:2027-01-15',
    );
    expect(configProblemEventId(['THRESHOLD_FLOOR_LEDGERS'], NOW + 86400)).toBe(
      'f17-f18:THRESHOLD_FLOOR_LEDGERS:2027-01-16',
    );
  });

  it('unset and malformed share a name-only body, and the value is not in it', () => {
    const unset = configProblemNotification(
      configProblemNames(configCheck({ ...full, THRESHOLD_FLOOR_LEDGERS: '' })),
    );
    const malformed = configProblemNotification(
      configProblemNames(configCheck({ ...full, THRESHOLD_FLOOR_LEDGERS: SECRET })),
    );
    expect(unset).toEqual(malformed);
    expect(unset.body).toBe(
      'F17/F18: configuration problem. Setting names: THRESHOLD_FLOOR_LEDGERS. Checked by the API Worker cron.',
    );
    expect(JSON.stringify(unset)).not.toContain(SECRET);
    expect(JSON.stringify(unset)).not.toContain('value-of-');
  });

  it('no problem does not call the transport', async () => {
    const { d, sent } = deps();
    const check = configCheck({ ...full, THRESHOLD_FLOOR_LEDGERS: '1037' });
    const outcome = await runConfigProblemAlert(
      { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: OP_A },
      check,
      d,
    );
    expect(outcome).toEqual({ action: 'none' });
    expect(sent).toEqual([]);
  });

  it('EMAIL_API_KEY or EMAIL_FROM missing does not call the transport', async () => {
    for (const name of ['EMAIL_API_KEY', 'EMAIL_FROM'] as const) {
      const env = { ...full, THRESHOLD_FLOOR_LEDGERS: '1037', [name]: '   ' };
      const check = configCheck(env);
      const { d, sent } = deps();
      const outcome = await runConfigProblemAlert(
        { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: `${OP_A}, ${OP_B}` },
        check,
        d,
      );
      expect(outcome).toMatchObject({ action: 'email_channel_down', blockedBy: [name] });
      expect(sent).toEqual([]);
      expect(JSON.stringify(outcome)).not.toContain('value-of-');
    }
  });

  it('the kill switch and an empty allowlist send nothing', async () => {
    const check = configCheck(full);
    expect(check.problem).toBe(true);
    for (const v of [undefined, '', 'SEND', ' send', 'send ']) {
      const off = deps();
      const dry = await runConfigProblemAlert(
        { ALERTS_SEND: v, ALERTS_ALLOWLIST: OP_A },
        check,
        off.d,
      );
      expect(dry).toEqual({
        action: 'dry-run',
        reason: 'alerts_send_off',
        settings: ['THRESHOLD_FLOOR_LEDGERS'],
      });
      expect(off.sent).toEqual([]);
    }
    const none = deps();
    const empty = await runConfigProblemAlert({ ALERTS_SEND: 'send' }, check, none.d);
    expect(empty).toEqual({
      action: 'dry-run',
      reason: 'no_operator',
      settings: ['THRESHOLD_FLOOR_LEDGERS'],
    });
    expect(none.sent).toEqual([]);
  });

  it('sends the sorted names once per operator and does not log a value', async () => {
    const logs: unknown[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
    const check = configCheck({
      ...full,
      THRESHOLD_FLOOR_LEDGERS: SECRET,
      DASHBOARD_ORIGIN: undefined,
    });
    const { d, sent } = deps();
    const outcome = await runConfigProblemAlert(
      { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: `${OP_A}, ${OP_B}` },
      check,
      d,
    );
    expect(outcome).toEqual({
      action: 'sent',
      recipients: 2,
      settings: ['DASHBOARD_ORIGIN', 'THRESHOLD_FLOOR_LEDGERS'],
    });
    expect(sent.map((s) => s.to)).toEqual([OP_A, OP_B]);
    expect(sent[0]!.eventId).toBe('f17-f18:DASHBOARD_ORIGIN,THRESHOLD_FLOOR_LEDGERS:2027-01-15');
    expect(sent[0]!.body).not.toContain(SECRET);
    expect(sent[0]!.body).not.toContain('value-of-');
    expect(sent[0]!.body).not.toContain(OP_A);
    expect(JSON.stringify(logs)).not.toContain(SECRET);
    expect(JSON.stringify(outcome)).not.toContain(SECRET);
  });

  it('a thrown deliver is send_failed and the next operator still runs', async () => {
    const logs: unknown[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(JSON.parse(String(line)));
    });
    const sent: string[] = [];
    const d: ConfigAlertDeps = {
      nowSeconds: () => NOW,
      transportFor: (to): AlertTransport => ({
        deliver: () => {
          sent.push(to);
          if (to === OP_A) {
            const error = new Error(`abort LEAK ${to} ${SECRET}`);
            error.name = 'AbortError';
            throw error;
          }
          return Promise.resolve({ ok: true });
        },
      }),
    };
    const check = configCheck(full);
    const outcome = await runConfigProblemAlert(
      { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: `${OP_A}, ${OP_B}` },
      check,
      d,
    );
    expect(outcome).toEqual({
      action: 'sent',
      recipients: 1,
      failed: 1,
      settings: ['THRESHOLD_FLOOR_LEDGERS'],
    });
    expect(sent).toEqual([OP_A, OP_B]);
    expect(logs).toEqual([
      { event: 'alerts.f17_f18_config', action: 'send_failed', errorName: 'AbortError' },
    ]);
    const all = JSON.stringify(logs);
    expect(all).not.toContain(OP_A);
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain('LEAK');
  });
});
