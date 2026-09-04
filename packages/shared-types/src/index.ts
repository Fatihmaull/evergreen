/**
 * The seams. Every module codes against these types.
 *
 * Populated at W1-D6-01. Three shape constraints come from ADR-004 and are cheap
 * now, expensive later:
 *
 *   1. `BumpRecord` carries the payer as a field distinct from the contract.
 *      Never assume the payer is the contract owner or that there is one global
 *      bot identity.
 *   2. `EvergreenConfig` expresses N contracts watched by M payers. The bot
 *      account is not a process-wide singleton.
 *   3. `Signer` is an interface resolved per payer, so the plain funded account
 *      (Stage 1) and the capped policy signer (Stage 2) are drop-in for one
 *      another.
 *
 * v1 implements no multi-tenancy. It must simply not foreclose it.
 */

/** Package version marker — replaced by real types at W1-D6-01. */
export const SHARED_TYPES_PLACEHOLDER = true;
