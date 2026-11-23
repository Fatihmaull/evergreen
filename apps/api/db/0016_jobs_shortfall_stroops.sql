-- 0016_jobs_shortfall_stroops.sql  (PH2-E4-02)
--
-- Where a K15 shortfall is stored: charged rent + final fee − pull, when that
-- is positive. NULL until reconcile. 0 means reconciled with no shortfall, so
-- an open job is neither clean nor a violation. DoD-2 counts rows with
-- shortfall_stroops > 0. fee_ledger.amount is never negative, so a difference
-- row cannot hold this, and jobs.reconcile is not the only copy.
--
-- Numbered 0016 because 0015 (alert ledger facts, #621) takes the previous
-- number. This file does not read 0015's tables. Apply after 0014 (and after
-- 0015 once that file is on the branch, so the ledger stays in order). Apply
-- after 0008 and 0013: eg_scheduler must exist, and the ledger INSERT below
-- fails closed if schema_migrations is missing.
--
-- Re-running 0008 REVOKEs every grant and does not know this column. Re-run
-- this file after any 0008 re-run. No grant on users, and none on users.email.
-- eg_scheduler still cannot write alert_outbox (0011).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0016_jobs_shortfall_stroops.sql
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, the CHECK is dropped and re-added, the
-- index is created if missing, GRANT re-runs, and the ledger INSERT upserts.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shortfall_stroops stroops;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_shortfall_stroops_nonneg;
ALTER TABLE jobs
  ADD CONSTRAINT jobs_shortfall_stroops_nonneg CHECK (shortfall_stroops >= 0);

CREATE INDEX IF NOT EXISTS jobs_shortfall_pos_idx
  ON jobs (shortfall_stroops)
  WHERE shortfall_stroops > 0;

COMMENT ON COLUMN jobs.shortfall_stroops IS
  'K15 shortfall (charged rent + final fee - pull) when positive. NULL until reconcile; 0 = reconciled, no shortfall. DoD-2 counts shortfall_stroops > 0. Not a fee_ledger amount.';

-- Column grant. reconcile and updated_at stay as 0008 granted them.
GRANT UPDATE (shortfall_stroops) ON jobs TO eg_scheduler;

-- Ledger line (PH2-E2-07). Same statement as 0013, this file's name.
INSERT INTO schema_migrations (filename, source)
VALUES ('0016_jobs_shortfall_stroops.sql', 'applied')
ON CONFLICT (filename) DO UPDATE
  SET last_applied_at = now(),
      apply_count     = schema_migrations.apply_count + 1;
