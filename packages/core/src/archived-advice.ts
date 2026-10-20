/**
 * What to do about an ARCHIVED entry (persistent, instance or code), written
 * once so every surface says the same thing (PH2-E1-05). Temporary entries are
 * deleted, never archived, and must never be shown this.
 *
 * It says what the site says (#322):
 * - An invocation restores an archived entry automatically, and pays for it,
 *   when the entry is in its **restore list**. Simulation fills that list in.
 *   Footprint membership alone fails (CAP-0066).
 * - An extend is not an invocation. A transaction holding
 *   `ExtendFootprintTTLOp` holds only that operation, so nothing restores on
 *   its behalf, and extending an archived entry still needs a restore first.
 *   That is the case Evergreen's own write path meets.
 *
 * There is no protocol version number, by the copy rule in
 * `web-reference/design-language/claims-and-copy.md`. The behaviour holds on
 * both networks Evergreen reads: on 2026-10-20 Horizon reported protocol 29
 * for testnet and for mainnet.
 */
export const ARCHIVED_ENTRY_ADVICE =
  'An invocation that lists it in its restore list restores it automatically and pays for the restore; simulation fills that list in. ' +
  'To extend it, restore it first with RestoreFootprintOp: an extend is not an invocation, so nothing restores it on the way.';
