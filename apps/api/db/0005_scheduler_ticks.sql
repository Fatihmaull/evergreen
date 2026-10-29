-- 0005: scheduler heartbeat for the PH2-E4-04 scheduler gap (design: docs/PH2-E4-04-SCHEDULER-DESIGN.md, #461 §4).
-- One row per cron tick that reached its heartbeat: when it ran and the latest ledger it read from RPC.
-- The gap DoD-2 needs is measured in ledgers between consecutive ticks' observed_ledger.
-- Apply after 0004: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0005_scheduler_ticks.sql
-- Idempotent: re-running leaves the table and its rows alone.

CREATE TABLE IF NOT EXISTS scheduler_ticks (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticked_at       timestamptz NOT NULL DEFAULT now(),
  observed_ledger bigint NOT NULL CHECK (observed_ledger > 0)
);

-- The gap query reads ticks in time order over a window.
CREATE INDEX IF NOT EXISTS scheduler_ticks_ticked_at_idx ON scheduler_ticks (ticked_at);
