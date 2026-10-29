-- 0007: network-fee ledger rows are evidence only, never billed (Fatih, #414 decision 1; PH2-E4-02).
-- 1) fee_ledger_job_balance: unexplained = pull - (rent + evergreen-fee + refund + difference), 0 for a reconciled job.
--    Same columns, names, order and types as schema.sql, so CREATE OR REPLACE VIEW applies.
-- 2) fee_ledger_job_subsidy: DoD-2 zero subsidy per job, evergreen-fee - network-fee >= 0.
--    A fully refunded job (extend failed after the pull; refund = whole pull, fee included, #414 decision 3)
--    is flagged separately and is not a subsidy violation.
-- Apply after 0006: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0007_fee_ledger_network_fee_evidence.sql
-- Uses no 0006 column. Idempotent: re-running replaces both views with the same definitions.

CREATE OR REPLACE VIEW fee_ledger_job_balance AS
SELECT job_id,
  sum(amount) FILTER (WHERE kind = 'pull')
  - coalesce(sum(amount) FILTER (WHERE kind IN ('rent','evergreen-fee','refund','difference')),0) AS unexplained
FROM fee_ledger GROUP BY job_id;

COMMENT ON VIEW fee_ledger_job_balance IS
  'Reconcile per job: pull - (rent + evergreen-fee + refund + difference) must be 0. network-fee rows are evidence only (#414) and are not in the sum.';

CREATE OR REPLACE VIEW fee_ledger_job_subsidy AS
SELECT job_id,
  evergreen_fee,
  network_fee,
  evergreen_fee - network_fee AS margin,
  fully_refunded,
  (NOT fully_refunded AND evergreen_fee - network_fee < 0) AS subsidised
FROM (
  SELECT job_id,
    coalesce(sum(amount) FILTER (WHERE kind = 'evergreen-fee'),0) AS evergreen_fee,
    coalesce(sum(amount) FILTER (WHERE kind = 'network-fee'),0) AS network_fee,
    coalesce(
      sum(amount) FILTER (WHERE kind = 'pull') > 0
      AND sum(amount) FILTER (WHERE kind = 'refund') = sum(amount) FILTER (WHERE kind = 'pull')
      AND coalesce(sum(amount) FILTER (WHERE kind = 'evergreen-fee'),0) = 0,
      false) AS fully_refunded
  FROM fee_ledger GROUP BY job_id
) s;

COMMENT ON VIEW fee_ledger_job_subsidy IS
  'DoD-2 zero subsidy per job (#414): margin = evergreen-fee - network-fee must be >= 0. fully_refunded (refund = whole pull, no evergreen-fee) is flagged apart and never counted as subsidised.';
