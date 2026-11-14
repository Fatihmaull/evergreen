/**
 * PH2-E4-05 F14. No network: fetch throws, the transport is a fake, and the
 * alert function has no database argument.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  databaseUnavailableEventId,
  databaseUnavailableNotification,
  runDatabaseUnavailableAlert,
  type AlertTransport,
  type DatabaseUnavailableDeps,
} from '../src/index.js';

const OP_A = 'ops-a@example.invalid';
const OP_B = 'ops-b@example.invalid';
const NOW = 1_800_000_000;

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
  const d: DatabaseUnavailableDeps = {
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

describe('F14 database unavailable alert', () => {
  it('the event id is the UTC hour and ignores minutes inside that hour', () => {
    expect(databaseUnavailableEventId(NOW)).toBe('f14-database-unavailable:2027-01-15T08');
    expect(databaseUnavailableEventId(NOW + 1800)).toBe('f14-database-unavailable:2027-01-15T08');
    expect(databaseUnavailableEventId(NOW + 3599)).toBe('f14-database-unavailable:2027-01-15T08');
    expect(databaseUnavailableEventId(NOW + 3600)).toBe('f14-database-unavailable:2027-01-15T09');
  });

  it('the notification is fixed text and carries no address or database url', () => {
    const n = databaseUnavailableNotification();
    expect(n.subject).toBe('Evergreen operator alert: database unavailable (F14)');
    expect(n.body).toBe(
      'F14: the API cron could not read the database. The scheduler checks did not complete. This alert is sent without reading the database. Checked by the API Worker cron.',
    );
    expect(n.body).not.toContain('@');
    expect(n.body).not.toContain('postgres');
  });

  it('sends once per operator, and the kill switch sends nothing', async () => {
    const { d, sent } = deps();
    const outcome = await runDatabaseUnavailableAlert(
      { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: `${OP_A}, ${OP_B}` },
      d,
    );
    expect(outcome).toEqual({ action: 'sent', recipients: 2 });
    expect(sent.map((s) => s.to)).toEqual([OP_A, OP_B]);
    expect(sent[0]!.eventId).toBe('f14-database-unavailable:2027-01-15T08');
    expect(sent[1]!.eventId).toBe(sent[0]!.eventId);
    for (const v of [undefined, '', 'SEND', ' send', 'send ']) {
      const off = deps();
      const dry = await runDatabaseUnavailableAlert(
        { ALERTS_SEND: v, ALERTS_ALLOWLIST: OP_A },
        off.d,
      );
      expect(dry).toEqual({ action: 'dry-run', reason: 'alerts_send_off' });
      expect(off.sent).toEqual([]);
    }
  });

  it('no allowlist does not call the transport', async () => {
    const { d, sent } = deps();
    const outcome = await runDatabaseUnavailableAlert({ ALERTS_SEND: 'send' }, d);
    expect(outcome).toEqual({ action: 'dry-run', reason: 'no_operator' });
    expect(sent).toEqual([]);
  });

  it('a thrown deliver is send_failed and the next operator still runs', async () => {
    const logs: unknown[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(JSON.parse(String(line)));
    });
    const sent: string[] = [];
    const d: DatabaseUnavailableDeps = {
      nowSeconds: () => NOW,
      transportFor: (to): AlertTransport => ({
        deliver: () => {
          sent.push(to);
          if (to === OP_A) {
            const error = new Error(`abort LEAK ${to} postgres://secret`);
            error.name = 'AbortError';
            throw error;
          }
          return Promise.resolve({ ok: true });
        },
      }),
    };
    const outcome = await runDatabaseUnavailableAlert(
      { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: `${OP_A}, ${OP_B}` },
      d,
    );
    expect(outcome).toEqual({ action: 'sent', recipients: 1, failed: 1 });
    expect(sent).toEqual([OP_A, OP_B]);
    expect(logs).toEqual([
      { event: 'alerts.f14_database', action: 'send_failed', errorName: 'AbortError' },
    ]);
    const all = JSON.stringify(logs);
    expect(all).not.toContain(OP_A);
    expect(all).not.toContain('postgres');
    expect(all).not.toContain('LEAK');
  });
});
