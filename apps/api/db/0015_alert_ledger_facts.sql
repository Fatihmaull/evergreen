-- 0015_alert_ledger_facts.sql  (PH2-E2-06, #612)
--
-- Current ledger facts for two optional user alerts. Not history: observations
-- already keeps the scan. The API cron reads these as eg_api and calls
-- dispatchUserAlert later; this file does not send anything.
--
--   entry_ttl_facts         one row per watched entry (approaching_critical)
--   allowance_expiry_facts  one row per (account, spender) (allowance_expiring)
--
-- No user_id and no email. eg_api joins watch_items, which it can already
-- read, and uses its existing users.email grant. This file grants nothing
-- on users. eg_scheduler upserts the facts and must not gain users.email.
--
-- network is testnet only, same as jobs, until DoD-2 (PH2-E5-02).
--
-- Apply after 0014 (and after 0013, because of the ledger INSERT below).
-- Re-run after any 0008 re-run: 0008 starts with REVOKE ALL and drops these
-- grants. A run before 0013 fails closed (schema_migrations is missing).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0015_alert_ledger_facts.sql
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- GRANT can be re-run, and the ledger INSERT upserts.

CREATE TABLE IF NOT EXISTS entry_ttl_facts (
  network            text NOT NULL CHECK (network = 'testnet'),
  contract_id        text NOT NULL,
  entry_key          text NOT NULL,          -- stable key already in the scan; no new RPC shape
  entry_kind         text NOT NULL CHECK (entry_kind IN ('persistent', 'temporary', 'code')),
  end_behavior       text NOT NULL CHECK (end_behavior IN ('archived', 'deleted')),
  observed_ledger    bigint NOT NULL CHECK (observed_ledger > 0),
  live_until_ledger  bigint NOT NULL CHECK (live_until_ledger >= 0),
  remaining_ledgers  bigint NOT NULL,        -- live_until - observed; 0 is still live
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, contract_id, entry_key)
);

CREATE TABLE IF NOT EXISTS allowance_expiry_facts (
  network            text NOT NULL CHECK (network = 'testnet'),
  account            text NOT NULL,          -- owner G-account, not an email
  spender            text NOT NULL,          -- engine spender
  observed_ledger    bigint NOT NULL CHECK (observed_ledger > 0),
  live_until_ledger  bigint NOT NULL CHECK (live_until_ledger >= 0),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, account, spender)
);

CREATE INDEX IF NOT EXISTS entry_ttl_facts_contract_idx
  ON entry_ttl_facts (network, contract_id);
CREATE INDEX IF NOT EXISTS allowance_expiry_facts_account_idx
  ON allowance_expiry_facts (network, account);

-- 0008 sets no default privileges. The REVOKE is a guard if that changes.
REVOKE ALL ON entry_ttl_facts, allowance_expiry_facts FROM PUBLIC;

GRANT SELECT ON entry_ttl_facts, allowance_expiry_facts TO eg_api;

GRANT SELECT ON entry_ttl_facts, allowance_expiry_facts TO eg_scheduler;
GRANT INSERT (
  network, contract_id, entry_key, entry_kind, end_behavior,
  observed_ledger, live_until_ledger, remaining_ledgers, updated_at
) ON entry_ttl_facts TO eg_scheduler;
GRANT UPDATE (
  entry_kind, end_behavior, observed_ledger, live_until_ledger, remaining_ledgers, updated_at
) ON entry_ttl_facts TO eg_scheduler;
GRANT INSERT (
  network, account, spender, observed_ledger, live_until_ledger, updated_at
) ON allowance_expiry_facts TO eg_scheduler;
GRANT UPDATE (
  observed_ledger, live_until_ledger, updated_at
) ON allowance_expiry_facts TO eg_scheduler;

-- Ledger line (PH2-E2-07). Same statement as 0013, this file's name.
INSERT INTO schema_migrations (filename, source)
VALUES ('0015_alert_ledger_facts.sql', 'applied')
ON CONFLICT (filename) DO UPDATE
  SET last_applied_at = now(),
      apply_count     = schema_migrations.apply_count + 1;
