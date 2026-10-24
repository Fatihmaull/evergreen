-- 0003: auth store tables for apps/api/src/auth/pg-store.ts (#400). Shape from #407. PH2-E2-04.
-- Apply after 0002: psql "$DATABASE_URL" --single-transaction -f apps/api/db/0003_auth_rate_counters_wallet_challenges.sql
-- Idempotent: re-running leaves existing tables and rows alone.

-- Fixed-window send limits. Keys embed the window start, so old rows can be pruned.
-- Increment: INSERT ... ON CONFLICT (key) DO UPDATE SET count = auth_rate_counters.count + 1
CREATE TABLE IF NOT EXISTS auth_rate_counters (
  key   text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0
);

-- One-time SEP-10 challenges, consumed with DELETE ... RETURNING. Gone with their session.
CREATE TABLE IF NOT EXISTS wallet_challenges (
  id           text PRIMARY KEY,
  session_hash bytea NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL
);
