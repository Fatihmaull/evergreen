-- 0010_scheduler_ticks_rpc_ms_ok.sql  (#533 comment 6540103228, F9 in docs/PH2-E4-05-FAILURE-MODES.md)
--
-- scheduler_ticks gains what the F9 slow/failed-tick alert needs, so a failed tick can
-- write a row too:
--   rpc_ms           integer NULL: RPC round-trip of the tick in ms (NULL = not measured).
--   ok               boolean NOT NULL DEFAULT true: false for a failed tick. Rows from
--                    before 0010 were all successful ticks (a failed tick wrote no row), so
--                    the default is true for them and for today's INSERT, which names
--                    observed_ledger only.
--   observed_ledger  becomes nullable: a failed tick may have read no ledger. The 0005
--                    CHECK (observed_ledger > 0) is replaced by
--                    CHECK (observed_ledger IS NULL OR observed_ledger > 0).
--                    (In SQL a CHECK on NULL already passes; the explicit form documents it.)
--
-- Grants: eg_scheduler stays INSERT-only (K1, #385): its column-level INSERT is extended to
-- rpc_ms and ok, still no SELECT. eg_api's table-level SELECT from 0009 covers the new
-- columns without a new grant.
--
-- Apply AFTER 0009. Re-run after any 0008 re-run (0008 starts with REVOKE ALL, which drops
-- the column-level INSERT on rpc_ms/ok; re-run 0009 and then 0010).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0010_scheduler_ticks_rpc_ms_ok.sql
--
-- Idempotent: columns are added IF NOT EXISTS, the constraint is dropped and re-added under
-- a fixed name, GRANT can be re-run.

ALTER TABLE scheduler_ticks ADD COLUMN IF NOT EXISTS rpc_ms integer NULL CHECK (rpc_ms >= 0);
ALTER TABLE scheduler_ticks ADD COLUMN IF NOT EXISTS ok boolean NOT NULL DEFAULT true;

ALTER TABLE scheduler_ticks ALTER COLUMN observed_ledger DROP NOT NULL;
ALTER TABLE scheduler_ticks DROP CONSTRAINT IF EXISTS scheduler_ticks_observed_ledger_check;  -- 0005's inline CHECK
ALTER TABLE scheduler_ticks DROP CONSTRAINT IF EXISTS scheduler_ticks_observed_ledger_positive;
ALTER TABLE scheduler_ticks ADD CONSTRAINT scheduler_ticks_observed_ledger_positive
  CHECK (observed_ledger IS NULL OR observed_ledger > 0);

GRANT INSERT (ticked_at, observed_ledger, rpc_ms, ok) ON scheduler_ticks TO eg_scheduler;
