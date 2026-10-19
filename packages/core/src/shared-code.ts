/**
 * The `ContractCode` ledger key that guinea-pigs A, B and C share (Wasm hash
 * `c7e55f0a…98bfb`). An identifier only: it guards nothing.
 *
 * It used to live in `write-guard.ts`, which refused any write touching it
 * while B and C aged toward their natural-decay proofs. That guard was retired
 * by `PH2-E0-06` (2026-10-19) once every subject was spent: B expired on
 * 2026-09-21, C on 2026-09-26, and this entry was extended to ledger 8,297,162
 * on 2026-10-14 (#296). It was retired rather than left holding an empty list,
 * because a guard that cannot fire and a guard that fires wrongly are the same
 * defect. The key stays exported because tests and evidence tooling name the
 * entry by it; the history is readable at the `sow1-final` tag.
 */
export const SHARED_CODE_ENTRY_KEY = 'AAAAB8flXwrYnvsGALwVBIsVUJn6TZfO4WRm+hJEs9y86Yv7';
