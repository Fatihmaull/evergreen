-- 0014_prune_auth_tables.sql  (#421)
--
-- 1. Index on wallet_challenges.session_hash: the FK child side of the ON DELETE CASCADE
--    from sessions, so a session delete no longer scans wallet_challenges.
-- 2. public.prune_auth_tables(retention interval DEFAULT '1 day'): hard-deletes
--      - wallet_challenges whose expires_at has passed (expires_at < now()), and
--      - auth_rate_counters whose windowStart (the last ':' segment of key, epoch seconds,
--        see apps/api/src/auth/rate-limit.ts) is more than `retention` old
--        (to_timestamp(windowStart) < now() - retention).
--    Keys whose last segment is missing or not 1-12 digits (13+ digits would overflow to_timestamp) are skipped (kept), so one
--    malformed key never errors the whole prune. A NULL or negative retention is refused.
--    Returns one row (challenges_deleted, counters_deleted).
--
-- SECURITY DEFINER, owned by the role that runs this file (the database owner, as for
-- every migration), with search_path pinned to pg_catalog, public and schema-qualified
-- table names. EXECUTE is revoked from PUBLIC and granted to eg_scheduler only.
-- eg_scheduler gets NO table grants on auth tables (0008: the scheduler never reads
-- sessions or auth state); the function is its only way in. eg_api is unchanged.
--
-- The call from the scheduler tick is a follow-up (not in this file).
--
-- Apply after 0008 (needs eg_scheduler). Re-running 0008 does not touch function grants.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0014_prune_auth_tables.sql
--
-- Idempotent: CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION, REVOKE/GRANT re-run.

CREATE INDEX IF NOT EXISTS wallet_challenges_session_hash_idx ON wallet_challenges (session_hash);

CREATE OR REPLACE FUNCTION public.prune_auth_tables(retention interval DEFAULT interval '1 day')
RETURNS TABLE (challenges_deleted bigint, counters_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF retention IS NULL OR retention < interval '0' THEN
    RAISE EXCEPTION 'prune_auth_tables: retention must be a non-negative interval, got %', retention
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.wallet_challenges WHERE expires_at < now();
  GET DIAGNOSTICS challenges_deleted = ROW_COUNT;

  DELETE FROM public.auth_rate_counters c
  -- A malformed key gives substring() NULL, so the comparison is NULL and the row is kept.
  WHERE to_timestamp(substring(c.key FROM ':([0-9]{1,12})$')::bigint) < now() - retention;
  GET DIAGNOSTICS counters_deleted = ROW_COUNT;

  RETURN NEXT;
END
$fn$;

REVOKE ALL ON FUNCTION public.prune_auth_tables(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_auth_tables(interval) TO eg_scheduler;
