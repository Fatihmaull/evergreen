/**
 * The dashboard. Built in Week 4.
 *
 * Deliberately not scaffolded with a framework yet: the choice depends on the
 * hosting decision still open in ADR-003 (W1-D5-03), and picking one now would
 * be guessing.
 *
 * Two layers, and the second must be genuinely removable:
 *
 *   P0 — public read-only. No wallet, no signup, no accounts.
 *        * Scan any contract: TTL health, projected archive date, rent estimate.
 *          Scanning is a permissionless read, so this works for anyone's
 *          contract, not only ones we monitor.
 *        * Bump history for contracts this instance monitors. Everything else
 *          reads "not monitored by this instance" — which must not be mistaken
 *          for "this contract is unprotected".
 *
 *   P1 — wallet connect + "extend now". The user signs a payment to extend a
 *        contract themselves. Wallet-connect authorizes a PAYMENT, never
 *        ACCESS; UI copy implying otherwise is a bug (ADR-004).
 *
 * Build the public layer as the whole product and add signing on top. Never
 * build "the dashboard minus auth" — if the write path never lands, what ships
 * must not have dead buttons or empty auth-gated regions.
 *
 * There is no automated write path. The dashboard never bumps anything on its
 * own; that is the engine's job.
 */

/** Package marker — replaced by the real app at W4-D22-01. */
export const DASHBOARD_PLACEHOLDER = true;
