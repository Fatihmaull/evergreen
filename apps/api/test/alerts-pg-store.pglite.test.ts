/**
 * The per-user alert stores (PH2-E2-06) on a real Postgres engine (PGlite) with the real
 * migrations applied in order (schema.sql → 0002 … 0006 → 0008 → 0009 → 0011), **run as `eg_api`**,
 * the role the API Worker sends alerts as. Every statement below therefore works under 0011's grants
 * or the test fails with `permission denied`: SELECT on both tables, INSERT / UPDATE on named
 * columns, no DELETE. The dispatcher runs over the Postgres store end to end.
 *
 * Test-harness only: the 0008 neon_superuser guard line is removed (PGlite has no such role).
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SqlClient } from '../src/auth/pg-store.js';
import { dispatchUserAlert, type DispatchRequest } from '../src/alerts/dispatch.js';
import { PgAlertOutboxStore, PgAlertPreferencesStore } from '../src/alerts/pg-store.js';
import { ALERT_SPECS, type AlertKind } from '../src/alerts/policy.js';
import type { AlertNotification, AlertTransport } from '../src/alerts/sender.js';

const db = (f: string): string => readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8');
const NEON_LINE = "       OR pg_has_role(r, 'neon_superuser', 'MEMBER')\n";
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const DAY = 24 * 60 * 60;
const SEND_ENV = { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: 'user@example.invalid' } as const;

let pg: PGlite;

/** Runs `fn` as `eg_api`, then back as the owner. */
async function asApi<T>(fn: () => Promise<T>): Promise<T> {
  await pg.exec('SET ROLE eg_api');
  try {
    return await fn();
  } finally {
    await pg.exec('RESET ROLE');
  }
}
const sql: SqlClient = {
  query: (text, params) =>
    asApi(async () => (await pg.query<Record<string, unknown>>(text, [...params])).rows),
  transaction: async (queries) => {
    const out: Record<string, unknown>[][] = [];
    for (const q of queries)
      out.push(
        await asApi(
          async () => (await pg.query<Record<string, unknown>>(q.text, [...q.params])).rows,
        ),
      );
    return out;
  },
};
const outbox = new PgAlertOutboxStore(sql);
const prefs = new PgAlertPreferencesStore(sql);

const owner = async (text: string): Promise<Record<string, unknown>[]> =>
  (await pg.query<Record<string, unknown>>(text)).rows;
const rowOf = async (user: string, event: string) =>
  (
    await owner(
      `SELECT status, attempts, resend_email_id, sent_at IS NOT NULL AS has_sent_at,
              last_attempt_at IS NOT NULL AS has_last FROM alert_outbox
       WHERE user_id = '${user}' AND event_id = '${event}'`,
    )
  )[0];
const count = async (table: string): Promise<number> =>
  Number((await owner(`SELECT count(*)::int AS n FROM ${table}`))[0]!['n']);

const claimArgs = (event: string, kind: AlertKind = 'extend_failed_refund', user = U1) => ({
  userId: user,
  eventId: event,
  kind,
  severity: 'critical' as const,
});
const nowS = (): number => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { pgcrypto } });
  for (const f of [
    'schema.sql',
    '0002_jobs_daily_limit_per_user.sql',
    '0003_auth_rate_counters_wallet_challenges.sql',
    '0004_users_reactivated_at.sql',
    '0005_scheduler_ticks.sql',
    '0006_jobs_submitted_hashes.sql',
  ])
    await pg.exec(db(f));
  await pg.exec('CREATE ROLE eg_api LOGIN; CREATE ROLE eg_scheduler LOGIN;');
  const s0008 = db('0008_roles_grants.sql');
  if (!s0008.includes(NEON_LINE)) throw new Error('0008 neon_superuser guard line not found');
  await pg.exec(s0008.replace(NEON_LINE, ''));
  await pg.exec(db('0009_connect_and_scheduler_ticks_select.sql'));
  await pg.exec(db('0011_alert_outbox_and_prefs.sql'));
  await pg.exec(
    `INSERT INTO users (id, email) VALUES ('${U1}', 'a@example.test'), ('${U2}', 'b@example.test')`,
  );
}, 60_000);
afterAll(async () => {
  await pg?.close();
});
beforeEach(async () => {
  await pg.exec('TRUNCATE alert_outbox; TRUNCATE alert_preferences');
});

describe('PgAlertOutboxStore under the eg_api grants', () => {
  it('🔴 claim inserts a pending row with no attempts, and a second claim returns the same row', async () => {
    const first = await outbox.claim(claimArgs('ev1'));
    expect(first).toMatchObject({
      userId: U1,
      eventId: 'ev1',
      kind: 'extend_failed_refund',
      severity: 'critical',
      status: 'pending',
      attempts: 0,
    });
    expect(first.lastAttemptAt).toBeUndefined();
    expect(first.resendEmailId).toBeUndefined();
    expect(await outbox.claim(claimArgs('ev1'))).toEqual(first);
    expect(await count('alert_outbox')).toBe(1);
  });

  it('🔴 the same event id for another user is another row', async () => {
    await outbox.claim(claimArgs('ev1', 'extend_failed_refund', U1));
    await outbox.claim(claimArgs('ev1', 'extend_failed_refund', U2));
    expect(await count('alert_outbox')).toBe(2);
  });

  it('🔴 a claim for a row that already moved on returns its state, not a fresh pending one', async () => {
    await outbox.claim(claimArgs('ev1'));
    await outbox.beginAttempt(U1, 'ev1', 1_800_000_000);
    await outbox.markSent(U1, 'ev1', 're_123');
    expect(await outbox.claim(claimArgs('ev1'))).toMatchObject({
      status: 'sent',
      attempts: 1,
      resendEmailId: 're_123',
      lastAttemptAt: 1_800_000_000,
    });
  });

  it('🔴 beginAttempt counts the attempt and stamps its time (epoch seconds round-trip)', async () => {
    await outbox.claim(claimArgs('ev1'));
    await outbox.beginAttempt(U1, 'ev1', 1_800_000_123);
    await outbox.beginAttempt(U1, 'ev1', 1_800_000_999);
    expect(await outbox.claim(claimArgs('ev1'))).toMatchObject({
      attempts: 2,
      lastAttemptAt: 1_800_000_999,
      status: 'pending',
    });
  });

  it('🔴 markSent records the send time with the status (0011 refuses one without the other)', async () => {
    await outbox.claim(claimArgs('ev1'));
    await outbox.markSent(U1, 'ev1', undefined);
    expect(await rowOf(U1, 'ev1')).toMatchObject({
      status: 'sent',
      has_sent_at: true,
      resend_email_id: null,
    });
  });

  it('🔴 markFailed marks failed, and never turns a sent row back into failed', async () => {
    await outbox.claim(claimArgs('ev1'));
    await outbox.markFailed(U1, 'ev1');
    expect((await rowOf(U1, 'ev1'))!['status']).toBe('failed');
    await outbox.markSent(U1, 'ev1', 're_1');
    await outbox.markFailed(U1, 'ev1');
    expect((await rowOf(U1, 'ev1'))!['status']).toBe('sent');
  });

  it('🔴 updating a row that does not exist is an error, not a silent success', async () => {
    await expect(outbox.beginAttempt(U1, 'nope', 1)).rejects.toThrow(/missing/);
    await expect(outbox.markSent(U1, 'nope', undefined)).rejects.toThrow(/missing/);
  });

  it('🔴 it cannot touch another user’s row with the same event id', async () => {
    await outbox.claim(claimArgs('ev1', 'extend_failed_refund', U1));
    await outbox.claim(claimArgs('ev1', 'extend_failed_refund', U2));
    await outbox.markSent(U2, 'ev1', 're_2');
    expect((await rowOf(U1, 'ev1'))!['status']).toBe('pending');
    expect((await rowOf(U2, 'ev1'))!['status']).toBe('sent');
  });
});

describe('sentInWindow (the 24-hour cap on optional alerts)', () => {
  const sent = async (event: string, kind: AlertKind, user = U1): Promise<void> => {
    await outbox.claim(claimArgs(event, kind, user));
    await outbox.markSent(user, event, undefined);
  };

  it('🔴 counts optional sends in the window, not required ones, pending, failed, or other users', async () => {
    await sent('o1', 'allowance_expiring');
    await sent('o2', 'approaching_critical');
    await sent('o3', 'extend_succeeded');
    await sent('r1', 'extend_failed_refund'); // required: never counted
    await outbox.claim(claimArgs('p1', 'allowance_expiring')); // pending
    await outbox.claim(claimArgs('f1', 'allowance_expiring'));
    await outbox.markFailed(U1, 'f1');
    await sent('x1', 'allowance_expiring', U2); // someone else
    expect(await outbox.sentInWindow(U1, nowS(), DAY)).toBe(3);
    expect(await outbox.sentInWindow(U2, nowS(), DAY)).toBe(1);
  });

  it('🔴 a send older than the window is not counted, and one just inside it is', async () => {
    await sent('old', 'allowance_expiring');
    await sent('edge', 'allowance_expiring');
    await owner(
      `UPDATE alert_outbox SET sent_at = now() - interval '25 hours' WHERE event_id = 'old'`,
    );
    await owner(
      `UPDATE alert_outbox SET sent_at = now() - interval '23 hours 59 minutes' WHERE event_id = 'edge'`,
    );
    expect(await outbox.sentInWindow(U1, nowS(), DAY)).toBe(1);
  });

  it('the optional kinds the SQL counts are exactly the ones ALERT_SPECS calls optional', async () => {
    const optional = (Object.keys(ALERT_SPECS) as AlertKind[]).filter(
      (k) => ALERT_SPECS[k].class === 'optional',
    );
    for (const [i, kind] of optional.entries()) await sent(`k${i}`, kind);
    for (const [i, kind] of (Object.keys(ALERT_SPECS) as AlertKind[])
      .filter((k) => ALERT_SPECS[k].class === 'required')
      .entries())
      await sent(`q${i}`, kind);
    expect(await outbox.sentInWindow(U1, nowS(), DAY)).toBe(optional.length);
  });
});

describe('dispatchUserAlert over the Postgres store', () => {
  const note: AlertNotification = { subject: 's', body: 'b', severity: 'warn' };
  const request = (
    eventId: string,
    kind: AlertKind = 'allowance_expiring',
    over: Partial<DispatchRequest> = {},
  ): DispatchRequest => ({
    userId: U1,
    kind,
    eventId,
    recipient: 'user@example.invalid',
    notification: note,
    prefs: {},
    deactivated: false,
    ...over,
  });
  function transport(failFirst = 0) {
    const calls: string[] = [];
    let failures = failFirst;
    const t: AlertTransport = {
      deliver: (_n, eventId) => {
        calls.push(eventId);
        if (failures-- > 0) return Promise.reject(new Error('boom'));
        return Promise.resolve({ id: 're_ok' });
      },
    };
    return { t, calls };
  }
  const deps = (t: AlertTransport, now = nowS) => ({
    store: outbox,
    transportFor: () => t,
    nowSeconds: now,
  });

  it('🔴 sends once, records it, and a second dispatch of the same event is a duplicate', async () => {
    const { t, calls } = transport();
    expect(await dispatchUserAlert(SEND_ENV, request('ev1'), deps(t))).toEqual({ action: 'sent' });
    expect(await rowOf(U1, 'ev1')).toMatchObject({
      status: 'sent',
      attempts: 1,
      resend_email_id: 're_ok',
      has_sent_at: true,
    });
    expect(await dispatchUserAlert(SEND_ENV, request('ev1'), deps(t))).toEqual({
      action: 'duplicate',
      status: 'sent',
    });
    expect(calls).toEqual(['ev1']);
  });

  it('🔴 a failed send is retried only after its backoff, and gives up after 3 attempts', async () => {
    const { t, calls } = transport(3);
    let now = 1_800_000_000;
    const d = deps(t, () => now);
    expect(await dispatchUserAlert(SEND_ENV, request('ev2'), d)).toEqual({
      action: 'failed',
      attempts: 1,
    });
    expect(await dispatchUserAlert(SEND_ENV, request('ev2'), d)).toMatchObject({
      action: 'backoff',
      attempts: 1,
      retryAt: now + 300,
    });
    now += 300;
    expect(await dispatchUserAlert(SEND_ENV, request('ev2'), d)).toEqual({
      action: 'failed',
      attempts: 2,
    });
    now += 900;
    expect(await dispatchUserAlert(SEND_ENV, request('ev2'), d)).toEqual({
      action: 'failed',
      attempts: 3,
    });
    now += 10_000;
    expect(await dispatchUserAlert(SEND_ENV, request('ev2'), d)).toEqual({
      action: 'exhausted',
      attempts: 3,
    });
    expect(calls).toHaveLength(3);
    expect((await rowOf(U1, 'ev2'))!['status']).toBe('failed');
  });

  it('🔴 a retry that succeeds ends sent, with all attempts counted', async () => {
    const { t } = transport(1);
    let now = 1_800_000_000;
    const d = deps(t, () => now);
    await dispatchUserAlert(SEND_ENV, request('ev3'), d);
    now += 300;
    expect(await dispatchUserAlert(SEND_ENV, request('ev3'), d)).toEqual({ action: 'sent' });
    expect(await rowOf(U1, 'ev3')).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('🔴 the sixth optional alert in 24 hours is skipped, a required one still goes', async () => {
    const { t, calls } = transport();
    for (let i = 0; i < 5; i++) {
      expect(await dispatchUserAlert(SEND_ENV, request(`opt${i}`), deps(t))).toEqual({
        action: 'sent',
      });
    }
    expect(await dispatchUserAlert(SEND_ENV, request('opt5'), deps(t))).toEqual({
      action: 'skip',
      reason: 'rate_limited',
    });
    expect(
      await dispatchUserAlert(SEND_ENV, request('req1', 'extend_failed_refund'), deps(t)),
    ).toEqual({ action: 'sent' });
    expect(calls).toHaveLength(6);
    // The skipped one never made a row: nothing was claimed for it.
    expect(await rowOf(U1, 'opt5')).toBeUndefined();
  });

  it('🔴 a preference read from the table opts the user out, and a required alert ignores it', async () => {
    await prefs.set(U1, 'allowance_expiring', false, nowS());
    const { t, calls } = transport();
    const p = await prefs.get(U1);
    expect(
      await dispatchUserAlert(
        SEND_ENV,
        request('ev4', 'allowance_expiring', { prefs: p }),
        deps(t),
      ),
    ).toEqual({
      action: 'skip',
      reason: 'opted_out',
    });
    expect(
      await dispatchUserAlert(
        SEND_ENV,
        request('ev5', 'extend_failed_refund', { prefs: p }),
        deps(t),
      ),
    ).toEqual({ action: 'sent' });
    expect(calls).toEqual(['ev5']);
  });
});

describe('PgAlertPreferencesStore under the eg_api grants', () => {
  it('a user with no rows has set nothing (every kind is its default)', async () => {
    expect(await prefs.get(U1)).toEqual({});
  });

  it('🔴 set stores the choice, a second set replaces it, and users are separate', async () => {
    await prefs.set(U1, 'approaching_critical', false, 1_800_000_000);
    await prefs.set(U2, 'approaching_critical', true, 1_800_000_000);
    expect(await prefs.get(U1)).toEqual({ approaching_critical: false });
    await prefs.set(U1, 'approaching_critical', true, 1_800_000_500);
    expect(await prefs.get(U1)).toEqual({ approaching_critical: true });
    expect(await prefs.get(U2)).toEqual({ approaching_critical: true });
    expect(await count('alert_preferences')).toBe(2);
    expect(
      Number(
        (
          await owner(
            `SELECT extract(epoch FROM updated_at)::bigint AS t FROM alert_preferences WHERE user_id = '${U1}'`,
          )
        )[0]!['t'],
      ),
    ).toBe(1_800_000_500);
  });

  it('🔴 reset is an UPDATE back to the default and keeps the row (eg_api has no DELETE)', async () => {
    await prefs.set(U1, 'extend_succeeded', false, 1_800_000_000);
    await prefs.reset(U1, 'extend_succeeded', 1_800_000_900);
    expect(await prefs.get(U1)).toEqual({
      extend_succeeded: ALERT_SPECS.extend_succeeded.defaultOn,
    });
    expect(await count('alert_preferences')).toBe(1);
  });

  it('🔴 reset touches only the kind named, not the user’s other choices', async () => {
    await prefs.set(U1, 'extend_succeeded', false, 1_800_000_000);
    await prefs.set(U1, 'approaching_critical', false, 1_800_000_000);
    await prefs.reset(U1, 'extend_succeeded', 1_800_000_900);
    expect(await prefs.get(U1)).toEqual({
      extend_succeeded: true,
      approaching_critical: false,
    });
  });

  it('resetting a kind nobody set creates no row', async () => {
    await prefs.reset(U1, 'allowance_expiring', 1_800_000_000);
    expect(await count('alert_preferences')).toBe(0);
  });

  it.each(['preflight_failed', 'extend_failed_refund', 'testnet_reset'] as const)(
    '🔴 a required alert (%s) has no preference: refused before any SQL, and nothing is written',
    async (kind) => {
      await expect(prefs.set(U1, kind, false, 1)).rejects.toThrow(RangeError);
      await expect(prefs.reset(U1, kind, 1)).rejects.toThrow(RangeError);
      expect(await count('alert_preferences')).toBe(0);
    },
  );

  it('🔴 the table itself refuses a required kind too, if a caller got past the guard', async () => {
    await expect(
      sql.query(
        `INSERT INTO alert_preferences (user_id, kind, enabled, updated_at) VALUES ($1::uuid, 'preflight_failed', false, now())`,
        [U1],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('a row the store does not recognise', () => {
  it('🔴 is an error, not a status the dispatcher would act on', async () => {
    const odd = new PgAlertOutboxStore({
      query: () =>
        Promise.resolve([
          { kind: 'allowance_expiring', severity: 'warn', status: 'weird', attempts: 0 },
        ]),
      transaction: () => Promise.resolve([]),
    });
    await expect(odd.claim(claimArgs('ev1', 'allowance_expiring'))).rejects.toThrow(/status/);
  });

  it('a claim that finds no row after inserting is an error, not a made-up pending row', async () => {
    const empty = new PgAlertOutboxStore({
      query: () => Promise.resolve([]),
      transaction: () => Promise.resolve([]),
    });
    await expect(empty.claim(claimArgs('ev1'))).rejects.toThrow(/missing after claim/);
  });
});
