/**
 * 0011_alert_outbox_and_prefs.sql on PGlite, after schema.sql → 0002 → … → 0006 → 0008 → 0009 → 0011.
 * (0007 and 0010 are not needed: 0011 depends on neither in this harness; see the 0008 test.)
 *
 * Test-harness only: the 0008 neon_superuser guard line is removed (PGlite has no such role).
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = (f: string): string =>
  readFileSync(new URL(`../../../apps/api/db/${f}`, import.meta.url), 'utf8');

const NEON_LINE = "       OR pg_has_role(r, 'neon_superuser', 'MEMBER')\n";
const s0008 = db('0008_roles_grants.sql');
const s0009 = db('0009_connect_and_scheduler_ticks_select.sql');
const s0011 = db('0011_alert_outbox_and_prefs.sql');
let pg: PGlite;
const uid = '11111111-1111-4111-8111-111111111111';
const uid2 = '22222222-2222-4222-8222-222222222222';

const as = async (role: string, sql: string) => {
  await pg.exec(`SET ROLE ${role}`);
  try {
    return await pg.query(sql);
  } finally {
    await pg.exec('RESET ROLE');
  }
};
const DENIED = /permission denied/;
const CHECK = /check constraint/;
const claim = (event: string, kind = 'allowance_expiring', severity = 'warn', user = uid) =>
  `INSERT INTO alert_outbox (user_id, event_id, kind, severity) VALUES ('${user}', '${event}', '${kind}', '${severity}')`;

describe('0011 alert outbox and preferences on PGlite', () => {
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
    if (!s0008.includes(NEON_LINE)) throw new Error('0008 neon_superuser guard line not found');
    await pg.exec(s0008.replace(NEON_LINE, ''));
    await pg.exec(s0009);
    await pg.exec(s0011);
    await pg.exec(
      `INSERT INTO users (id, email) VALUES ('${uid}', 'a@example.test'), ('${uid2}', 'b@example.test')`,
    );
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });

  describe('alert_outbox as eg_api', () => {
    it('claims a row: pending, 0 attempts, by default', async () => {
      await as('eg_api', claim('evt-1'));
      const { rows } = await as(
        'eg_api',
        `SELECT status, attempts, last_attempt_at, sent_at, resend_email_id FROM alert_outbox WHERE event_id = 'evt-1'`,
      );
      expect(rows).toEqual([
        {
          status: 'pending',
          attempts: 0,
          last_attempt_at: null,
          sent_at: null,
          resend_email_id: null,
        },
      ]);
    });
    it('dedupes on (user_id, event_id): ON CONFLICT DO NOTHING keeps one row; a plain INSERT fails', async () => {
      await as('eg_api', `${claim('evt-1')} ON CONFLICT (user_id, event_id) DO NOTHING`);
      await expect(as('eg_api', claim('evt-1'))).rejects.toThrow(/unique|duplicate/);
      const { rows } = await pg.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM alert_outbox WHERE event_id = 'evt-1'`,
      );
      expect(rows[0]!.n).toBe(1);
    });
    it('the same event_id for another user is a separate row', async () => {
      await as('eg_api', claim('evt-1', 'allowance_expiring', 'warn', uid2));
    });
    it('beginAttempt / markSent / markFailed updates are allowed', async () => {
      await as(
        'eg_api',
        `UPDATE alert_outbox SET attempts = attempts + 1, last_attempt_at = now() WHERE user_id = '${uid}' AND event_id = 'evt-1'`,
      );
      await as(
        'eg_api',
        `UPDATE alert_outbox SET status = 'sent', resend_email_id = 're_1', sent_at = now() WHERE user_id = '${uid}' AND event_id = 'evt-1'`,
      );
      await as(
        'eg_api',
        `UPDATE alert_outbox SET status = 'failed' WHERE user_id = '${uid2}' AND event_id = 'evt-1'`,
      );
    });
    it.each([
      [
        'id',
        `INSERT INTO alert_outbox (id, user_id, event_id, kind, severity) VALUES (999, '00000000-0000-0000-0000-000000000000', 'x', 'testnet_reset', 'info')`,
      ],
      [
        'status on insert',
        `INSERT INTO alert_outbox (user_id, event_id, kind, severity, status) VALUES ('00000000-0000-0000-0000-000000000000', 'x', 'testnet_reset', 'info', 'sent')`,
      ],
      [
        'created_at on insert',
        `INSERT INTO alert_outbox (user_id, event_id, kind, severity, created_at) VALUES ('00000000-0000-0000-0000-000000000000', 'x', 'testnet_reset', 'info', now())`,
      ],
      ['update user_id', `UPDATE alert_outbox SET user_id = user_id`],
      ['update event_id', `UPDATE alert_outbox SET event_id = event_id`],
      ['update kind', `UPDATE alert_outbox SET kind = kind`],
      ['update severity', `UPDATE alert_outbox SET severity = severity`],
      ['update created_at', `UPDATE alert_outbox SET created_at = now()`],
      ['delete', 'DELETE FROM alert_outbox'],
      ['truncate', 'TRUNCATE alert_outbox'],
    ])('refuses %s', async (_n, sql) => {
      await expect(as('eg_api', sql)).rejects.toThrow(
        /permission denied|cannot insert a non-DEFAULT/,
      );
    });
  });

  describe('alert_outbox CHECKs', () => {
    it.each([
      ['unknown kind', claim('c1', 'nope')],
      ['unknown severity', claim('c2', 'testnet_reset', 'warning')],
      ['empty event_id', claim('')],
      ['event_id with @', claim('a@b')],
      ['event_id with space', claim('a b')],
      ['event_id > 200', claim('x'.repeat(201))],
    ])('refuses %s', async (_n, sql) => {
      await expect(as('eg_api', sql)).rejects.toThrow(CHECK);
    });
    it('accepts a 200-char event_id and every listed kind / severity', async () => {
      await as('eg_api', claim('y'.repeat(200)));
      for (const k of [
        'preflight_failed',
        'allowance_missing',
        'allowance_expiring',
        'extend_failed_refund',
        'refund_delayed',
        'unexplained_charge',
        'testnet_reset',
        'restore_lost_changes',
        'approaching_critical',
        'extend_succeeded',
      ])
        await as('eg_api', claim(`k-${k}`, k, 'critical'));
      await as('eg_api', claim('s-info', 'testnet_reset', 'info'));
    });
    it.each([
      ['unknown status', `UPDATE alert_outbox SET status = 'queued' WHERE event_id = 's-info'`],
      ['attempts < 0', `UPDATE alert_outbox SET attempts = -1 WHERE event_id = 's-info'`],
      ['attempts > 10', `UPDATE alert_outbox SET attempts = 11 WHERE event_id = 's-info'`],
    ])('refuses %s', async (_n, sql) => {
      await expect(as('eg_api', sql)).rejects.toThrow(CHECK);
    });
    it('user_id must reference users', async () => {
      await expect(
        as('eg_api', claim('fk', 'testnet_reset', 'info', '00000000-0000-0000-0000-000000000000')),
      ).rejects.toThrow(/foreign key/);
    });
  });

  describe('indexes', () => {
    it('has the 24h send-window and retry indexes with their predicates', async () => {
      const { rows } = await pg.query<{ indexname: string; indexdef: string }>(
        "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'alert_outbox' ORDER BY indexname",
      );
      const def = (n: string) => rows.find((r) => r.indexname === n)?.indexdef ?? '';
      expect(def('alert_outbox_sent_window_idx')).toMatch(
        /\(user_id, sent_at\) WHERE \(status = 'sent'::text\)/,
      );
      expect(def('alert_outbox_retry_idx')).toMatch(
        /\(last_attempt_at\) WHERE \(status = ANY \(ARRAY\['pending'::text, 'failed'::text\]\)\)/,
      );
    });
  });

  describe('alert_preferences as eg_api', () => {
    it('missing row = default: no rows for a fresh user', async () => {
      const { rows } = await as(
        'eg_api',
        `SELECT * FROM alert_preferences WHERE user_id = '${uid2}'`,
      );
      expect(rows).toEqual([]);
    });
    it('opts out, then back in (upsert)', async () => {
      await as(
        'eg_api',
        `INSERT INTO alert_preferences (user_id, kind, enabled) VALUES ('${uid}', 'extend_succeeded', false)`,
      );
      await as(
        'eg_api',
        `INSERT INTO alert_preferences (user_id, kind, enabled) VALUES ('${uid}', 'extend_succeeded', true)
         ON CONFLICT (user_id, kind) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
      );
      const { rows } = await as(
        'eg_api',
        `SELECT enabled FROM alert_preferences WHERE user_id = '${uid}'`,
      );
      expect(rows).toEqual([{ enabled: true }]);
    });
    it('one row per (user, kind)', async () => {
      await expect(
        as(
          'eg_api',
          `INSERT INTO alert_preferences (user_id, kind, enabled) VALUES ('${uid}', 'extend_succeeded', false)`,
        ),
      ).rejects.toThrow(/unique|duplicate/);
    });
    it.each(['preflight_failed', 'testnet_reset', 'nope'])(
      'refuses required/unknown kind %s',
      async (k) => {
        await expect(
          as(
            'eg_api',
            `INSERT INTO alert_preferences (user_id, kind, enabled) VALUES ('${uid}', '${k}', false)`,
          ),
        ).rejects.toThrow(CHECK);
      },
    );
    it('enabled cannot be NULL', async () => {
      await expect(
        as(
          'eg_api',
          `INSERT INTO alert_preferences (user_id, kind, enabled) VALUES ('${uid}', 'allowance_expiring', NULL)`,
        ),
      ).rejects.toThrow(/null value/);
    });
    it.each([
      ['update user_id', 'UPDATE alert_preferences SET user_id = user_id'],
      ['update kind', 'UPDATE alert_preferences SET kind = kind'],
      ['delete', 'DELETE FROM alert_preferences'],
      ['truncate', 'TRUNCATE alert_preferences'],
    ])('refuses %s', async (_n, sql) => {
      await expect(as('eg_api', sql)).rejects.toThrow(DENIED);
    });
  });

  describe('eg_scheduler gets nothing', () => {
    it.each([
      'SELECT * FROM alert_outbox',
      claim('sch'),
      `UPDATE alert_outbox SET status = 'sent'`,
      'DELETE FROM alert_outbox',
      'SELECT * FROM alert_preferences',
      `INSERT INTO alert_preferences (user_id, kind, enabled) VALUES ('00000000-0000-0000-0000-000000000000', 'extend_succeeded', false)`,
      'UPDATE alert_preferences SET enabled = true',
      'SELECT email FROM users',
    ])('refuses %s', async (sql) => {
      await expect(as('eg_scheduler', sql)).rejects.toThrow(DENIED);
    });
  });

  it('is idempotent: applying 0011 again keeps rows, constraints and grants', async () => {
    const n = async (t: string) =>
      (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`)).rows[0]!.n;
    const before = [await n('alert_outbox'), await n('alert_preferences')];
    await pg.exec(s0011);
    expect([await n('alert_outbox'), await n('alert_preferences')]).toEqual(before);
    await expect(as('eg_api', claim('evt-1'))).rejects.toThrow(/unique|duplicate/);
    await as('eg_api', claim('after-rerun'));
    await expect(as('eg_api', 'DELETE FROM alert_outbox')).rejects.toThrow(DENIED);
    await expect(as('eg_scheduler', 'SELECT * FROM alert_outbox')).rejects.toThrow(DENIED);
  });

  it('after a 0008 re-run the grants are gone until 0011 is re-run', async () => {
    await pg.exec(s0008.replace(NEON_LINE, ''));
    await expect(as('eg_api', 'SELECT * FROM alert_outbox')).rejects.toThrow(DENIED);
    await pg.exec(s0011);
    await as('eg_api', 'SELECT * FROM alert_outbox');
  });
});
