# ADR-009: The router extends instance and code only, and its fee goes straight to treasury

**Status:** Accepted. Fatih decided it on 2026-10-22 (Evergreen Phase 2 group chat, decisions 1a and 2a on the `PH2-E4-07` spike, #363).
**Date:** 2026-10-22
**Deciders:** Fatih. Rakha reviews, since the treasury address comes from his card `PH2-E4-03`.

## Context

Users without an allowance pay the fee through an Evergreen router contract that takes the fee and extends in one invocation, one signature ([`phase-2/PHASE2-PLAN.md`](../../phase-2/PHASE2-PLAN.md) §3.3). Spike `PH2-E4-07` ([evidence](../evidence/2026-10-22-router-spike/README.md)) measured on testnet, tx `3c1122353a0d881667e7ae6c44c024590c8c094113aaf1ab8ad5132b461de24a` (`SUCCESS`, one signature):

- instance live-until 5,443,860 → 6,322,913;
- code live-until 5,443,859 → 6,322,913;
- the target's persistent data **unchanged** at 5,443,867. A contract cannot extend another contract's persistent entries;
- instance + code = **99.21%** of simulated rent on the spike subject;
- fee 0.1 XLM (`1000000` stroops) in the same transaction; the user paid about 6.1 XLM rent, Evergreen paid nothing.

The 99.21% is one subject. On real user contracts the share is **undetermined**; contracts with much persistent data get less.

## Decision

1. **(1a) The router extends only instance and code.** Persistent data needs an allowance. The UI says so plainly to users without an allowance. **Neither the UI nor the custody statement (`PH2-E4-06`) may claim a contract is "fully safe" (or any equivalent) for a user without an allowance**, because their persistent data can still be archived. A second transaction for persistent data is not offered (§3.3 forbids two-transaction extends).
2. **(2a) The router pays its fee directly to the treasury address**, not to the engine account for a later sweep. The treasury address is **undetermined** until `PH2-E4-03`.

## Consequences

- Fewer moving parts and an audit trail of one transfer per fee.
- The production router (`PH2-E4-08`, size L: audit, Rust CI owned by the DevOps Assistant, final fee address) cannot ship before `PH2-E4-03` fixes the treasury address.
- The engine-sweep step in §3.3 now applies only to allowance-path fees.
