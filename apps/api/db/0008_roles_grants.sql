-- 0008_roles_grants.sql  (DRAFT, #385; not for merge until DevOps has created the roles)
--
-- Least-privilege grants for two login roles that DevOps creates:
--   eg_api        the API Worker            (placeholder name; rename with sed before applying)
--   eg_scheduler  the scheduler Worker, PH2-E4-04 (#461) + PH2-E4-02 money path
--
-- Apply AFTER 0006 (#466) and 0007 (#478): the jobs grants name 0006's columns, and the
-- view grants name 0007's fee_ledger_job_subsidy.
--   psql -v ON_ERROR_STOP=1 --single-transaction -f 0008_roles_grants.sql
--
-- Idempotent: every GRANT/REVOKE can be re-run. Each role is first reset with REVOKE ALL
-- (which also drops its column-level grants), then granted exactly what is listed here.
--
-- Create the roles with SQL (CREATE ROLE ... LOGIN), NOT with the Neon console, CLI or API.
-- Those make the role a member of neon_superuser, which carries pg_read_all_data and
-- pg_write_all_data and would bypass every grant below. The guard at the top refuses that case.

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['eg_api', 'eg_scheduler'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      RAISE EXCEPTION 'role % does not exist; DevOps creates it first (CREATE ROLE % LOGIN ...)', r, r;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb))
       OR pg_has_role(r, 'neon_superuser', 'MEMBER')
       OR pg_has_role(r, 'pg_write_all_data', 'MEMBER')
       OR pg_has_role(r, 'pg_read_all_data', 'MEMBER') THEN
      RAISE EXCEPTION 'role % has broad privileges (superuser/neon_superuser/pg_*_all_data/CREATE*); grants would be meaningless', r;
    END IF;
  END LOOP;
END $$;
-- Note: on a non-Neon Postgres (e.g. local PGlite tests) neon_superuser does not exist and
-- pg_has_role raises. Drop that one line there.

-- ---------------------------------------------------------------- baseline
REVOKE ALL ON SCHEMA public FROM PUBLIC;            -- no CREATE, no USAGE for arbitrary roles
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC;  -- includes views
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
-- Functions and types keep PUBLIC's default EXECUTE/USAGE on purpose: gen_random_uuid()
-- (pgcrypto), the domains (stroops, g_account, ...) and the enums need it, and the
-- trigger functions below raise only.

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM eg_api, eg_scheduler;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM eg_api, eg_scheduler;
REVOKE ALL ON SCHEMA public FROM eg_api, eg_scheduler;

GRANT USAGE ON SCHEMA public TO eg_api, eg_scheduler;   -- USAGE only, never CREATE
-- The database name differs per branch; DevOps runs this once per branch:
--   GRANT CONNECT ON DATABASE neondb TO eg_api, eg_scheduler;

-- Default privileges: deliberately NOT set. ALTER DEFAULT PRIVILEGES only covers objects
-- created later by the role that runs it (neondb_owner), and an automatic grant on every
-- new table is the opposite of least privilege. Every migration that adds a table, view,
-- sequence or a column one role must write carries its own GRANT (NOTES.md checklist).
-- Column-level grants never extend to new columns by themselves.

-- ---------------------------------------------------------------- eg_api
-- Table-level SELECT where the API's WHERE/RETURNING/ON CONFLICT clauses read the row anyway;
-- INSERT/UPDATE are column-level.
GRANT SELECT, DELETE ON signin_codes TO eg_api;
GRANT INSERT (email, code_hash, expires_at, failures, used_at) ON signin_codes TO eg_api;

GRANT SELECT ON users TO eg_api;
GRANT INSERT (email, created_at) ON users TO eg_api;
GRANT UPDATE (deactivated_at, reactivated_at) ON users TO eg_api;  -- reactivated_at: #471

GRANT SELECT, DELETE ON sessions TO eg_api;
GRANT INSERT (id_hash, user_id, csrf_token, created_at, last_used_at, idle_expires_at, absolute_expires_at, rotated_from) ON sessions TO eg_api;
GRANT UPDATE (user_id, csrf_token, created_at, last_used_at, idle_expires_at, absolute_expires_at, rotated_from) ON sessions TO eg_api;

GRANT SELECT ON auth_rate_counters TO eg_api;
GRANT INSERT (key, count) ON auth_rate_counters TO eg_api;
GRANT UPDATE (count) ON auth_rate_counters TO eg_api;

GRANT SELECT, DELETE ON wallet_challenges TO eg_api;
GRANT INSERT (id, session_hash, expires_at) ON wallet_challenges TO eg_api;

GRANT SELECT, DELETE ON wallets TO eg_api;
GRANT INSERT (network, account, user_id, linked_at) ON wallets TO eg_api;
GRANT UPDATE (linked_at) ON wallets TO eg_api;                     -- re-sign refresh: #471

GRANT SELECT ON watch_items TO eg_api;
GRANT INSERT (user_id, network, contract_id, label, scope, added_at) ON watch_items TO eg_api;
GRANT UPDATE (label, scope, removed_at, autopilot_enabled, payer_network, payer_account,
              threshold_ledgers, extend_to_ledgers, budget_per_job_max, budget_per_30d_max) ON watch_items TO eg_api;

GRANT SELECT ON observations TO eg_api;

GRANT SELECT ON jobs TO eg_api;
GRANT UPDATE (status, updated_at) ON jobs TO eg_api;               -- cancel queued jobs on remove
-- UNDETERMINED: INSERT on jobs for POST extend-now (not on main yet). Expected columns, to be
-- confirmed against that PR's SQL:
--   GRANT INSERT (user_id, network, contract_id, kind, payer_account, idempotency_key, request_hash) ON jobs TO eg_api;
-- UNDETERMINED: SELECT on fee_ledger / fee_ledger_job_balance for a job-history route (none yet).
-- UNDETERMINED: SELECT on allowance_observations for API §7 AllowanceState (no reader yet).

-- ---------------------------------------------------------------- eg_scheduler
-- Planner reads (packages/engine/src/pg-tenant-store.ts), column-level, so the
-- scheduler never reads email, sessions or sign-in codes.
GRANT SELECT (user_id, network, contract_id, scope, autopilot_enabled, removed_at, payer_network, payer_account,
              threshold_ledgers, extend_to_ledgers, budget_per_job_max, budget_per_30d_max) ON watch_items TO eg_scheduler;
GRANT SELECT (network, account, user_id, linked_at) ON wallets TO eg_scheduler;
GRANT SELECT (id, reactivated_at, deactivated_at) ON users TO eg_scheduler;  -- deactivated_at: planner follow-up

-- Stage 0 heartbeat (0005). Identity column: no sequence grant is needed for GENERATED ALWAYS.
GRANT INSERT (ticked_at, observed_ledger) ON scheduler_ticks TO eg_scheduler;
-- UNDETERMINED: SELECT on scheduler_ticks (only if the Worker itself computes the gap or the
-- E4-05 alert; #461 §4 says the alert must NOT run on the scheduler).

-- Jobs: reads for the 30-day budget plus resume-from-state; writes column-level.
GRANT SELECT ON jobs TO eg_scheduler;
GRANT INSERT (user_id, network, contract_id, kind, payer_account, autopilot_window) ON jobs TO eg_scheduler;  -- autopilot jobs; status defaults to queued
GRANT UPDATE (status, updated_at, preflight, attempts,
              pull_submitted_hash, pull_submitted_expires_at, pull_tx_hash, pulled_at, pull_amount, pull_fee_declared, pull_fee_charged,
              extend_submitted_hash, extend_submitted_expires_at, extend_tx_hash, extend_fee_declared, extend_fee_charged,
              extend_rent_charged, extend_refundable_charged, extend_nonrefundable_charged, extend_records,
              reconcile,
              refund_submitted_hash, refund_submitted_expires_at, refund_tx_hash, refund_amount) ON jobs TO eg_scheduler;
-- Never writable by the scheduler: id, user_id, network, contract_id, kind, payer_account,
-- idempotency_key, request_hash, autopilot_window, created_at.

-- fee_ledger: append-only. SELECT + column-level INSERT; no UPDATE, DELETE or TRUNCATE for anyone
-- but the owner. id and recorded_at are left to their defaults so a row cannot be backdated.
GRANT SELECT ON fee_ledger TO eg_scheduler;
GRANT INSERT (job_id, network, wallet, contract_id, kind, amount, tx_hash, ledger) ON fee_ledger TO eg_scheduler;
GRANT USAGE ON SEQUENCE fee_ledger_id_seq TO eg_scheduler;          -- bigserial nextval; USAGE only, no UPDATE (setval)
GRANT SELECT ON fee_ledger_job_balance TO eg_scheduler;             -- reconcile check
-- UNDETERMINED: fee_ledger_job_subsidy. DoD-2 evidence; no Worker reads it in code or design.
-- Left to the owner / a future read-only reporting role.
-- UNDETERMINED: INSERT on observations / allowance_observations (+ USAGE on their sequences).
-- #461 §4 implies ticks write observations, but no code does yet:
--   GRANT INSERT (network, contract_id, observed_at_ledger, observed_at, scan, health) ON observations TO eg_scheduler;
--   GRANT USAGE ON SEQUENCE observations_id_seq TO eg_scheduler;

-- ---------------------------------------------------------------- fee_ledger guard (defence in depth)
-- Fires for every role, including the owner and anyone holding pg_write_all_data, so a
-- mistaken script or console session cannot rewrite the ledger. It is NOT protection against
-- the owner on purpose: the owner can DISABLE TRIGGER or DROP it. That needs a migration,
-- which is reviewed.
CREATE OR REPLACE FUNCTION fee_ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fee_ledger is append-only (% refused); correct with a new row, e.g. kind = difference', TG_OP;
END $$;
DROP TRIGGER IF EXISTS fee_ledger_no_update_delete ON fee_ledger;
CREATE TRIGGER fee_ledger_no_update_delete BEFORE UPDATE OR DELETE ON fee_ledger
  FOR EACH ROW EXECUTE FUNCTION fee_ledger_append_only();
DROP TRIGGER IF EXISTS fee_ledger_no_truncate ON fee_ledger;
CREATE TRIGGER fee_ledger_no_truncate BEFORE TRUNCATE ON fee_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION fee_ledger_append_only();
-- Consequence: jobs rows that have ledger rows can never be deleted (FK + this trigger).
-- That is intended: jobs is not deleted anywhere in code.
