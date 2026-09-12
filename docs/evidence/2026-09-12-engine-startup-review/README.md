# D15 startup reconciliation — 2026-09-12

Subject: fetched `origin/main` at `cc0fb16` (full hash obtainable from Git), after
PRs #113 through #118 merged while the local D15-01 plan was being reviewed.

The user authorized implementation of the local D15-01 plan. The mandatory refresh
found that Fatih had already implemented/reassigned D15-01 in #115, added the
read-only A run in #116, and the fallback runner/fix in #117/#118. No duplicate
engine implementation or branch was started. #113 was approved and merged and
#107 closed. These are GitHub/current-content facts, not local branch ancestry.

## Targeted offline reproduction

A clean `git archive cc0fb16` export was created outside the workspace, with the
existing node_modules made available. Production files were not edited. The
attached [reproduction source](repro.test.ts.txt) was added as
`packages/core/test/w3-startup-repro.test.ts` only in that temporary export.
The synthetic inputs have valid Testnet config/public IDs. The override case runs
the real runEngine and scanContracts against the existing recorded A fixture
through createMockReader; TTL offsets are explicitly synthetic. No live RPC,
secret read, simulation or chain write occurred.

Command from the export:

```bash
node node_modules/vitest/vitest.mjs run packages/core/test/engine.test.ts packages/core/test/liveness.test.ts packages/core/test/w3-startup-repro.test.ts
```

Observed exit 1: **37 existing tests passed; all 4 added regression expectations
failed**. These expectations come from the approved local plan and current shared
contracts, not a claim that every detail of that plan was implemented in #115.

| Expectation | Actual on main |
| --- | --- |
| Config remaining-TTL target 518,400 stays that target, for remainder 17,280 | Decision target 535,680; current code adds config target as an increment. The existing engine test explicitly expects increment semantics, so fixing this requires correcting that expectation as well. |
| Expired instance (remaining -1) is not an extension candidate | action: extend |
| Shared unprotected code with different payer IDs does not silently elect a payer | action: extend using the first consumer's payer |
| Contract override 2,000 at remaining 1,000 alarms when nothing executes, even if default threshold is 100 | Instance decision extend; run.liveness.isAlarm false |

The assertion's optional decisions parameter and global-only threshold are still
present; packages/engine remains a marker while the working engine is core's
`engine.ts` plus scripts/engine-run.mjs. A replacement package implementation is
unnecessary: corrections should build on the merged modules.

## Changed proof decision

#114 explicitly changes W3-D18-02b: B is observed crossing, the write guard refuses,
and B is allowed to expire. A supplies the separate unattended-save proof. This
supersedes the old handoff's combined natural-decay-and-save account. The existing
B/C/shared guard must not be weakened to restore the old story. Dates inside some
new rows say September 14 although GitHub records the merges on September 12;
actual merge/content evidence is the verification basis.

## Proposed next action

Revise the approved plan as a focused correction of the merged D15 code, keeping
Fatih's completed task/ownership history. Register any corrective follow-up before
coding and coordinate the findings at the publication checkpoint. Do not start
D16 execution on a silently changed payer/target/liveness contract. No correction
has been implemented or published by this review.
