-- 0009_connect_and_scheduler_ticks_select.sql  (#385, #533)
--
-- Two grants 0008 left out:
--   1. CONNECT on the current database for eg_api and eg_scheduler, so a fresh database
--      matches the repo without the manual per-branch step noted in 0008
--      (#385 comment 6500253802). The database name differs per branch, so the grant is
--      built from current_database().
--   2. SELECT on scheduler_ticks for eg_api: the F11 heartbeat alert (#517) reads the newest
--      tick from the API Worker (#385 comment 6500764140, #533).
--
-- eg_scheduler is unchanged on scheduler_ticks: INSERT (ticked_at, observed_ledger) only,
-- no SELECT (K1, #385).
--
-- Apply AFTER 0008 (0008 starts with REVOKE ALL on every table for both roles, so re-running
-- 0008 alone drops the scheduler_ticks SELECT; re-run 0009 after it).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0009_connect_and_scheduler_ticks_select.sql
--
-- Idempotent: GRANT can be re-run. On Neon preview CONNECT was already granted by hand,
-- so step 1 is a no-op there.

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO eg_api, eg_scheduler', current_database());
END $$;

GRANT SELECT ON scheduler_ticks TO eg_api;   -- F11 heartbeat alert (#517)
