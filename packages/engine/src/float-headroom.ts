/**
 * Refund headroom for PH2-E4-03: the sum of pulls that are still in flight.
 *
 * A job counts while its status is `pulled` (the pull confirmed, and the job
 * is not yet `extended` or `refunded`). `eg_scheduler` already has SELECT on
 * `jobs`. This query does not touch `users`.
 */
export const IN_FLIGHT_PULLS_SQL = `SELECT coalesce(sum(pull_amount), 0)::text AS in_flight_stroops
FROM jobs
WHERE network = 'testnet' AND status = 'pulled' AND pull_tx_hash IS NOT NULL`;
