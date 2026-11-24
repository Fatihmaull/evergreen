-- 0017_api_fee_ledger_select.sql  (PH2-E2-08)
--
-- The API Worker reads the fee ledger for GET /ledger and for each job's refund
-- time on GET /jobs (docs/API.md §7). 0008 left this UNDETERMINED ("SELECT on
-- fee_ledger / fee_ledger_job_balance for a job-history route (none yet)");
-- that route now exists. SELECT only: fee_ledger stays append-only, and eg_api
-- gets no INSERT, UPDATE, DELETE or TRUNCATE on it. The balance view is read
-- so a job can show whether its rows close.
--
-- Apply after 0008 (eg_api must exist) and 0013 (the ledger INSERT below fails
-- closed if schema_migrations is missing). Re-running 0008 REVOKEs every grant
-- and does not know this one: re-run this file after any 0008 re-run.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0017_api_fee_ledger_select.sql
--
-- Idempotent: GRANT re-runs, and the ledger INSERT upserts.

GRANT SELECT ON fee_ledger TO eg_api;
GRANT SELECT ON fee_ledger_job_balance TO eg_api;

-- Ledger line (PH2-E2-07). Same statement as 0013, this file's name.
INSERT INTO schema_migrations (filename, source)
VALUES ('0017_api_fee_ledger_select.sql', 'applied')
ON CONFLICT (filename) DO UPDATE
  SET last_applied_at = now(),
      apply_count     = schema_migrations.apply_count + 1;
