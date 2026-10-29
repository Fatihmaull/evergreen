-- 0006: submitted-but-unconfirmed transaction hash and its envelope expiry per money step on jobs. PH2-E4-02.
-- Design: docs/PH2-E4-04-SCHEDULER-DESIGN.md §5 (#461), "intent before effect": the signed envelope's hash
-- is persisted before it is sent, so a worker killed after the send can ask getTransaction instead of
-- building a second envelope. Rakha chose one column per step (pull, extend, refund), 2026-10-28.
-- pull_tx_hash / extend_tx_hash / refund_tx_hash keep meaning CONFIRMED; the CHECK
-- ((pull_tx_hash IS NULL) = (pulled_at IS NULL)) from schema.sql is unchanged.
-- Apply after 0005 (independent of it): psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0006_jobs_submitted_hashes.sql
-- Idempotent: re-running leaves the columns and their values alone. Existing rows get NULL.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pull_submitted_hash   text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS extend_submitted_hash text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS refund_submitted_hash text;

-- Expiry of each submitted envelope (its time bound), so a worker can tell whether an unconfirmed hash can
-- still land before building a replacement. Rakha, 2026-10-29. No constraint links hash and expiry.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pull_submitted_expires_at   timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS extend_submitted_expires_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS refund_submitted_expires_at timestamptz;

COMMENT ON COLUMN jobs.pull_submitted_hash IS
  'Hash of the signed pull envelope, written before it is sent. NULL = not submitted. Confirmed hash is pull_tx_hash.';
COMMENT ON COLUMN jobs.extend_submitted_hash IS
  'Hash of the signed extend envelope, written before it is sent. NULL = not submitted. Confirmed hash is extend_tx_hash.';
COMMENT ON COLUMN jobs.refund_submitted_hash IS
  'Hash of the signed refund envelope, written before it is sent. NULL = not submitted. Confirmed hash is refund_tx_hash.';
COMMENT ON COLUMN jobs.pull_submitted_expires_at IS
  'Expiry of the submitted pull envelope whose hash is in pull_submitted_hash. NULL = not submitted or unknown.';
COMMENT ON COLUMN jobs.extend_submitted_expires_at IS
  'Expiry of the submitted extend envelope whose hash is in extend_submitted_hash. NULL = not submitted or unknown.';
COMMENT ON COLUMN jobs.refund_submitted_expires_at IS
  'Expiry of the submitted refund envelope whose hash is in refund_submitted_hash. NULL = not submitted or unknown.';
