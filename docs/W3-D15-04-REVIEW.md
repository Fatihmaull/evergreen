# W3-D15-04 — internal review

Reviewed input: branch head `79e9124`, against main `cc0fb16`.
Review corrections: `73a9050` (production source and regression tests).
Outcome: **two P2 findings reproduced and fixed; no blocking finding remains
within the reviewed correction scope.** Ready for the publication checkpoint.
No PR or merge is implied by this internal review.

This was a sequential review in the implementation session, using targeted
reproductions and the actual callers. It is not a substitute for Fatih's review.

## Findings

### P2 — repeated contract declarations bypassed the policy agreement check

`loadConfig` accepts repeated contract registrations and `scanContracts` unions
their keys, but the engine built a Map with one value per contract ID. The final
registration silently replaced earlier payer, target and threshold values before
the new conflict checks ran.

Reproduced via loadConfig → runEngine with A registered twice under different
payer IDs: the instance still received extend, whichever payer was last. Repeated
targets also chose the last target. A high action threshold followed by a lower
one lost the trigger and the liveness alarm.

**Fix:** retain the list of registrations per contract and evaluate every policy
for each observed consumer. Existing payer/target agreement checks now see every
row. Effective action threshold remains the maximum; liveness receives that same
resolved value. Consistent repeated registrations still produce one decision.

Verification: two payer-order cases, conflicting target, threshold preservation,
and a permitted identical-registration case. Four failing expectations before
fix; the permitted case already passed. Reintroducing last-row selection fails
four tests after the fix.

### P2 — expired temporary data was still presented as restorable

The corrected engine refused expired candidates, but assertLiveness appended
RestoreFootprintOp guidance and remediation: restore for every expired kind.
A temporary entry therefore had a skip reason saying it cannot be restored and
a liveness finding recommending restoration in the same output.

**Fix:** pass the existing entry endBehavior into the liveness message and choose
investigate for deleted data. Persistent/instance/code archival retains restore
guidance. This changes reporting only; it does not decide temporary auto-bump
policy or add restore execution.

Verification: a synthetic expired temporary observation now produces investigate
and explicit cannot-be-restored guidance. The original test failed with restore.
Restoration guidance for archived entries remains covered by the existing suite.
Reintroducing unconditional restore fails the new temporary-data test.

## Other reviewed contracts

- Config target is preserved and clamped using the observed network ceiling;
  no executable target is planned when the ceiling is unavailable or the result
  cannot clear the action threshold.
- Zero remains live and expired entries are refused. Guard refusals still happen
  before candidate acceptance and remain recorded skips, not run-aborting errors.
- Shared entries retain consumers and require agreement on payer and target.
  Threshold resolution is independent of consumer/registration order.
- The existing runner API remains decide-only. No signing/submission capability,
  workflow/config deployment or B/C/shared protection change was introduced.
- D15-02's broader two-tier configuration and temporary policy, and D16 execution,
  remain separate work. This review does not certify those unimplemented paths.

## Verification

- Focused engine/liveness/CLI-agreement suite: **75 tests passed**.
- Full `pnpm check`: **575 tests passed = 497 Vitest + 78 Node**, exit 0.
- Coverage: 94.43% statements, 89.35% branches, 94.48% functions, 95.97% lines;
  all existing gates retained. Engine branches: 91.22%; liveness branches: 92.75%.
- Two additional mutation checks failed through behavioral assertions; source was
  restored and the engine-regression/liveness suite passed again (59 tests).
- The current compiled runEngine exactly reproduces the previously captured A
  result using all three saved reader responses in order. This is an offline
  replay of the prior live read, not a new Testnet observation.

[Initial live-read and mutation evidence](evidence/2026-09-12-engine-decision-correction/README.md)
and [review mutation results](evidence/2026-09-12-engine-decision-correction/review-mutation-checks.json).
The original RPC snapshots/output were not rewritten. No new network call,
secret access, signature, transaction, funding or scheduler dispatch in this review.
