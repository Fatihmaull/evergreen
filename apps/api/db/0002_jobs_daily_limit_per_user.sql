-- 0002: daily extend-now limit is per (user, network, contract). Decision D1 in NOTES.md.
-- Apply after schema.sql (0001): psql "$DATABASE_URL" --single-transaction -f apps/api/db/0002_jobs_daily_limit_per_user.sql
-- Replaces the cross-user index from schema.sql. Same partial predicate: only extend-now jobs that pulled count.

DROP INDEX IF EXISTS jobs_daily_limit_idx;

CREATE INDEX jobs_daily_limit_idx ON jobs (user_id, network, contract_id, pulled_at)
  WHERE kind = 'extend-now' AND pull_tx_hash IS NOT NULL;

-- usedToday: SELECT count(*) FROM jobs WHERE kind = 'extend-now' AND pull_tx_hash IS NOT NULL
--   AND user_id = $1 AND network = $2 AND contract_id = $3 AND pulled_at > now() - interval '24 hours';
