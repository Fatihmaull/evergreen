# W3-D15-02 — internal review

Reviewed head: `53cd395`; production implementation: `c32918e`.
Diff basis: parent #120 head `dda2530`, not the unrelated older main implementation.

**Outcome: no blocking findings in the D15-02 change.** No production correction
was needed. Four additional regression cases were added to cover combined-policy
boundaries more directly. Ready for the publication checkpoint; no child PR or
merge is implied by this review.

This was a sequential internal review in the implementation session. Fatih's
independent PR review remains part of the workflow.

## Contracts checked

- Omitted warning remains distinct from explicit warning. Legacy high action
  overrides derive a compatible warning; explicit inverted pairs reject instead
  of silently widening. Zero is preserved rather than treated as omission.
- Global and per-contract fields resolve into the existing HealthThresholds type.
  Unknown threshold keys and malformed values fail at the config boundary. The
  old config shape still compiles; no second JSON action alias is introduced.
- Warning and action horizons aggregate independently across shared consumers and
  repeated registrations. #120 payer/target agreement and target cap stay intact.
- Early warning never becomes a bump trigger or a liveness alarm. High impact on
  shared/temporary entries can affect display severity without authorizing action.
- Exact warning/action boundaries and the last live ledger retain inclusive
  semantics. Expired/unavailable handling, protected refusals and CLI exits remain.
- The script consumes the new metadata, prints effective horizons/action-needed,
  and counts actual candidates rather than inferring them from health color.
- No workflow, operational dogfood config, write-guard, signer or transaction path
  was changed. D15-02b policy and D16 execution remain separate work.

## Additional review checks

The existing suite covered different thresholds across repeated rows, plus shared
entries at common defaults. Added cases now explicitly exercise:

1. Shared code whose largest warning comes from A and largest action horizon from
   B, in both consumer orders: warning-only skips/quiet liveness, then protected
   refusal and an alarm exactly at the combined action boundary.
2. Legacy action override 1500000 with warning omitted: derived warning 1500000,
   target remains exactly 2000000 and action is still available.
3. Explicit warning/action zero through runEngine: quiet/healthy at remaining 1;
   eligible/live at remaining 0, with liveness alarming on the unexecuted decision.

All four cases passed the existing implementation; they are regression coverage,
not claimed bug fixes. Replacing combined horizons with the first consumer's pair
fails both consumer-order tests. Replacing zero action with the global fallback
fails the zero-boundary test. Sources were restored after each mutation.

## Verification

- Focused config/health/engine/regression/CLI-agreement suite: **118 passed**;
  formatter suite: **4 passed**.
- Full `pnpm check`: **638 tests = 556 Vitest + 82 Node**, exit 0, unchanged gates.
- Coverage: 94.72% statements, 90.42% branches, 94.77% functions, 96.12% lines.
- After mutation restoration, all 13 engine-threshold tests passed and production
  source diff against the reviewed head was empty.
- The current compiled engine replayed all three saved A reader responses in order
  and exactly matched the captured result/warnings. The current formatter showed
  two warnings with action-needed=no and would-extend=0. No new network call.

[Original read-only A evidence](evidence/2026-09-13-engine-thresholds/README.md)
and [review mutation results](evidence/2026-09-13-engine-thresholds/review-mutation-checks.json).
The earlier real runner exit-0 observation remains the live evidence; this review
adds offline replay, not a new live claim. No secret read, signature, transaction,
funding, restore or scheduler activation occurred during review.
