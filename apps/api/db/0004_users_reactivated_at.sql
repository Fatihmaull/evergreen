-- 0004: users.reactivated_at, set when a deactivated account is reactivated by email. PH2-E2-04.
-- Decision: #385 option 2 (Rakha). A wallet counts as linked for autopilot only if it was linked after the
-- last reactivation (wallets.linked_at > users.reactivated_at); the planner join reads this column.
-- Apply after 0003: psql "$DATABASE_URL" --single-transaction -f apps/api/db/0004_users_reactivated_at.sql
-- Idempotent: re-running leaves the column and its values alone. Existing rows get NULL.

ALTER TABLE users ADD COLUMN IF NOT EXISTS reactivated_at timestamptz NULL;

COMMENT ON COLUMN users.reactivated_at IS
  'Last reactivation of a deactivated account. NULL = never reactivated. Wallets linked at or before it do not count as linked for autopilot (#385 option 2).';
