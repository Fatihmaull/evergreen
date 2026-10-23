-- PH2-E2-03 Neon schema, DRAFT for #350 (PH2-E2-02) review. Not for merge. Postgres (Neon).
-- Sources: PHASE2-PLAN §3.3, ADR-007, ADR-008, docs/API.md on #350 at 682ab6b, #382 fee-refund evidence.
-- Conventions: stroops as numeric(39,0) (never float; API serialises as decimal strings);
-- ledgers as bigint; times timestamptz (UTC); network constrained to the known names.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid(), digest()

CREATE DOMAIN stroops AS numeric(39,0) CHECK (VALUE >= 0);
CREATE DOMAIN network_name AS text CHECK (VALUE IN ('testnet','mainnet'));
CREATE DOMAIN g_account AS text CHECK (VALUE ~ '^G[A-Z2-7]{55}$');
CREATE DOMAIN contract_id AS text CHECK (VALUE ~ '^C[A-Z2-7]{55}$');

-- ---------- identity (ADR-008) ----------
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,                  -- personal data: never returned by a public route
  created_at  timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz                  -- soft delete (API §10): row, email and wallets stay; sessions revoked
);
-- One email, one account, ever: email sign-in reactivates (clears deactivated_at), never creates a second row.
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

-- One-time sign-in codes (API §4): hashed, single use, 10 min, void after 5 failures.
CREATE TABLE signin_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  code_hash   bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  failures    smallint NOT NULL DEFAULT 0,
  used_at     timestamptz
);
CREATE INDEX signin_codes_email_idx ON signin_codes (lower(email), created_at DESC);

-- Server-side sessions (API §3). The cookie carries an opaque ID; only its hash is stored.
CREATE TABLE sessions (
  id_hash       bytea PRIMARY KEY,             -- sha256(cookie value)
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token    text NOT NULL,                 -- synchronizer token, returned by GET /me
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  idle_expires_at     timestamptz NOT NULL,    -- SESSION_IDLE_TIMEOUT (config)
  absolute_expires_at timestamptz NOT NULL,    -- SESSION_ABSOLUTE_TIMEOUT (config)
  rotated_from  bytea                          -- previous id_hash on rotation
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- SEP-10 linked wallets. A wallet belongs to at most one user (409 WALLET_LINKED_ELSEWHERE).
CREATE TABLE wallets (
  network     network_name NOT NULL,
  account     g_account NOT NULL,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_at   timestamptz NOT NULL DEFAULT now(),
  challenge_tx_hash text,                      -- the verified SEP-10 challenge, for audit
  PRIMARY KEY (network, account)
);
CREATE INDEX wallets_user_idx ON wallets (user_id);

-- ---------- watchlist (API §6) ----------
CREATE TABLE watch_items (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network      network_name NOT NULL,
  contract_id  contract_id NOT NULL,
  label        text,
  scope        jsonb NOT NULL,                 -- {dataKeys:[...]} | {noDataKeys:true}
  added_at     timestamptz NOT NULL DEFAULT now(),
  autopilot_enabled boolean NOT NULL DEFAULT false,
  payer_network     network_name,
  payer_account     g_account,
  threshold_ledgers bigint,
  extend_to_ledgers bigint,
  budget_per_job_max     stroops,
  budget_per_30d_max     stroops,
  -- Soft delete (API §6): DELETE sets removed_at; a later POST for the same contract clears it on the same row,
  -- so the plain primary key stays correct and jobs keep their FK target.
  removed_at   timestamptz,
  PRIMARY KEY (user_id, network, contract_id),
  FOREIGN KEY (payer_network, payer_account) REFERENCES wallets(network, account) ON DELETE RESTRICT, -- unlink refused while paying
  CHECK (removed_at IS NULL OR NOT autopilot_enabled),   -- a removed item never runs autopilot
  CHECK (NOT autopilot_enabled OR (
    network = 'testnet' AND payer_account IS NOT NULL AND payer_network = network
    AND threshold_ledgers > 0 AND extend_to_ledgers > threshold_ledgers
    AND budget_per_job_max IS NOT NULL AND budget_per_30d_max IS NOT NULL))
);
CREATE INDEX watch_items_autopilot_idx ON watch_items (network) WHERE autopilot_enabled AND removed_at IS NULL;

-- Latest engine observation per item (API: lastObservation). History kept append-only.
CREATE TABLE observations (
  id            bigserial PRIMARY KEY,
  network       network_name NOT NULL,
  contract_id   contract_id NOT NULL,
  observed_at_ledger bigint NOT NULL,
  observed_at   timestamptz NOT NULL,
  scan          jsonb NOT NULL,                -- ScanResult, as `scan --json`
  health        text NOT NULL CHECK (health IN ('healthy','warning','critical','unknown'))
);
CREATE INDEX observations_latest_idx ON observations (network, contract_id, observed_at_ledger DESC);

-- ---------- allowances (API §7; chain is the truth, this is history) ----------
-- Needed because the chain reads 0 for expired, revoked and never (#297).
CREATE TABLE allowance_observations (
  id            bigserial PRIMARY KEY,
  network       network_name NOT NULL,
  account       g_account NOT NULL,           -- from
  spender       g_account NOT NULL,           -- the engine account
  amount        stroops NOT NULL,
  live_until_ledger bigint,                    -- null when amount = 0
  observed_at_ledger bigint NOT NULL,
  observed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX allowance_obs_latest_idx ON allowance_observations (network, account, spender, observed_at_ledger DESC);

-- ---------- jobs (plan §3.3; API §7) ----------
CREATE TYPE job_status AS ENUM ('queued','preflight-failed','cancelled','pulled','extended','refunded','failed');
CREATE TABLE jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(), -- also the engine's pull/refund idempotency key
  user_id       uuid NOT NULL REFERENCES users(id),
  network       network_name NOT NULL CHECK (network = 'testnet'), -- writes testnet-only until DoD-2 (PH2-E5-02)
  contract_id   contract_id NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('extend-now','autopilot')),
  payer_account g_account NOT NULL,
  status        job_status NOT NULL DEFAULT 'queued',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- client intent dedupe (API: Idempotency-Key, per user, kept >= 24 h)
  idempotency_key   uuid,
  request_hash      bytea,                     -- sha256 of canonical body: same key + other body -> 409
  -- autopilot dedupe: at most one live job per item per scheduler window (window definition: undetermined, PH2-E4-04)
  autopilot_window  bigint,
  preflight     jsonb,                         -- {at, ok, reason?, rentStroops?}
  pull_tx_hash  text UNIQUE,                   -- at most one transfer_from per job
  pulled_at     timestamptz,                   -- when the pull confirmed; the daily-limit window reads this
  pull_amount   stroops,
  -- Fees per transaction (#382 evidence): the protocol charges the actual resource fee and the unused
  -- refundable part (rent included) never leaves the source, so reconcile records CHARGED, not declared.
  pull_fee_declared   stroops,                 -- envelope fee = inclusion + declared resourceFee
  pull_fee_charged    stroops,                 -- TransactionResult.feeCharged
  extend_tx_hash      text,
  extend_fee_declared stroops,
  extend_fee_charged  stroops,
  extend_rent_charged stroops,                 -- meta rent_fee_charged
  extend_refundable_charged    stroops,        -- meta total_refundable_resource_fee_charged
  extend_nonrefundable_charged stroops,        -- meta total_non_refundable_resource_fee_charged
  extend_records jsonb,                        -- BumpRecord[] (shared type), unchanged shape
  reconcile     jsonb,                         -- {at, rentPulledStroops, rentChargedStroops, differenceStroops}
  refund_tx_hash text UNIQUE,
  refund_amount stroops,
  attempts      smallint NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id, network, contract_id) REFERENCES watch_items(user_id, network, contract_id) ON DELETE RESTRICT,
  CHECK (kind <> 'extend-now' OR idempotency_key IS NOT NULL),
  CHECK ((pull_tx_hash IS NULL) = (pulled_at IS NULL)),
  CHECK (status <> 'cancelled' OR pull_tx_hash IS NULL),      -- cancelled only before any pull
  CHECK (extend_fee_charged IS NULL OR extend_fee_declared IS NULL OR extend_fee_charged <= extend_fee_declared),
  CHECK (pull_fee_charged IS NULL OR pull_fee_declared IS NULL OR pull_fee_charged <= pull_fee_declared),
  CHECK (kind <> 'autopilot' OR autopilot_window IS NOT NULL)
);
CREATE UNIQUE INDEX jobs_idem_uq ON jobs (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX jobs_autopilot_uq ON jobs (network, contract_id, autopilot_window) WHERE kind = 'autopilot';
CREATE INDEX jobs_user_idx ON jobs (user_id, created_at DESC);
-- Daily limit (API §7): per contract, rolling 24 h, only jobs that pulled funds count.
CREATE INDEX jobs_daily_limit_idx ON jobs (network, contract_id, pulled_at)
  WHERE kind = 'extend-now' AND pull_tx_hash IS NOT NULL;
-- usedToday: SELECT count(*) FROM jobs WHERE kind = 'extend-now' AND pull_tx_hash IS NOT NULL
--   AND network = $1 AND contract_id = $2 AND pulled_at > now() - interval '24 hours';

-- 'cancelled' is reachable only from 'queued' (and the CHECK above keeps it pull-free).
CREATE FUNCTION jobs_cancel_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' AND OLD.status <> 'queued' THEN
    RAISE EXCEPTION 'job % can be cancelled only from queued (was %)', OLD.id, OLD.status;
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'job % is cancelled; it cannot move to %', OLD.id, NEW.status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_cancel_guard BEFORE UPDATE OF status ON jobs FOR EACH ROW EXECUTE FUNCTION jobs_cancel_guard();
-- A job is created queued; it cannot be inserted already cancelled.


-- ---------- fee ledger (API §7 LedgerRow; DoD-2 zero subsidy) ----------
CREATE TYPE ledger_kind AS ENUM ('pull','rent','network-fee','evergreen-fee','refund','difference');
CREATE TABLE fee_ledger (
  id          bigserial PRIMARY KEY,
  job_id      uuid NOT NULL REFERENCES jobs(id),
  network     network_name NOT NULL,
  wallet      g_account NOT NULL,
  contract_id contract_id NOT NULL,
  kind        ledger_kind NOT NULL,
  amount      stroops NOT NULL,               -- always >= 0; kind gives direction
  tx_hash     text,                            -- null only for derived rows (rent split from a pull)
  ledger      bigint,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  -- stored kinds carry their own tx; derived kinds (split out by reconcile) never do (API §7)
  CHECK ((kind IN ('rent','difference','evergreen-fee')) = (tx_hash IS NULL))
);
-- one pull and at most one refund per job, enforced by the DB, not only by the engine
CREATE UNIQUE INDEX fee_ledger_one_pull ON fee_ledger (job_id) WHERE kind = 'pull';
CREATE UNIQUE INDEX fee_ledger_one_refund ON fee_ledger (job_id) WHERE kind = 'refund';
CREATE INDEX fee_ledger_wallet_idx ON fee_ledger (wallet, recorded_at DESC);
-- Append-only: no UPDATE/DELETE grant for the API role (role names: undetermined).

-- Reconcile view: per job, pull - (rent + network-fee + evergreen-fee + refund + difference) must be 0.
CREATE VIEW fee_ledger_job_balance AS
SELECT job_id,
  sum(amount) FILTER (WHERE kind = 'pull')
  - coalesce(sum(amount) FILTER (WHERE kind IN ('rent','network-fee','evergreen-fee','refund','difference')),0) AS unexplained
FROM fee_ledger GROUP BY job_id;
