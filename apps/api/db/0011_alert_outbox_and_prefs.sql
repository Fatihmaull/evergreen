-- 0011_alert_outbox_and_prefs.sql  (PH2-E2-06; #385 comment 6491578972, design docs/PH2-E2-06-ALERTS-DESIGN.md §5–§7)
--
-- Backs the AlertOutboxStore interface in apps/api/src/alerts/dispatch.ts (#555), Option B:
--   alert_outbox       one row per (user, event): written pending before the send ("intent
--                      before effect"), then sent or failed. UNIQUE (user_id, event_id) is the
--                      dedupe. A work queue, not a ledger: status columns are updated in place.
--   alert_preferences  sparse opt-outs for OPTIONAL kinds only. A missing row means the
--                      default (ALERT_SPECS.defaultOn in apps/api/src/alerts/policy.ts).
--                      Required kinds are never stored.
--
-- Value sets:
--   kind      = AlertKind in apps/api/src/alerts/policy.ts (10 kinds; 3 optional).
--   severity  = AlertNotification['severity'] in apps/api/src/alerts/sender.ts ('info','warn','critical').
--   status    = pending | sent | failed (design §5).
--   event_id  = the rules of eventIdProblem in apps/api/src/alerts/plan.ts (1..200 chars,
--               no whitespace, no '@').
-- A new kind needs a new migration that replaces the CHECK.
--
-- Grants: the sender is eg_api (API cron). SELECT plus column-level INSERT/UPDATE on both
-- tables, no DELETE/TRUNCATE. eg_scheduler gets nothing here, and in particular no
-- SELECT on users.email. No pruning policy: rows are kept.
--
-- Apply AFTER 0010. Re-run after any 0008 re-run (0008 starts with REVOKE ALL, which drops
-- these grants).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0011_alert_outbox_and_prefs.sql
--
-- Idempotent: CREATE ... IF NOT EXISTS, GRANT can be re-run.

CREATE TABLE IF NOT EXISTS alert_outbox (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users(id),
  event_id         text NOT NULL CONSTRAINT alert_outbox_event_id_check
                     CHECK (length(event_id) BETWEEN 1 AND 200 AND event_id !~ '[[:space:]@]'),
  kind             text NOT NULL CONSTRAINT alert_outbox_kind_check
                     CHECK (kind IN ('preflight_failed', 'allowance_missing', 'allowance_expiring',
                                     'extend_failed_refund', 'refund_delayed', 'unexplained_charge',
                                     'testnet_reset', 'restore_lost_changes', 'approaching_critical',
                                     'extend_succeeded')),
  severity         text NOT NULL CONSTRAINT alert_outbox_severity_check
                     CHECK (severity IN ('info', 'warn', 'critical')),
  status           text NOT NULL DEFAULT 'pending' CONSTRAINT alert_outbox_status_check
                     CHECK (status IN ('pending', 'sent', 'failed')),
  attempts         smallint NOT NULL DEFAULT 0 CONSTRAINT alert_outbox_attempts_check
                     CHECK (attempts BETWEEN 0 AND 10),
  resend_email_id  text,                       -- Resend's id once accepted ("accepted" never means received)
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_attempt_at  timestamptz NULL,           -- retry backoff basis (dispatch.ts lastAttemptAt)
  sent_at          timestamptz,
  CONSTRAINT alert_outbox_user_event_uq UNIQUE (user_id, event_id)
);

-- sentInWindow: count of a user's sent alerts in the last 24 h (optional-kind filter applied in the query).
CREATE INDEX IF NOT EXISTS alert_outbox_sent_window_idx ON alert_outbox (user_id, sent_at) WHERE status = 'sent';
-- Retry sweep: rows not yet sent, oldest attempt first.
CREATE INDEX IF NOT EXISTS alert_outbox_retry_idx ON alert_outbox (last_attempt_at) WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS alert_preferences (
  user_id    uuid NOT NULL REFERENCES users(id),
  kind       text NOT NULL CONSTRAINT alert_preferences_kind_check
               CHECK (kind IN ('allowance_expiring', 'approaching_critical', 'extend_succeeded')),
  enabled    boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

-- ---------------------------------------------------------------- eg_api (sender)
-- Identity column: no sequence grant is needed for GENERATED ALWAYS.
GRANT SELECT ON alert_outbox TO eg_api;   -- claim's ON CONFLICT + SELECT, sentInWindow
GRANT INSERT (user_id, event_id, kind, severity) ON alert_outbox TO eg_api;   -- status/attempts/created_at by default
GRANT UPDATE (status, attempts, resend_email_id, last_attempt_at, sent_at) ON alert_outbox TO eg_api;

GRANT SELECT ON alert_preferences TO eg_api;
GRANT INSERT (user_id, kind, enabled, updated_at) ON alert_preferences TO eg_api;
GRANT UPDATE (enabled, updated_at) ON alert_preferences TO eg_api;
-- No DELETE: "reset to default" is an UPDATE to the default value, not a row delete.

-- eg_scheduler: nothing. It never reads the outbox, the preferences or users.email.
