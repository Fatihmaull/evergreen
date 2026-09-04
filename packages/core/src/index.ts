/**
 * Evergreen core — all the logic worth testing.
 *
 *   - RPC client: wraps `getLedgerEntries` + latest-ledger lookup. The only
 *     place in the system that talks to the network.
 *   - TTL math: remaining ledgers, projected archive ledger and date. Ledgers
 *     are the unit of truth; dates are derived for display only.
 *   - Rent model: cost to extend N ledgers. Reads fee parameters from the
 *     network rather than hardcoding constants — a constant validated once in
 *     Week 2 is quietly wrong by Week 4.
 *   - Storage optimizer: flags oversized/duplicated entries and data in the
 *     wrong storage class.
 *   - Decision rules: (ScanResult, thresholds) -> BumpDecision. A pure
 *     function with no I/O, which is what makes the engine testable offline.
 *
 * This package never imports from cli, engine, or dashboard.
 */

/** Package marker — replaced by real exports from W1-D7 onward. */
export const CORE_PLACEHOLDER = true;
