/**
 * The auto-bump engine. A scheduled job, not a daemon (ADR-001).
 *
 * One run = load config -> scan registered contracts -> evaluate decision rules
 * -> submit extendTTL for those that need it -> record BumpRecord -> notify.
 *
 * Three things this module must get right, all of them consequences of choices
 * already made:
 *
 *   - Dry-run is the default. Live submission is explicit (CLAUDE.md rule 6).
 *   - Scheduler runs can overlap, so bumps must be idempotent — never
 *     double-bump an entry, and handle an in-flight transaction across runs.
 *     That needs a durable atomic write, which is why ADR-003 frames
 *     persistence as an atomicity question rather than a storage one.
 *   - Signing goes through the `Signer` interface, resolved per payer, so
 *     Stage 1 (plain funded account) and Stage 2 (capped policy signer) are
 *     drop-in for one another.
 *
 * The engine never holds a user's key and never needs one: extendTTL is
 * permissionless. It holds only the lumens it uses to pay fees.
 */

/** Package marker — replaced by the real run loop at W3-D15-01. */
export const ENGINE_PLACEHOLDER = true;
