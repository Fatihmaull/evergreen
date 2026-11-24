-- 0018_api_extend_now.sql  (PH2-E2-08, "Extend now", Fatih 2026-11-24 option A)
--
-- POST /jobs queues one extend-now job: the API Worker writes the row, the
-- hosted engine runs it through the autopilot money path. Two changes:
--
-- 1. eg_api may INSERT a job, on exactly the columns the route writes. 0008's
--    UNDETERMINED line named these. kind 'extend-now' needs idempotency_key
--    (jobs CHECK); autopilot_window stays NULL. Every other column keeps its
--    default (status 'queued', created_at, attempts) or is the engine's to set.
--    No UPDATE or DELETE beyond 0008's cancel grant.
-- 2. alert_outbox accepts the new required kind 'extend_now_requested' (the
--    email on every use, API §7). 0011 says a new kind replaces the CHECK.
--
-- Production keeps EXTEND_NOW_ENABLED off until DoD-2, so on production this
-- grant is unused until then.
--
-- Apply after 0008, 0011 and 0013. Re-run after any 0008 re-run.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0018_api_extend_now.sql
--
-- Idempotent: GRANT re-runs, the named CHECK is dropped and re-added, the
-- ledger INSERT upserts.

GRANT INSERT (user_id, network, contract_id, kind, payer_account, idempotency_key, request_hash)
  ON jobs TO eg_api;

ALTER TABLE alert_outbox DROP CONSTRAINT IF EXISTS alert_outbox_kind_check;
ALTER TABLE alert_outbox ADD CONSTRAINT alert_outbox_kind_check
  CHECK (kind IN ('preflight_failed', 'allowance_missing', 'allowance_expiring',
                  'extend_failed_refund', 'refund_delayed', 'unexplained_charge',
                  'testnet_reset', 'restore_lost_changes', 'approaching_critical',
                  'extend_succeeded', 'extend_now_requested'));

INSERT INTO schema_migrations (filename, source)
VALUES ('0018_api_extend_now.sql', 'applied')
ON CONFLICT (filename) DO UPDATE
  SET last_applied_at = now(),
      apply_count     = schema_migrations.apply_count + 1;
