-- 0012_jobs_autopilot_uq_per_user.sql  (PH2-E4-02, E4-02 default 2 accepted by Rakha 2026-11-01)
--
-- Widens the autopilot dedupe key to one live autopilot job per USER per contract per window.
-- schema.sql created jobs_autopilot_uq ON jobs (network, contract_id, autopilot_window)
-- WHERE kind = 'autopilot', which is cross-user: two users watching the same contract would
-- collide in the same window, and the second user's autopilot job would be refused.
-- New key: (user_id, network, contract_id, autopilot_window), same partial predicate. Same
-- index name, so the docs that cite jobs_autopilot_uq stay correct.
--
-- No code uses ON CONFLICT on this index (checked at the time of writing).
--
-- Apply after 0009, numbered after 0010 and 0011. No grants change (an index needs none).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0012_jobs_autopilot_uq_per_user.sql
--
-- Idempotent: re-running drops and recreates the same widened index. Widening a unique key
-- cannot fail on existing rows (any set unique on the old key is unique on the new one).
-- One transaction comes from --single-transaction (no BEGIN/COMMIT in the file, as in 0002-0009),
-- so there is never a moment with no autopilot unique index.

DROP INDEX IF EXISTS jobs_autopilot_uq;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_autopilot_uq
  ON jobs (user_id, network, contract_id, autopilot_window)
  WHERE kind = 'autopilot';
