-- 0019_scheduler_observations_insert.sql  (PH2-E4-04, engine observations)
--
-- The scheduler appends one `observations` row per watched testnet contract on
-- each tick (apps/scheduler/src/observe.ts), which the API serves as
-- lastObservation. 0008 left this UNDETERMINED ("#461 §4 implies ticks write
-- observations, but no code does yet"); the code now does, so the dashboard
-- stops reading every contract as "Not checked by the engine yet".
--
-- INSERT only, column-level: id is left to its sequence. No SELECT, UPDATE or
-- DELETE: the history stays append-only and the scheduler never reads it back.
-- The watch_items columns it reads (contract_id, scope, network, removed_at)
-- are already granted by 0008.
--
-- Apply after 0008 (eg_scheduler must exist) and 0013 (the ledger INSERT below
-- fails closed if schema_migrations is missing). Re-running 0008 REVOKEs every
-- grant and does not know this one: re-run this file after any 0008 re-run.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0019_scheduler_observations_insert.sql
--
-- Idempotent: GRANT re-runs, and the ledger INSERT upserts.

GRANT INSERT (network, contract_id, observed_at_ledger, observed_at, scan, health) ON observations TO eg_scheduler;
GRANT USAGE ON SEQUENCE observations_id_seq TO eg_scheduler;  -- bigserial nextval; USAGE only

-- Ledger line (PH2-E2-07). Same statement as 0013, this file's name.
INSERT INTO schema_migrations (filename, source)
VALUES ('0019_scheduler_observations_insert.sql', 'applied')
ON CONFLICT (filename) DO UPDATE
  SET last_applied_at = now(),
      apply_count     = schema_migrations.apply_count + 1;
