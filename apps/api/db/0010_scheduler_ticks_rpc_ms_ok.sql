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
-- Grants: eg_scheduler stays INSERT-only (K1, #385), still no SELECT. Its column-level INSERT
-- becomes exactly (observed_ledger, rpc_ms, ok): INSERT on ticked_at is REVOKEd, so the
-- scheduler cannot write its own heartbeat time; ticked_at always takes its DEFAULT now()
-- (Postgres needs no privilege on a column an INSERT leaves to its default). eg_api's
-- table-level SELECT from 0009 covers the new columns without a new grant.
--
-- Apply AFTER 0009. SECURITY STEP: 0008 still contains GRANT INSERT (ticked_at, ...), so
-- re-running 0008 alone re-opens the heartbeat-forging path. After ANY 0008 re-run, re-run
-- 0009 and then 0010 immediately.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0010_scheduler_ticks_rpc_ms_ok.sql
--
-- ok / observed_ledger: CHECK scheduler_ticks_ok_has_ledger (NOT ok OR observed_ledger IS NOT
-- NULL) refuses a "successful" row that measured no ledger (e.g. INSERT (rpc_ms) alone, which
-- would default ok = true), so a WHERE ok heartbeat read never counts it and never hands
-- tickGapsLedgers a NULL. Rows before 0010 all have a ledger (0005 NOT NULL), so it validates.
-- A failed tick (ok = false) may have a NULL ledger. It SHOULD fill rpc_ms when the RPC time
-- was measured (an RPC timeout is the case F9 most wants); NULL only when nothing was
-- measured. That is the writer's job (CEF's runTick), not enforced here.
--
-- Idempotent: columns are added IF NOT EXISTS, the constraint is dropped and re-added under
-- a fixed name, REVOKE/GRANT can be re-run.

ALTER TABLE scheduler_ticks ADD COLUMN IF NOT EXISTS rpc_ms integer NULL CHECK (rpc_ms >= 0);
ALTER TABLE scheduler_ticks ADD COLUMN IF NOT EXISTS ok boolean NOT NULL DEFAULT true;

ALTER TABLE scheduler_ticks ALTER COLUMN observed_ledger DROP NOT NULL;
ALTER TABLE scheduler_ticks DROP CONSTRAINT IF EXISTS scheduler_ticks_observed_ledger_check;  -- 0005's inline CHECK
ALTER TABLE scheduler_ticks DROP CONSTRAINT IF EXISTS scheduler_ticks_observed_ledger_positive;
ALTER TABLE scheduler_ticks ADD CONSTRAINT scheduler_ticks_observed_ledger_positive
  CHECK (observed_ledger IS NULL OR observed_ledger > 0);

REVOKE INSERT (ticked_at) ON scheduler_ticks FROM eg_scheduler;
GRANT  INSERT (observed_ledger, rpc_ms, ok) ON scheduler_ticks TO eg_scheduler;

ALTER TABLE scheduler_ticks DROP CONSTRAINT IF EXISTS scheduler_ticks_ok_has_ledger;
ALTER TABLE scheduler_ticks ADD CONSTRAINT scheduler_ticks_ok_has_ledger
  CHECK (NOT ok OR observed_ledger IS NOT NULL);
