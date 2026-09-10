# STATUS — living board

**This is the first file to read and the last file to write, every session.** BACKLOG.md is the plan; this is reality.

**Last updated:** 2026-09-10 · #60–#63 merged; ADR-006 live but **not yet accepted**; `W2-D8-01/02` in review (#65)
**Sprint day:** 8 of 30 · **Deadline:** 2026-10-02 · **17 build days left** (weekdays only)
**Current week:** **W2 — Core CLI, Deliverable 1** (W1 closed 49/50) · 🔴 **milestone gate Wed Sep 16**
**Health:** 🟢 on track · **`W1-D4-06` confirmed** · **decay proof armed (Sun Sep 20 / Fri Sep 25)** · 🔴 **hard gate Fri Sep 18** · 🟡 **shared code entry expires 2026-10-20 (`W3-D18-02d`)**

---

## Right now

**2026-09-09 — W2-D8-04 Done (Rakha), published for review in [PR #63](https://github.com/Fatihmaull/evergreen/pull/63):** `scanContracts(reader, requests)` now reads unique instance/code/data keys, retains unique consumer IDs and per-contract coverage, and attributes partial failures to affected consumers. `scanContract` wraps the same implementation; legacy `scanInstances` removes repeated input consumers. The approved [plan](W2-D8-04-PLAN.md) is implemented on `feat/W2-D8-04-ledger-key-dedup`, local runtime commit `f5065b5`. No new shared-domain schema, CLI syntax, rent or transaction path.

**Validation:** `pnpm check` passed **170 offline tests** (134 workspace + 11 TTL + 9 scheduler + 9 email + 7 persistence), typecheck, lint, formatting, conflict and task-ID checks. The new tests first failed before implementation; coverage includes shared/distinct Wasm, duplicate/contradictory inputs, malformed scope and RPC data, per-contract coverage, partial batches and 201 instance keys. An initial TypeScript narrowing error was corrected before the passing gate. [Read-only Testnet proof](evidence/2026-09-09-scan-dedup/README.md) at ledger 4,586,511: input B/C/B → two unique contracts and three unique entries; entry reads of 2 then 1 keys; both consumers on one Wasm. No additional-data declaration was made, so the health helper correctly returns 3. Output TTLs match raw responses. Capture rendering was completed offline after correcting the helper name; original live responses are preserved. No transaction, B/C calibration change or drift-check claim.

**Review/publication boundary:** Rakha authorized review and publication. Review found no blocking code issue; the full gate passed again with 170 offline tests on 8f0ade8. Parent documentation follow-up is published in PR #60 at 8100d83, including merged W1 main and Fatih's requested notes. D8-04 is published as [PR #63](https://github.com/Fatihmaull/evergreen/pull/63), based on #60, with Fatih requested as reviewer; retarget that child to main before merging/deleting the parent. No merge or new transaction. Audit #61/#62 remain separate. The [Issue #44 follow-up](https://github.com/Fatihmaull/evergreen/issues/44#issuecomment-5601813974) requests final ADR acceptance and records the integration order. GitHub CI and Pages passed on parent 8100d83 and child 5d19800. This final publication-tracking edit changes Markdown only; final-head CI is checked separately. Notion publication links/status/outcomes for D8-03/D8-04 and the ADR-006 Decisions update were written and read back; W1-D7-04 Done was already verified.

**2026-09-09 — review follow-up and main synchronization:** integrated merged W1 PRs #57/#59 from main `88372ec`, preserving D8-03 runtime and all raw scan evidence. Fatih accepted the exit-code scheme in [his review](https://github.com/Fatihmaull/evergreen/issues/44#issuecomment-5600478304), requesting historical milestone labeling and an explicit warning against using the empty-data assertion to silence unknown coverage. Those documentation corrections are published in PR #60; ADR-006 remains Proposed pending final acceptance. W1-D7-04 is Done by shared acceptance. Audit #61 and A-extension evidence #62 are open, not integrated here. Fatih reports A's instance/data extended on Sep 9; dated scan evidence remains valid and reproduction now returns newer TTLs. Shared code and B/C must not be extended by this work. No transaction or new live observation in this synchronization. The synchronized parent passed `pnpm check` with all 143 offline tests; W1-D7-04 Done is mirrored. D8-03 follow-up outcome is mirrored and verified; the follow-up is published at 8100d83.
### ⚠️ ADR-006 is merged but not accepted — amendment proposed 2026-09-10

**Correction to the entry below:** it records that "Fatih accepted the exit-code scheme". He did not. He said he would accept it once two consequences were written down, and #60 merged before that acceptance was given. The scheme is therefore **live in the CLI while still Proposed**, which is a state worth naming rather than letting the ADR's status field quietly disagree with the shipped binary.

The open question is whether `--no-data-keys` asserts something a caller can actually know. For a contract you wrote, yes — it is a static property of your own source. For a contract you did not write, **no**: RPC cannot enumerate storage (`scan-contract.ts`: *"RPC cannot enumerate arbitrary storage"*), so there is no way to establish the absence of data keys, and third-party scanning is not an edge case — `W4-D22-02` promises "paste any contract ID". ADR-006 anticipates this exactly and mitigates it with a documentation note telling callers not to use the flag reflexively. **A doc note is not a mechanism.** Amendment under discussion; see the reply on #64.

### ✅ Guinea-pig A extended past the sprint (`W1-D7-08`) — one clock still running

**2026-09-09 — review follow-up and main synchronization:** integrated merged W1 PRs #57/#59 from main `88372ec`, preserving D8-03 runtime and all raw scan evidence. Fatih accepted the exit-code scheme in [his review](https://github.com/Fatihmaull/evergreen/issues/44#issuecomment-5600478304), requesting historical milestone labeling and an explicit warning against using the empty-data assertion to silence unknown coverage. Rakha authorized publication after result review; those documentation corrections are included in PR #60; ADR-006 remains Proposed pending final acceptance. W1-D7-04 is Done by shared acceptance. Audit #61 and A-extension evidence #62 are open, not integrated here. Fatih reports A's instance/data extended on Sep 9; dated scan evidence remains valid and reproduction now returns newer TTLs. Shared code and B/C must not be extended by this work. No transaction or new live observation in this synchronization. The synchronized parent at cad029e passed pnpm check with all 143 offline tests; runtime and raw evidence match the previously published scanner. D8-03 remains In progress pending final ADR acceptance; its local follow-up and W1-D7-04 Done were mirrored and read back. Publication-link sync follows this push. D8-04 is complete on its separate child branch and is being published for review; it is not part of this PR. No merge is authorized or claimed.

## 🔴 Session scope boundary — one session writes implementation this week

**Set by Fatih 2026-09-10, after `#66` landed tagged `[W2-D10-01]`.** Read this before starting work.

| Session | Scope |
| --- | --- |
| **S1** | **Evidence assembly only.** W1 evaluation and the Deliverable 1 evidence bundle. |
| **S2** | **All implementation.** Week 2 execution, Sep 10–16. |

**If the D1 evidence bundle turns out to need an implementation change — and given the cost model and the recapture, it might — that change is handed to S2 rather than made in S1.** Say what is needed; do not write it.

*Why this exists rather than being assumed:* `#66` was not a careless overreach. Accepting an ADR that changes behaviour necessarily lands the code for that behaviour — S1 could not amend ADR-006's exit-code scheme without touching `exitCodeFor`. The original two-session rule assumed a cleaner separation than the work allows, so the boundary is now stated in the one place both sessions read first, rather than inferred from task ownership.

The concrete cost of the ambiguity was a task row that meant nothing: `W2-D10-01` sat `[ ]` while half of it was already merged, which is the state that produces either duplicated work or a silently dropped remainder. It now names what `#66` covered and what is left.

## [S2] Week 2 execution log

*Session 2 owns Week 2 execution (Sep 10–16). This section is appended to by S2 only; S1's entries above and below are never rewritten here.*

**2026-09-10 — `W2-D8-01` / `W2-D8-02` TTL projection and cadence (S2).** `projectEnd` and `measureCadence` land in `packages/core/src/ttl.ts` with 18 tests. The settled inclusive boundary was reused, not reopened.

- **Cadence stopped being a constant.** `LedgerCadence` carries the rate with its provenance and a ± band. The two recorded measurements (5.000 s/ledger over 100,000 ledgers; 5.0008 s over 16.3 h) bound a spread of 0.0008 — recorded as *a spread between two measurements, not a variance*, because two points no more give a variance than three gave a rent coefficient. Across `max_entry_ttl` that band is over an hour wide, which is why a projection reports a range.
- **`measureCadence` never reports zero uncertainty.** Close times are whole seconds, so a window of N ledgers cannot resolve cadence finer than `1/N` s/ledger, and a single interval cannot bound drift at all. A clean sample returning ±0 would have been the confidently-wrong answer — the same shape as the testnet guard that refused everything.
- **No `projectedArchiveDate` reached `shared-types`.** ADR-005 is accepted and untouched; the projection is a display-edge derivation in `core`, and `isRestorableAfterEnd` is exposed so no display path re-derives durability and calls a deletion an archival.
- **Guards were mutation-tested, not assumed.** Flipping `isLive` to `> 0`, assigning the uncertainty band naively, and dropping the quantization floor each failed exactly one test — the one written for it. Restored and green afterwards.

**2026-09-10 — cadence re-observed against the live chain (S2).** The constant restated measurements taken on Sep 5, and restating a number is not observing it. Sampled 11 testnet closes 2,000 ledgers apart (4,576,156–4,596,156) from Horizon and ran the new `measureCadence` over them: **5.000000 s/ledger, ±0.000050**, agreeing with the recorded 5.000 ±0.0008 well inside the combined band. This is a third independent measurement, and the first that exercised the new code against real network data rather than fixtures.

The sample also justified a design decision after the fact: **every one of the ten intervals closed in exactly 10,000 s**, so the observed per-interval spread was zero and the reported ±0.000050 is precisely the `1/N` quantization floor. Without that floor this measurement would have claimed **±0 uncertainty from real data** — a falsely exact projection arrived at honestly, which is the failure family this repo keeps meeting. Recorded as `packages/core/test/fixtures/ledger-closes-testnet-2026-09-10.json` and pinned by two tests; the fixture is labelled a *derived extract* rather than a raw response, because it is one. The agreement test states in its own comment that a future disagreement is a **finding**, not a reason to widen the band. Read-only; no transaction, and B, C and the shared code entry were not touched.

**2026-09-10 — merge-order handling (S2).** PR #63 was retargeted to `main` **before** #60 merged, per the stacked-PR rule; it survived #60's merge instead of being auto-closed. Squashing #60 then left #63 conflicting in seven files. Resolution was verified rather than trusted: every conflicted file on `main` is byte-identical to #60's head, which is an ancestor of #63, so the branch side is a provable superset. The merged tree is byte-identical to #63's tip and `pnpm check` passes with 170 tests. The push to Rakha's branch was sandbox-blocked here and Fatih ran it; #63 merged as `ee60d7c`. In the interval, S1 merged #61 and #62, so the branch needed a second sync against a main that had moved twice — the cross-session collision flagged that morning, arriving on schedule. S1 had already pushed that second sync; theirs was verified and accepted rather than overwritten with an equivalent local merge.

**2026-09-10 — the rule covers tests; and the check for that found a gap it cannot reach (S2).**

**Tests are covered**, verified by planting the exact first copy — the simulation's `remaining < THRESHOLD` — inside a `.test.ts` file and watching lint reject it. `packages/*/test/**/*.ts` is in the lint config's file list, so the original crime scene is closed rather than exempted. Checked by executing, not by reading the config.

**But the check surfaced a copy the lint rule cannot reach.** `scripts/check-decay-drift.py` restates *both* policy constants in Python: `THRESHOLD_LEDGERS = 17_280` and `SECONDS_PER_LEDGER = 5.0`. ESLint does not read Python, and the comment *"matches evergreen.config.example.json"* is documented intent, not an enforced link. This is not an incidental script — it is the twice-weekly check watching guinea-pigs B and C, so a silent divergence would move the projected crossing dates for the grant's most important evidence.

The values agree today. Closed anyway with `scripts/check-policy-constants.mjs`, wired into `pnpm check`, which asserts the Python copies match their owners — the threshold from `evergreen.config.example.json`, the cadence from `ttl.ts`.

**Exercised in three failing directions, and the third found a defect in the checker itself.** Drifting the threshold copy fails; drifting the cadence copy fails; *renaming* a constant originally threw an uncaught stack trace rather than reporting. That is the divergent-ID failure inside the guard meant to prevent it — a check that stops matching rather than failing. It now reports the rename as a readable finding. It also briefly appeared to exit 0 on that case; that was an artifact of reading `$?` after a pipe, and re-running without the pipe showed the true exit code. Worth recording: the measurement was wrong, not the code, and it took a second look to tell which.

**Two protections added at Fatih's request.** The naming convention is now load-bearing for a safety rule — the lint matches on identifier names, so renaming `remainingLedgers` or `threshold*` silently disables a guard while every test still passes. Recorded next to the naming rule, with the instruction to re-verify by planting a deliberate copy. And **zero inline disables is now a stated property**: silencing the one-home rule requires the same bar as changing the threshold semantics, because every individual disable looks justified when written and a rule with scattered disables has decayed into documentation that happens to run. The rule has already fired once on legitimate code (`threshold < 0`, validation not policy) and the right answer was `isValidThreshold`, not a disable — which is expected to be the usual outcome.

**2026-09-10 — the threshold comparison is now unwritable outside one file (S2).** Fatih's question after the `exitCodeFor` divergence: *grep found the third copy, but grep cannot prove there is no fourth — can the comparison be made unwritable?*

**Answer: yes, by lint rather than by types.** `eslint.config.js` now forbids hand-written TTL threshold and expiry comparisons everywhere except `packages/core/src/ttl.ts`, which is exempted as the one home. A copy is a CI failure at the moment it is typed.

**Why not the type-level version.** Making the raw number unreachable would mean wrapping `remainingLedgers` in something not comparable with `<`. Branding does not work — `number & {brand}` still accepts relational operators. A wrapper object would work and would cost more than it buys: `remainingLedgers` lives in ADR-005-accepted `shared-types`, is serialized in `--json` output and consumed by the dashboard, and an object with methods does not survive `JSON.stringify`. Churning an accepted type two days before the Sep 16 feature freeze, with the engine arriving in Week 3, to close a gap the lint rule already closes, is a bad trade. The lint rule is naming-based and so evadable by renaming a variable — but it catches the *natural* way the copy gets written, which is how it was written all three times.

**Exercised in both directions.** A deliberate fourth copy was added to `packages/cli/src`, written exactly as a display layer would naturally write it — the case Fatih predicted `W2-D10-01` would produce — and lint rejected it; removing it returned lint to clean. One legitimate comparison surfaced during this: `threshold < 0` in `assertLiveness` was **validation, not policy**. Rather than silence the rule with an inline disable, it became `isValidThreshold`, which is better code and leaves the policy modules with zero exceptions.

**`gate-agreement.test.ts` stays, with its limit recorded:** it protects the consumers it knows about, and Week 3 arrives with new call sites the lint rule covers and the test does not.

**The `threshold = 0` argument moved into the code.** Under `<`, a zero threshold fired only at `remaining < 0` — *act after death*, a setting that fires exclusively when it is too late. That is the strongest argument for the policy and it was found empirically, from a test that had pinned the old behaviour, not by reasoning. It now sits in the `needsAction` block comment under *"if you are here to change `<=` back to `<`, read this first"*, where someone tempted to revert will meet it.

**`CONVENTIONS` gains "agreement is not correctness" as its own rule.** Two consumers agreeing on a wrong answer is still a wrong answer, and a pure agreement test would pass while both were wrong together — the failure the agreement pattern itself invites.

**2026-09-10 — the threshold policy had a THIRD home, and it was shipping a wrong CI answer (S2).** Fatih asked for a grep after the simulation's copied rule was caught: *"if `needsAction` had two copies, there may be a third."* There was.

`exitCodeFor` in the CLI carried a longhand `remainingLedgers < thresholdLedgers`. When the threshold became a floor (`<=`), the copy did not move. **At exactly the threshold the engine alarmed while `evergreen-check` reported a clean CI pass** — the Action's entire contract with the outside world, wrong, silently. Verified by executing both gates side by side rather than by reading, output preserved below:

```
remaining= 17281  needsAction=false  engine.isAlarm=false  cli.exit=0  agree
remaining= 17280  needsAction=true   engine.isAlarm=true   cli.exit=0  *** DIVERGE ***
remaining= 17279  needsAction=true   engine.isAlarm=true   cli.exit=1  agree
```

**The distinction that matters: the test copy failed loudly, this one did not fail at all.** Nothing compared the two gates, so the divergence was invisible and would have shipped. It was found only because the first copy had just surfaced and prompted the grep — detection by luck twice over.

Fixed by routing every consumer through the predicate. Added `hasExpired(remaining)` as the primitive so `isLive`, `projectEnd` and `assertLiveness` all call one boundary instead of three copies of `remaining < 0`. Added `packages/cli/test/gate-agreement.test.ts`, which walks across the boundary asserting the CLI gate and the engine give the same answer **and** that both match the predicate — two consumers agreeing on a wrong answer is still a wrong answer.

**One existing CLI test encoded the old policy and had to change**, which turned out to be clarifying rather than awkward: with `threshold = 0` the old `<` rule fired only at `remaining < 0`, i.e. *after* the entry was already gone — a threshold that fires exclusively when it is too late. Under the floor rule it fires on the final live ledger, the last moment anything can be done. That case now asserts both boundaries at once: the entry is **live** and **needs action**, which is the clearest available proof they are independent rather than contradictory.

**Written into `CONVENTIONS` as two rules**, since this is the report-named-no-subject family with a new surface: *one home for a policy — call the predicate, never restate it*, and *a test must call the thing it tests, never restate it*. The second names the sharp part: a test that reimplements its subject is not a weak test, it is a test of a different thing that happens to usually agree, and it only ever fails by luck.

**Two forward dependencies recorded so they cannot quietly rot.** `W3-D15-01` must always pass `decisions` and should make the parameter required once it does — an optional parameter the single real caller omits is a distinction that exists only in tests, and without it a held claim is indistinguishable from nothing happening. `W3-D19-01` must route `NotificationChannel` on `LivenessVerdict.severity`; until something consumes it the grading is decoration and every alarm arrives at one urgency, which is exactly what the grades exist to prevent.

**`W2-D10-01` resolved to `[~]` in both channels.** #66 (S1) landed its exit-code half while accepting the ADR-006 amendment; the display half is still open and is S2's. The cause is structural, not careless — accepting an ADR that changes behaviour necessarily lands the code for that behaviour, so S1 could not amend the exit-code scheme without touching `exitCodeFor`. The row now names what #66 covered and what remains, so it means something rather than sitting ambiguous.

**Also corrected: the `W2-D10-04` row contradicted itself.** It opened with the pre-policy 49/47 split while explaining further down that the policy had changed to `<=`. Now 48/48, with the earlier number noted as correct under the rule it replaced.

**2026-09-10 — two liveness semantics decided (Fatih), implemented (S2).** Both were genuinely product calls, not technical ones, and both changed the code.

**The threshold is a floor, not a line to sit on.** `needsAction` now fires at `remaining <= threshold`. Reasoning: the threshold is a safety margin and *touching* it is already the failure the margin exists to prevent — one step from danger is not margin. Costs at most one cron interval of earliness; buys a margin never touched rather than merely rarely crossed. The threshold's meaning is now documented as **"act once remaining reaches this number."**

**This puts two `==` comparisons on opposite sides in one codebase, deliberately.** `isLive` is inclusive at zero; `needsAction` is inclusive at the threshold. The next reader will assume one is a bug, so they now sit adjacent in `ttl.ts` under a comment block naming the difference: `isLive` is a **protocol fact** the chain decides and we only report; `needsAction` is a **policy choice** we own. They answer *"is this alive?"* versus *"should we act?"* — agreement between them was never the property to preserve. Changing `needsAction` is a product decision; changing `isLive` is claiming the chain works differently than it does.

**The simulation moved from 49/47 to 48/48, and the record says why.** The earlier number was correct under the earlier rule — the boundary run stayed quiet under `<` and alarms under `<=`. Both are right under their own policy. The test carries a comment saying so, because a number that moves without explanation reads as someone quietly loosening a test. The test's own model of *when the engine acts* also had to change; it now calls `needsAction` rather than restating `<`, and that hand-written copy silently disagreeing with the rule is exactly what the failing test caught.

**Firing stays strict; the message is graded.** Only `'succeeded'` buys silence. Everything else fires, but now carries a `severity` — `info` for dry-run, `warn` for an unconfirmed submission, `critical` for failure, held claim, or unreadable TTL — and a `remediation`. **Severity never gates firing:** a mutation making `info` suppress the alarm fails a test, because suppressing dry-runs would train the team to skim the channel and the Sep 20 alarm would go unread with it. The unconfirmed case is worded as *uncertainty, not failure* — a run that cannot confirm its own work does not know either way, and silence would claim success it has not earned.

**`remediation` splits expired from merely low.** An entry at `remaining = -5` is past `extendTTL` and needs `RestoreFootprintOp`; it alarms with `remediation: 'restore'` and says so. Pointing someone at the wrong operation while they act under pressure is its own failure. An entry at `remaining = 0` is *live but needs action* — both rules applying at once, without contradiction, which is the clearest demonstration that the two boundaries are independent.

**Confirmed on request:** one entry below threshold among otherwise healthy ones fires (health is not a majority vote), and a shared code entry at risk reports once while naming all N contracts it takes down. Four further mutations were run against the changed rule rather than relying on the earlier round.

**2026-09-10 — `W2-D10-04` decision rule landed early (S2).** The liveness assertion was flagged this morning as not fully buildable in W2 — it asserts over `claim()` and lock lookups, and `packages/engine` is still `ENGINE_PLACEHOLDER`. It split as predicted: `assertLiveness` is now in `packages/core/src/liveness.ts` with 18 tests, pure and engine-free, and the wiring is a `W3-D15-01` line. **The row is `[~]`, not `[x]`** — the task says *the run* exits non-zero and there is no run yet. Calling it Done because code exists is the error the manual names.

The rule: an entry seen below threshold that this run did not *verifiably* extend means the run is not healthy, whatever the reason. **Only `outcome: 'succeeded'` counts as action** — `submitted` is unconfirmed by its own type comment, `simulated` never touched the chain. Since dry-run is the safety default, "scheduled job silently left in dry-run" is a likely failure, and it alarms.

**Exercised in both directions, which is the whole point for a mechanism of this shape.** Four mutations — treating `submitted` as success, counting any record as action, using `<=` at the threshold, and skipping unavailable TTL — each failed exactly the tests written for them. And the guinea-pig B window is simulated run-by-run rather than argued about: **49 quiet runs, then 47 consecutive alarms**, with **zero** alarms across the same window when the engine acts. The second half matters as much as the first; an alarm that cries wolf gets muted.

**A test caught its own author.** The simulation initially asserted a round 48/48 split. The real split is 49/47, because the run landing *exactly* on the threshold is still healthy — "below", not "at or below". Asserting 48/48 would have been asserting a bug, one layer up from `remainingLedgers === 0` being live. The expectation was corrected, not the code.

**Correction against S2 (2026-09-10).** S2 twice stated it would land a follow-up flipping ADR-006 to **Accepted**, on the reasoning that Fatih's instruction to merge #60 *was* the acceptance. **That was wrong, and S1 caught it.** Fatih had said he would accept once two consequences were written down; #60 merged before that acceptance was given, so the scheme is live in the CLI while still Proposed. Flipping the status would have manufactured a record of a decision nobody made — the same class of error as a mirror asserting something the repo does not support, except authored into the canonical side where it is harder to detect. S2 dropped the follow-up; the open `--no-data-keys` amendment on #64 is S1's to carry. Recorded here rather than quietly abandoned, because the reasoning that produced it (an instruction to merge implies acceptance of everything in the diff) will look reasonable again the next time.

**Notion anomaly (2026-09-10, S2).** All 23 W2 IDs present with owners matching `BACKLOG.md`. `W2-D8-04` read **Done** in Notion while PR #63 was open and unmerged — the mirror asserting something the repo did not support. Not corrected by editing the mirror: #60 is merged and #63 is queued, so the fix is to make the claim true. `W2-D8-03` read In progress against a Pending repo row — an ordinary missed write. Recorded here because status-only validation keeps proving insufficient; this is the third boundary at which the mirror and the repo disagreed on something other than status alone.

**Prompt-vs-repo corrections (2026-09-10, S2).** The Week 2 session brief mis-stated four task IDs, one dangerously: it listed `W2-D13-02` as the batch scan and first cut. `W2-D13-02` is the **wallet-connect spike**; the batch scan is `W2-D13-03`. Cutting by the brief would have deleted the item the plan front-loaded *in order to* protect the batch scan's cut slot. Likewise `W4-D24-01` is the live public URL — required evidence, explicitly never-cut — not the rent view (`W4-D24-03`). `BACKLOG.md`'s cut order is correct and remains canonical. The brief also treated `docs/READY.md` and the `extendTTL-fees-guinea-pig-a.json` rent fixture as landed; both are still in unmerged PR #62, so `W2-D9-02`'s validation data is real but not yet on `main`. Effective build days in the sprint are **22, not 24** (8 weekend days, computed).

**Week 2 fit (2026-09-10, S2).** Seven task-days (`D8`–`D14`) are scheduled into **five** build days: Sep 12/13 are Sat/Sun, and the backlog plans `W2-D10` and `W2-D11` — the first write transaction, required SOW evidence — onto them. Fatih's call: hold the cut decision until Fri Sep 11 and decide against a measured burn rate rather than an estimate. Cheap items remain available (`W2-D13-03`, then `W2-D12` depth).

**`W2-D10-04` is not fully buildable in Week 2 as written (2026-09-10, S2).** It asserts behaviour over `claim()` and lock lookups; `packages/engine/src/index.ts` is still `ENGINE_PLACEHOLDER = true` and the run loop arrives at `W3-D15-01`. The task splits: the **decision rule** — below threshold and no bump recorded ⇒ non-zero — is a pure function buildable now in `core` with no engine, and the **wiring** is a W3 line. Building the rule ahead of the engine is what keeps the Fri Sep 18 gate reachable. Flagged, not yet actioned.

## Earlier D8-03 publication snapshot

**W2-D8-03 — In progress: published for shared review in [PR #60](https://github.com/Fatihmaull/evergreen/pull/60).** Rakha approved distinct incomplete-information exit 3 and explicit `--no-data-keys`, following Fatih's [Issue #44 review](https://github.com/Fatihmaull/evergreen/issues/44#issuecomment-5589189730). Precedence is error 2, incomplete 3, observed low TTL 1, healthy declared scope 0. The assertion is caller-provided and mutually exclusive with a keys file; an empty file or legacy result without coverage stays unknown (3). JSON retains mixed findings. No exit code authorizes a transaction. [ADR-006](adr/ADR-006-scan-health-exit-codes.md) is Proposed, pending Fatih/shared review; it includes the downstream sweep. Existing Issue #44 covers this correction; no new task or duplicate Issue is introduced.

**Validation:** `pnpm check` passed **143 offline tests** (107 workspace + 11 TTL + 9 scheduler + 9 email + 7 persistence), typecheck, lint, formatting, conflict and task-ID checks. An initial direct Vitest run used stale W1 build output after branch switching; rebuilding through typecheck resolved it. [Sep 9 read-only capture](evidence/2026-09-09-scan-coverage/README.md) verifies real CLI exit 3 at ledger 4,580,470 for A without data keys, with healthy instance/code. Offline replay of the unchanged Sep 8 four-entry JSON still returns 0; declared-empty and mixed/error cases are covered by fixtures. No transaction or B/C read/change was made.

**Publication:** Rakha reviewed the result and authorized publication. The implementation is pushed at `0c1bff9` in PR #60 against main, with review requested from @Fatihmaull. The [Issue #44 reply](https://github.com/Fatihmaull/evergreen/issues/44#issuecomment-5595727891) addresses the W1 recovery, coverage/exit-code proposal, rounded drift interpretation and release timing. ADR-006 remains Proposed; both PRs and the shared Issue remain open. GitHub CI is checked separately on the final publication commits; the 143-test result above is local validation. No merge or release is claimed.

**W1 review:** [PR #57](https://github.com/Fatihmaull/evergreen/pull/57) is open against main, with the reviewed follow-up published through `e736dbf`. Its combined tree passed 70 offline tests; only Markdown publication tracking changed afterward. The updated PR description removes the obsolete stacked-base instructions and records ADR-005 acceptance. D7-04 remains In progress for shared closeout acceptance; this branch's stale Pending row is corrected accordingly. #59 remains separate; the Issue reply requests qualifying its exact-cadence wording. No fresh B/C measurement is claimed.

**Mirror:** publication sync completed and was read back for exact IDs D8-03 (Rakha) and D7-04 (Shared), both In progress, plus the Proposed ADR-006 Decisions entry. Notes link PR #60/#57 and the Issue #44 response, distinguishing implementation from shared acceptance and merge. GitHub CI and Pages passed on implementation `0c1bff9` and W1 publication `e736dbf`; final Markdown tracking is checked on its own head. Task Tracker remains a weekly snapshot.

## Initial D8-03 implementation — Sep 8 snapshot

**W2-D8-03 — Done (Rakha), review PR/merge pending:** implemented on `feat/W2-D8-03-scan-entry-types` from main `321656b`. `scanContract` discovers instance/Wasm and reads explicit persistent/temporary LedgerKeys through `--keys-file`. It reports known-key coverage, batches at 200 keys, preserves each response's ledger and successful partial results, and diagnoses invalid/missing/unsupported observations. CLI exit 0 applies only to supplied/discovered keys; no data keys or unavailable TTL yields 1, invalid input/response or RPC failure yields 2. Shared types add optional coverage and the `unsupported-executable` issue kind; existing type consumers still compile. No transaction path is added.

**Validation:** `pnpm check` passed conflict/task-ID checks, typecheck (including shared-type examples), lint, formatting and **125 offline tests** (89 workspace + 11 TTL + 9 scheduler + 9 email + 7 persistence). Initial lint issues were fixed; a sandbox `spawnSync git EPERM` was resolved by running the same offline gate with subprocess permission. [Read-only Testnet evidence](evidence/2026-09-08-scan-entry-types/README.md) captured the compiled CLI returning all four A entry types at ledger 4,572,053, no issues, exit 0. Raw network-check/entry responses and input/output files are retained; each output TTL was compared with the raw response. No B/C changes or new transactions occurred. All 52 local documentation links resolve; all three architecture diagrams parse/render, and the changed scan diagram was visually checked.

**Tracking and next step:** D8-01/02 remain Fatih's TTL work; D8-04 remains Rakha's next Pending task (cross-contract shared-code/consumer deduplication). Exact-ID Notion validation preceded implementation; D8-03 Done and its outcome were written and read back successfully. WIP branch was published at start for ownership visibility; publication as a review PR and merge remain separate. Task Tracker is refreshed at the week gate, not for this task boundary.

**W1 carry-forward:** #53 and #58 are merged; Fatih confirmed the W2 split and reporting policy in [Issue #30](https://github.com/Fatihmaull/evergreen/issues/30#issuecomment-5587139386). Closeout #57 closed without merging; original remote head `98e62e2` and synchronized local branch at `01a135c` retain the report/evidence. Its W1 completion metadata is separate from this main-based branch. W1 Task Tracker was reconciled to 48 Done / 2 In progress, all 14 Rakha tasks Done. User-confirmed workflow: Evergreen Tasks is the operational Notion backlog; Task Tracker is a dated narrative refreshed per week at week gates. Existing database sync remains at session/merge boundaries. W1-D4-09 drift checks and W1-D7-04 closeout continue; no new drift measurement is claimed.

## Earlier architecture publication (since merged)

## Merged W1 closeout snapshot — superseded by the current state above

**2026-09-09 — published follow-up to Fatih's review (`W1-D7-04`):** reconciled remote recovery commit `1e08aeb` with local synchronization and weekly Task Tracker notes at `01a135c`. The architecture retains main's stage/atomicity content plus the local corrections recording ADR-005 acceptance and the W2 temporary-reporting boundary. Corrected the stale current task-state paragraph below. The weekly narrative policy remains in CONVENTIONS. The combined W1 tree passed `pnpm check` (70 offline tests); final follow-up edits only update Markdown. Rakha reviewed and authorized publication; the follow-up is pushed to PR #57, which remains open and unmerged. D7-04 remains In progress, with its outcome mirrored to Notion at this session boundary.

A's instance, persistent and temporary entries were all nine days from expiry, which nothing in the repo recorded. **Extended 2026-09-09, authorized by Fatih, read back from the chain:**

| Entry | Before | After | Projected expiry | On expiry |
|---|---|---|---|---|
| instance | 4,712,648 | **6,025,589** | 2026-12-01 19:18 UTC | archived |
| persistent | 4,712,658 | **6,025,595** | 2026-12-01 19:18 UTC | archived |
| temporary | 4,712,659 | **6,025,598** | 2026-12-01 19:18 UTC | **deleted — unrecoverable** |
| code *(shared A+B+C)* | 5,290,829 | 5,290,829 | 🔴 **2026-10-20 06:38 UTC** | archived |

Three transactions from `evergreen-b`, permissionlessly, **318,803 stroops ≈ 0.032 XLM total** for ~83 days. Hashes and Horizon confirmations in the [evidence bundle](evidence/2026-09-09-guinea-pig-a-extend/README.md). B and C verified untouched afterwards — both still crossing Sep 20 and Sep 25 at +0.0h.

**Targeted December, not Sep 19, deliberately.** A backs the `W1-D7-01` record, every live scan, #60's reproduction command, `W3-D17-04`'s real bump and the evidence screenshots. All of those stop being verifiable the moment A archives, and evidence has to outlive the sprint that produced it — extending to just past the immediate deadline would have re-created this in three weeks with nobody watching.

**🔴 The shared code entry is the remaining clock.** All three guinea-pigs were built from one Wasm (verified by fetching and hashing each), so they share **one** `ContractCode` entry — "extending A's code" would have extended B's and C's, which `SETUP` forbids while the proofs are live. A contract is only as alive as its code entry, so **all three become unusable 2026-10-20** regardless of the December dates above. Registered as `W3-D18-02d`: extend it **after Sep 25**, once both proofs are captured, at which point it costs nothing.

**The asymmetry is the real finding.** B and C had a drift check twice a week; A had nobody — the contracts designed to be at risk were monitored, the one everything depends on daily was not, because it was never *supposed* to be at risk. That assumption is what expired quietly. Rescued by hand here; handed to the engine at `W3-D15-01b`, which is the only version of the fix that outlives the sprint.

### W1 closed

**2026-09-09 — W1 closeout merged (`W1-D7-03/04/05/06`):** the [review and W2 handoff](W1-REVIEW.md) is on `main` via [PR #57](https://github.com/Fatihmaull/evergreen/pull/57) (`88372ec`); the closeout branch is deleted. Merging it *is* the shared acceptance, so `W1-D7-04` is Done and W1 closes at **49/50**, the one open item being `W1-D4-09`'s recurring drift check through Sep 20. [#44](https://github.com/Fatihmaull/evergreen/issues/44) stays open as the discussion thread only.

**[PR #59](https://github.com/Fatihmaull/evergreen/pull/59) merged (`3a76075`):** the stacked-PR rule now in CONVENTIONS § Git, and the fourth drift reading in the drift log below. Rakha's review note on the drift wording was half right and is answered in place — see the drift log.

**#57 was auto-closed by GitHub twice, not rejected.** The first time it was stacked on #53, so merging #53 deleted its base branch and GitHub closed the dependent PR silently, attributed to the merger. Restoring it took recreating the deleted base at `bcc41c7`, reopening, retargeting to `main`, then deleting the temporary branch again — reopen is refused while the base is missing, and the base cannot be changed while the PR is closed. **It then closed a second time when #59 merged**, even though #59's branch was unrelated and #57 was by then based on `main`. That second close also suppressed the `synchronize` webhook, so two pushes to the branch ran no CI at all while `gh pr view` still reported the *previous* head as green. Rule, stronger than the one #59 recorded: **after any merge that deletes a branch, re-check the `state` of every other open PR — not just its mergeability.** Querying `mergeable` alone is what hid this for half an hour.

**⚠️ #57 was auto-closed by GitHub, not rejected.** It was stacked on #53, so merging #53 deleted its base branch and GitHub closed the dependent PR — silently, and attributed to the merger. Restoring it took recreating the deleted base at `bcc41c7` (reopen is refused while the base is missing, and the base cannot be changed while the PR is closed), reopening, retargeting to `main`, then deleting the temporary branch again. **Rule for stacked PRs from here: retarget the child to `main` *before* merging the parent.** The child's own reviewed content was never at risk — only its PR record.

**Evidence:** a fresh instance scan passed against A on Sep 8. Nineteen historical Sep 5 bootstrap transactions were recovered as full RPC responses plus actual explorer screenshots, including A/B/C deployment, seeding and calibration. With the five unchanged setup/boundary records, the indexed W1 inventory contains 24 unique transactions. Late capture dates are explicit. No new transaction was submitted. See the [snapshot and recovery manifest](evidence/2026-09-08-w1-review/README.md).

**Task state:** 48 of 50 W1 tasks are Done on this review branch, including the architecture document merged in PR #53. `W1-D7-03`, `05`, `06` have concrete reports; the onboarding report explicitly does not claim unaided comprehension. `W1-D7-04` remains In progress for shared acceptance of the closeout in #44. ADR-005 and the W2–W4 carry-forward were already accepted in merged PR #58; temporary-entry auto-bump policy remains the separate W3 decision. `W1-D4-09` remains In progress through Sep 20. The scan milestone passed; W2 can start without treating those continuing items as finished.

**Review corrections:** aligned the inclusive TTL boundary in AGENTS/ONBOARDING, removed the obsolete W2 boundary experiment, reconciled setup/evidence descriptions, and clarified ADR-003: low TTL alone does not establish that an earlier transaction failed. Reconcile the known hash and validity bounds before constructing another transaction; uncertain outcomes remain submitted. Runtime/provider/timing and shared types are unchanged.

**Notion sync anomaly (2026-09-08):** all 50 W1 IDs were present and statuses matched before this closeout. Eleven historical Owner fields differed from BACKLOG: `W1-D4-00/04/04b/07/08/12/11/10/04c/05/06`. The repo assigns Fatih to ten and Shared to 04b; Notion had Agent, Shared or Rakha. Owner metadata was corrected to the formal backlog assignment while retaining historical executor notes. This repeated metadata drift shows that status-only validation is insufficient; compare IDs, status and owner at handoff boundaries. Final MCP read-back confirms all 50 W1 IDs, statuses and owners match. Project Brain now shows Sep 8/day 6, 24 days to deadline and 48/50 W1 tasks complete; Knowledge Base and Decisions link the review and recovered evidence.

**Validation:** final `pnpm check` passed conflict detection, typecheck (including negative type examples), lint, formatting and 70 offline tests. Verified all 19 recovered transaction bundles, 158 local documentation links and the new task references. Final publication review found [PR #56](https://github.com/Fatihmaull/evergreen/pull/56) registers the separate C spare-proof task. The earlier fallback reassignment was removed from this diff; the existing C row is retained and #56 is merged. Runtime/workflows/dependencies and original evidence match the baseline; .env content/permissions, stash and other prior branch heads are preserved.

**Coordination:** closeout commit `b490b0f` is pushed on the dedicated review branch. The [handoff comment on #44](https://github.com/Fatihmaull/evergreen/issues/44#issuecomment-5586317710) mentions @Fatihmaull, links the report and evidence, and requests architecture review plus the remaining shared decisions. The comment was read back. This was the initial WIP handoff. The [publication update](https://github.com/Fatihmaull/evergreen/issues/44#issuecomment-5586699923) now links #57 and records the #53/#56 merge order. Both comments were read back. The published review commit `105ccfb` passed [GitHub CI](https://github.com/Fatihmaull/evergreen/actions/runs/34238108025) and Pages checks. D7-03/04/05/06 plus Project Brain, Knowledge Base and Decisions carry the PR link; MCP read-back confirmed the links and retained statuses. #44 remains open for shared decisions; no merge was performed.

## Architecture publication

**2026-09-08 — architecture data-flow published (`W1-D6-02`):** owner Rakha, branch `docs/W1-D6-02-architecture-flow`, initially based on main `a7d500d` (PR #51), now synchronized with main `b0f0d0b` including merged PRs #52/#54/#55. [PR #53](https://github.com/Fatihmaull/evergreen/pull/53) publishes the reviewed documentation, with review requested from @Fatihmaull, and closes [#32](https://github.com/Fatihmaull/evergreen/issues/32) on merge. That issue's D6-03 mock RPC portion is already merged in #42. Repo and Notion matched before starting: D6-02 Pending; D6-03 and D6-04 Done. Changes are limited to ARCHITECTURE.md, this status entry and the D6-02 backlog row. Publication followed final local review and user authorization. The unused persistence artifact is now merged through [PR #52](https://github.com/Fatihmaull/evergreen/pull/52). Its source, dependency and evidence files match main; PR #53 still changes only the three documentation files.

**Outcome:** three Mermaid diagrams show dependencies, the actual instance scan and the planned engine flow. The document names the real shared-type fields and producer/consumer boundaries, a synthetic two-consumer/one-entry example, inclusive TTL semantics, optional rent, per-payer signer resolution, and simulated/submitted/succeeded/failed records. It records the accepted W3 Actions history / W4 Neon split and adoption prerequisites. Current limitations are explicit: scans read instances only; repeated input IDs remain repeated consumer references; unavailable TTL is skipped by the current CLI threshold helper. Broader discovery/consumer deduplication remain W2-D8-03/04, and future engine decisions must handle incomplete observations. No new product decision, runtime implementation or shared-type change is claimed.

**Initial validation:** `pnpm check` passed conflict detection, typecheck (including 17 negative type examples), lint, formatting and **63 offline tests** (34 workspace + 11 TTL + 9 scheduler + 9 email). That pre-sync count excluded the seven persistence tests subsequently merged in PR #52. All 22 document links were checked for valid local targets where applicable, and all 11 explicit task IDs resolve in BACKLOG. Final review parsed and rendered all three diagrams with Mermaid 11 in local Chromium and inspected their screenshots; rendering passed. **After integrating PR #52, a frozen-lockfile install and `pnpm check` passed all 70 offline tests** (34 workspace + 11 TTL + 9 scheduler + 9 email + 7 persistence), typecheck, lint, formatting and conflict detection. Runtime source, workflows, dependency files and original evidence match main; prior branch heads, stash and .env content/permissions are preserved. No new chain read/transaction, database run or email was needed: existing fixture-based tests and the merged scan proof cover the documented behavior.

**Mirror:** D6-02 is Done in both channels; its documented outcome and 63-test validation were read back by exact ID before publication. Publication sync records PR #53, the combined 70-test result and its pending review/merge state on the same row; the D6-04 merge outcome is mirrored as well. Earlier OAuth notes below are historical.

**Final review:** two diagram clarifications landed: unit tests enter through the mock reader without calling the network guard/SDK, and the engine resolves the public fee-paying account before envelope preparation/simulation, with signing gated by live opt-in. Existing shared types and code were rechecked; no blocking finding remains within this documentation scope. Temporary Mermaid rendering tools/screenshots are outside the repository; no dependency or runtime changes were added.

**Synchronization:** the earlier STATUS introduction conflict retained both task histories. The follow-up sync with #54/#55 merged cleanly, retaining the npm scope and ADR refinements from main. The architecture diagrams and shared-type mappings are unchanged; the PR diff remains three Markdown files.

**Next:** merged as [PR #53](https://github.com/Fatihmaull/evergreen/pull/53) on Sep 8; the conflict with main was resolved by keeping **both** the staged coordination table and the atomicity framing. No duplicate Issue was opened. The shared W1 review gate in #44 remains separate.

## Earlier session notes

### Sep 8 local synchronization and mirror notes — historical snapshot

The PR-closed and pending-sync statements in this dated record describe that earlier check; the current publication state is recorded above.

**2026-09-08 — W1 narrative mirror refreshed (`W1-D4-11`):** user confirmed Evergreen Tasks as the operational backlog in Notion and Task Tracker as a weekly narrative, refreshed at each week's closing review. All 50 W1 database IDs, owners and statuses matched the local canonical backlog. Updated the [Task Tracker W1 section](https://www.notion.so/3d2e2030b2ce81c48b03ebbe4f27e4b5), its snapshot summary and reading guidance via Notion MCP. Read-back confirms 50 unique task rows: 48 Done / 2 In progress, including **all 14 Rakha-owned tasks Done**. Recurring W1-D4-09 and shared closeout W1-D7-04 remain In progress; PR #57 is not represented as merged. Twelve missing rows were added, C's legacy alias was corrected to W1-D4-07, and formal owners were reconciled. Future-week sections are unchanged and explicitly labeled as unreviewed drafts. Database statuses were already correct and were not rewritten; no fresh drift measurement or Testnet transaction was performed.

**Mirror anomaly / workflow concern:** the manual W1 snapshot retained an obsolete C ID and owner assignments even after the database had been corrected. This is another manifestation of the recorded metadata drift: multiple manually maintained surfaces can preserve stale claims independently. The agreed boundary is now explicit in CONVENTIONS and the Notion page: operational database at session/merge boundaries, dated narrative snapshots at week gates, with presence/owner/status validation.

**2026-09-08 — local closeout synchronization (`W1-D7-04`):** the user requested codebase synchronization before discussing publication or changing Notion. Local main was fast-forwarded from `b0f0d0b` to `321656b`, including merged PRs [#56](https://github.com/Fatihmaull/evergreen/pull/56), [#53](https://github.com/Fatihmaull/evergreen/pull/53) and [#58](https://github.com/Fatihmaull/evergreen/pull/58). The existing `docs/W1-D7-03-week-one-review` branch is now integrated with that main. Both main and the combined closeout tree passed `pnpm check`: conflict detection, the 132-task ID check, typecheck, lint, formatting and all 70 offline tests, after resolving the sandbox's subprocess permission failure. Original evidence and all three architecture diagrams are unchanged; runtime code, workflows, tooling and dependency files match current main. No unresolved conflicts or missing local links in the review and architecture documents remain.

**GitHub publication state:** #53 merged at `59c3cf8`. #57 closed without a merge when its architecture base branch was deleted at 14:51:04 UTC; the closeout head `98e62e2` is still preserved locally and remotely. No human comment, inline review comment or formal review on #57 was returned by GitHub during this check. Its report and recovered evidence are not in main. Reopening/retargeting it, or publishing a replacement linked to it, remains a separate step; no remote write is part of this synchronization.

**Decisions and task state:** Fatih authored and merged #58, accepting ADR-005 and confirming the W2–W4 carry-forward. Temporary-entry near-deletion reporting belongs in W2; auto-bump policy remains W3-D15-02b. These decisions no longer await acceptance. This branch retains 48 Done / 2 In progress in W1: D7-03/05/06 reports are complete, D7-04 awaits review of the synchronized closeout, and recurring D4-09 continues through Sep 20. The integrated backlog has 132 tasks; W2 remains 23 Pending.

**Remaining Notion catch-up:** W1 Task Tracker is now refreshed as described above. Database outcome/publication notes remain pending for W1-D6-02 and W1-D7-03/04/05/06, alongside the accepted ADR-005/carry-forward knowledge notes and the Project Brain; these were outside the requested W1 Task Tracker correction. Also pending: the missing W3-D18-02c database row and the swapped W2-D13-02/03 database task descriptions. The W1 database statuses and owners already match the repo. These remaining discrepancies are recorded, not claimed corrected.


**W1-D6-04 decision is Done:** PR #48 accepts Actions + Node 24 and PostgreSQL on Neon, adopted in W4 after the Sep 20 proof. PR #49 resequences W3 history/coordination; PR #50 adds the downstream-sweep requirement. PR #51 subsequently corrected Stage 1 alerting deadlines and stale evidence task IDs. Local main was fast-forwarded to `a7d500d`, and PR #48/#49/#50/#51 are integrated into `chore/W1-D6-04-persistence-spike`. This supersedes the earlier plan to complete hosted validation before #32: no W1 hosted database is required, and D6-02 is now unblocked.

**Artifact publication:** per [the review on #30](https://github.com/Fatihmaull/evergreen/issues/30#issuecomment-5582108192), retain the original executable spike and evidence as an experiment unused by the engine/scheduler. The README and setup instructions now name its limits: pending work needs chain reconciliation; history currently accepts successful outcomes only. Original scripts and raw outputs are preserved. ADR-003 keeps the accepted runtime/provider/timing, clarifies the conditional Neon usage scenarios and row-claim pooling scope, and records the affected future task IDs. No hosted provisioning, engine implementation or live Stellar transaction is part of this publication. `pnpm check` passed all 70 offline tests plus conflict detection, typecheck (including 17 negative type examples), lint and formatting. Original source/dependency/evidence hashes and environment match the preservation snapshot. Published as [PR #52](https://github.com/Fatihmaull/evergreen/pull/52), with review requested from @Fatihmaull and closing link to #30. Publication commit `9390d72` contains the integrated artifact and passed [GitHub CI](https://github.com/Fatihmaull/evergreen/actions/runs/34212071469). Merge remains a separate review step.

**Mirror check:** D6-04 Done and D6-02 Pending agree with merged main. Repo-to-mirror catch-up created the missing W4-D26-05 row from its exact frozen backlog ID. **Sync anomaly (2026-09-08, W3-D16-03):** Notion retained an obsolete task title and Owner Shared while main assigns the current history task to F; corrected its title/owner and added the canonical scope, preserving the original review notes. Both future tasks remain Pending. D6-04 and Decisions were updated with PR #52 and the current accepted decision, then fetched again to verify the link, outcome and Done status. Both corrected future rows were read back by exact task ID; no future implementation is claimed.

**Next:** plan only D6-02's architecture data-flow work in #32. The mock RPC task D6-03 is already Done through PR #42; no duplicate harness work. Implementation of #32 has not started.

## Recent history — superseded states are dated below

**2026-09-08 — PR #45/#47 synchronization (`W1-D6-04`):** local `main` is now `1fc9f2d`; the persistence branch integrates both documentation PRs. The only conflict was the D6-04 backlog description: retained In progress, explicit ownership and the completed local checks. ADR-003 keeps Pages hosting separate and narrows the Workers unknown to deployment, cron, signing and D1, using the already recorded local import/XDR/Testnet read result. Actions + Node + PostgreSQL remains Proposed; hosted provider selection and validation remain open. No code, dependency or original evidence changes are part of this synchronization. `pnpm check` passed conflict detection, typecheck (including 17 negative type examples), lint, formatting and **70 offline tests**. The initial sandbox attempt could not spawn `git` (`EPERM`); rerunning with the required process permission passed. Source/evidence/dependency hashes, `.env` content/permissions and the stash match the pre-sync snapshot.

**Coordination published:** merge commit `edf99e5` is pushed on `chore/W1-D6-04-persistence-spike`. The user-authorized [follow-up on #30](https://github.com/Fatihmaull/evergreen/issues/30#issuecomment-5581340743) mentions @Fatihmaull, links the original evidence, and requests agreement on Actions + Node + PostgreSQL plus a Neon/Supabase preference. The proposal remains open; no provider has been selected or provisioned and no new PR was opened. At session start all four relevant Notion IDs (D5-01, D5-02, D6-02, D6-04) were present and matched repo statuses/owners. D6-04 stays In progress; D6-02 stays Pending. The user's sequence remains hosted validation and completion of #30 before planning #32. The W1 review must report any unfinished work and its explicit schedule impact; no completion date or W2 cut is claimed here. The GitHub comment was read back exactly. Notion MCP publication sync completed for the exact D6-04 task row and Decisions; both were fetched again and verified with the follow-up link, In progress status and open proposal.

**2026-09-08 — PR #42 synchronized (`W1-D6-04`):** local `main` was fast-forwarded to `c636cf7`; `chore/W1-D6-04-persistence-spike` now integrates [PR #42](https://github.com/Fatihmaull/evergreen/pull/42), including the CLI scan, core reader/TTL logic and offline mock RPC. The only merge conflict was in BACKLOG: retained D6-03 Done from main and D6-04 In progress from the active spike. Both the core SDK dependency and the spike's `pg` dependency are retained. Combined `pnpm check` passed conflict detection, typecheck (including 17 negative type examples), lint, formatting and **70 offline tests** (34 workspace + 11 TTL + 9 scheduler + 9 email + 7 persistence). The initial offline install lacked cached policy metadata; a normal frozen-lockfile install fetched it and passed without changing locked versions. CLI/core match merged main exactly; persistence scripts, original evidence, `.env` content/permissions, shared-types source, local checkpoints and stash are unchanged.

**Execution order confirmed by the user:** synchronize first, then settle the provider discussion and complete the hosted database test for #30; only afterward plan #32's remaining architecture documentation. The [Neon/Supabase comparison on #30](https://github.com/Fatihmaull/evergreen/issues/30#issuecomment-5579790710) has been posted with a tentative recommendation and the choice explicitly open. No reply was present at this sync check. No provider provisioned or new PR opened. D6-02 remains Pending; D6-03, D7-01, D7-02 and D7-07 are Done through PR #42.

**Mirror catch-up:** all six relevant IDs were present. Four Notion rows were behind merged main (D6-03, D7-01, D7-02, D7-07 still Pending); updated them to Done with the merged outcomes and PR link, then read back all six IDs/statuses. This was a missed mirror update, not unsupported completion. D6-04 stays In progress. D6-04's final synchronization outcome (70 offline tests, PR #42 integrated, hosted testing before planning #32) was mirrored via MCP and read back successfully.

**2026-09-08 — local persistence spike ready for review (`W1-D6-04`):** [Issue #30](https://github.com/Fatihmaull/evergreen/issues/30), owner Rakha, branch `chore/W1-D6-04-persistence-spike`. Eight PostgreSQL checks passed: one winner under two-process contention, independent entries, expired-claim takeover with generation checks, pending-state protection, rollback, idempotent completion/history, preserved payer/signer/fee data, and reads after client/process replacement. A separate stopped-database check refused work and exited nonzero. [Evidence and reproduction](evidence/2026-09-08-persistence-spike/README.md). Local Workers SDK 17.0.1 import/XDR and Testnet A reads also passed; no deployment, cron, signing or D1 proof is claimed.

**Proposal and remaining scope:** retain Actions + Node and use PostgreSQL; [ADR-003 amendment](adr/ADR-003-toolchain-hosting-persistence.md#2026-09-08--local-persistence-spike-proposal-for-review) is Proposed. The user requested **local-result review before choosing Neon or Supabase**. Hosted connection/permissions/pooling validation remains outstanding, so D6-04 stays `[~]` / In progress. No provider provisioned, new PR or Issue created, email sent, or Stellar transaction submitted. WIP branch visibility is separate from PR publication; the next checkpoint is local-result review. D6-02 remains Pending for later work via #32; D6-03 is now Done through PR #42.

**Validation:** `pnpm check` passed conflict detection, typecheck including 17 negative type examples, lint, formatting and **47 offline tests** (11 workspace + 11 TTL + 9 scheduler + 9 email + 7 persistence). The dedicated database's temporary schemas were verified removed, and its container/volume and local Workers server were cleaned up. Original `.env` content/permissions, RPC fixture, shared-types source, email evidence and stash match the preservation snapshot. Notion MCP boundary sync completed and read back: exact task ID D6-04 remains In progress with the local outcome and deferred provider decision; Decisions mirrors the ADR-003 proposal and evidence links.

**2026-09-08 — persistence spike started (`W1-D6-04`):** Rakha owns this task following [handoff #39](https://github.com/Fatihmaull/evergreen/issues/39#issuecomment-5579179171); primary branch `chore/W1-D6-04-persistence-spike`, based on main `dc0a1e0`, tracked by [Issue #30](https://github.com/Fatihmaull/evergreen/issues/30). All six D6 task IDs and statuses matched Notion before claiming. Scope: platform evaluation, a small PostgreSQL contention/recovery probe, recorded results and ADR-003; hosted provider awaits review. No real engine, shared-type changes or live Stellar transaction. D6-02/03 remain Pending. Earlier email/mirror recovery notes are preserved in a separate documentation commit.

**2026-09-08 — email follow-up published (`W1-D5-04`):** [PR #40](https://github.com/Fatihmaull/evergreen/pull/40) integrates the preserved probe, nine offline tests and original delivery evidence from `chore/W1-D5-04-email-follow-up`, based on main `cdbbb77`, with review requested from @Fatihmaull. [Issue #37](https://github.com/Fatihmaull/evergreen/issues/37#issuecomment-5573281589) accepts the implementation and delivery proof; [handoff #39](https://github.com/Fatihmaull/evergreen/issues/39) requests this follow-up. The old email branch at `470d41c` remains a checkpoint. PR #40 merged on 2026-09-08 as `61fd0da`, closing Issue #37. PR #41 then merged as `dc0a1e0`; CI passed for both merge commits. Local main was fast-forwarded to `dc0a1e0` during this check.

**Validation:** `pnpm check` passed conflict detection, typecheck (including all 17 shared-types negative examples), lint, formatting and **40 offline tests** (7 shared-types + 4 other workspace + 11 TTL + 9 scheduler + 9 email). The configured `pnpm email:smoke` preview returned `status: "dry-run"`, `submitted: false`, and redacted addresses at `2026-09-08T03:24:50.267Z`. The source and tests retain the accepted local implementation; current shared types, their compiler checks and all earlier suites remain intact. Original `send-result.json`, `.env` content/permissions, the RPC fixture, old branches and stash match the preservation snapshot. No new provider request, email, or Stellar transaction occurred during this follow-up.

**Mirror sync — caught up 2026-09-08 from Fatih's session.** `W1-D5-04` and `W1-D6-01/01b/01c` now carry their merge outcomes and PR links in Notion.

**OAuth recovery verified later on 2026-09-08:** Rakha reconnected Notion; this session successfully read and updated the mirror via MCP. All 50 W1 IDs are present in both channels, with no missing or extra row. `W1-D1-03` was the only status mismatch (repo Done / Notion Pending); the committed date-confirmation outcome from PR #38 is now mirrored as Done. The email and three shared-types rows, plus Decisions, were updated and fetched again. Fatih concurrently merged PR #40 and refreshed those merge outcomes through PR #41; the final check confirms the email row says merged and Issue #37 is closed. The earlier OAuth failure is resolved. The original failure note below is historical.

**Next work:** [handoff #43](https://github.com/Fatihmaull/evergreen/issues/43) confirms #30 persistence/locking remains Rakha's task. PR #42 completed the mock RPC; #32 now contains only D6-02 architecture documentation. Per the user's sequence, finish the hosted test and #30 before planning D6-02. ADR-005 remains Proposed; discuss any required shared-type change on #30 before changing the merged types. Shared W1 review follows in [#44](https://github.com/Fatihmaull/evergreen/issues/44).

**Mirror sync was pending (2026-09-08):** Notion MCP rejected OAuth refresh with `invalid_grant` / grant revoked, confirmed again during publication. Pending: `W1-D5-04` follow-up completion and PR #40 link plus merge outcomes for `W1-D6-01`, `01b`, `01c` (PR #36 merged, Issue #29 closed; ADR-005 remains Proposed). Repo work continues; reconnect Notion before retrying the mirror. The existing Done email row reflects the accepted local delivery proof; the finished follow-up is published for review in PR #40. No email merge into main is claimed.

**2026-09-07 — shared types published for review:** [PR #36](https://github.com/Fatihmaull/evergreen/pull/36) publishes `W1-D6-01`, `01b`, `01c` from `feat/W1-D6-01-shared-types`, with review requested from @Fatihmaull. It merged as `41b91d3` on 2026-09-07, closing [Issue #29](https://github.com/Fatihmaull/evergreen/issues/29). The reviewed code is `c1c60ec`; its GitHub CI passed. ADR-005 remains Proposed. [Issue #37](https://github.com/Fatihmaull/evergreen/issues/37) records the completed local email proof and differences from merged PR #35 for validation; the email branch is still held, with no email PR or branch push. Publication sync completed via Notion MCP: the three shared-types rows link PR #36, the held email row links Issue #37, and Decisions records both publication outcomes. Task IDs, statuses and decision text were read back and verified.

**2026-09-07 — shared types final review complete (`W1-D6-01`, `01b`):** corrected a record-shape gap: failures before signer resolution and simulations no longer require an unavailable signer identity. Submitted/succeeded records still require it. The regression examples failed compilation before the correction and pass afterward. Negative examples independently reject a simulated hash, simulated after-state and missing signer on submitted/succeeded records. Repo and Notion matched at review start; both reopened tasks are complete locally again. TTL semantics (`01c`) are unchanged. No remaining blocking finding within this type-only scope. No publication in this review.

**2026-09-07 — shared types complete locally (`W1-D6-01`, `01b`, `01c`):** implemented on `feat/W1-D6-01-shared-types` from `main` `c592d2e`, tracked by [Issue #29](https://github.com/Fatihmaull/evergreen/issues/29). All nine shared types are exported with ledger-key scan/rent maps, explicit TTL availability and lifecycle, payer/signer separation, and bump outcome variants. The JSON config example is checked against typed usage and explicitly selects dry-run. No runtime SDK dependency was added. [ADR-005](adr/ADR-005-shared-domain-types.md) records representation choices as Proposed for review.

**Acceptance answer — can this shape represent one ledger entry serving N contracts, exactly once? Yes.** `ScanResult.entries` maps one canonical ledger key to one `LedgerEntryTTL`, whose `contracts` lists all known input consumers. The synthetic two-consumer example has exactly one code entry and one rent amount; JSON round-trip retains an integer stroop amount above the safe JavaScript number range. This validates representability, not a production deduplication algorithm or real cross-contract RPC discovery. Producers still enforce canonical keys, reference integrity and arithmetic consistency.

**Validation:** final `pnpm check` passed conflict-marker detection, typecheck (including the new test tsconfig), lint, formatting and all **31 tests** (7 shared-types + 4 other workspace + 11 TTL + 9 scheduler). The unmodified recorded Testnet A fixture fits all four entry kinds; synthetic cases cover shared consumers, unavailable TTL, multiple payers and outcome variants. Seventeen negative type examples are compiler-checked; the simulation/hash check now isolates that restriction from the separate after-state restriction. No live RPC read, signing, transaction submission or email was needed for this type-only task. Full data flow (`W1-D6-02`), mock RPC (`03`) and persistence (`04`) remain Pending. PR #36 merged and Issue #29 is closed; ADR-005 still awaits acceptance. Notion final-review sync completed via MCP: `W1-D6-01`, `01b`, `01c` are Done with the updated outcomes, and ADR-005 records the review correction. Read-back confirms all three IDs and the decision text; D6-02/03/04 remain Pending. The proposal remains Proposed for human review. Local `.env` content/permissions, the recorded fixture, held email branch and existing stash match the preservation snapshot; the reviewed 15-file scope contains no configured credentials or secret-pattern matches.

**Email hold history (superseded by the 2026-09-08 follow-up above):** the completed local `W1-D5-04` proof and integration are preserved on `chore/W1-D5-04-email-smoke` at `470d41c` (implementation `699a699`). The email code/evidence from that branch is not included here. Earlier preparation notes below describe main before that local completion. Issue #37 now records the overlap for validation; no email code or evidence files were published, and no additional email was sent.

**2026-09-07 — `W1-D5-03` runtime proof complete:** PR #24 is merged on `main`. Manual run [34110254224](https://github.com/Fatihmaull/evergreen/actions/runs/34110254224) and genuine `schedule` run [34111732199](https://github.com/Fatihmaull/evergreen/actions/runs/34111732199) both succeeded on `5509c44`. Node 24.20.0 / SDK 17.0.1 read A's Testnet instance, with **162,169** and **161,964 ledgers** remaining respectively. Both events and run IDs match the structured output; full logs and GitHub metadata are saved in the [runtime evidence](evidence/2026-09-07-scheduler-runs/README.md) on branch `chore/W1-D5-03-scheduler-evidence`. `pnpm check` passes all 25 tests. Task **Done**; evidence is published for review in [PR #27](https://github.com/Fatihmaull/evergreen/pull/27), with review requested from @Fatihmaull. [Issue #23](https://github.com/Fatihmaull/evergreen/issues/23) remains **open** until merge. No implementation/workflow edit, signing key, or transaction was needed. A single scheduled read proves automatic invocation, not a cadence guarantee or unattended bump. Notion publication sync completed via MCP: both exact task IDs are Done with PR/Issue links; the Decisions page links the published evidence. All updates were fetched again and verified.

**2026-09-07 — `W1-D5-03a` correction complete:** removed the conflict markers and redundant dated paths in `.prettierignore`, retaining the effective `docs/evidence/` exclusion. All 13 scheduler evidence files remain excluded from formatting; scheduler source remains checked. `pnpm check` passes all 25 tests. Tracked in [Issue #26](https://github.com/Fatihmaull/evergreen/issues/26), as a separate commit in [PR #27](https://github.com/Fatihmaull/evergreen/pull/27). The issue remains open until merge; Notion task is Done with the PR link, fetched and verified via MCP.

**2026-09-05 — Testnet environment setup:** local tooling, environment configuration, and account funding are verified. The setup changes are prepared for review; no engine scheduler is running.

**Merged 2026-09-07:** [PR #20](https://github.com/Fatihmaull/evergreen/pull/20) (setup, closing [#19](https://github.com/Fatihmaull/evergreen/issues/19)) and [PR #22](https://github.com/Fatihmaull/evergreen/pull/22) (TTL boundary, closing [#21](https://github.com/Fatihmaull/evergreen/issues/21)). Second-machine/account confirmation remains open.

| Task | Current result |
|---|---|
| `W1-D4-01` · in progress | Node 24.13.0, pnpm 11.25.0, CLI 28.0.0, Rust 1.98.1 + Wasm target verified locally. The rebuilt Wasm matches the deployed fixture. Current tooling confirmation on the second machine remains pending. |
| `W1-D4-02` · in progress | Developer account funded through Friendbot; separate bot account funded with 20 XLM Testnet. Keys remain in ignored local `.env`. The second developer's everyday account designation remains pending. |
| `W1-D4-03` · done locally | Testnet endpoint/passphrase configured and checked; developer and bot key placeholders documented. |
| `W1-D4-14` · done locally | ESLint and Prettier ignore generated Rust output; repository checks pass with build artifacts present. |
| `W1-D4-13` · **done** | **Boundary confirmed:** entry present at ledger **4,529,810** (remaining 0), absent at **4,529,811** (remaining −1). 412 raw responses, offline replay, 11 verifier tests. Confirms the documented inclusive boundary and the `remainingLedgers == 0` trap. |

**Validation:** `pnpm check` passes typecheck, lint, formatting, and the 5 existing placeholder tests. Earlier setup verification passed 3 Rust fixture tests and reproduced Wasm hash `c7e55f0a…bce98bfb`. CLI `ping --send=no` against guinea-pig A returned `"guinea_pig"`.

**Evidence:** two account-funding transactions have full unedited JSON RPC responses and explorer screenshots in [EVIDENCE.md](EVIDENCE.md). The developer and bot public keys are documented in [SETUP.md](SETUP.md).

**Notion:** `W1-D4-13` synced by Rakha via MCP with PR/Issue links, and the Knowledge Base records the verifier. Remaining rows reconciled on merge 2026-09-07.

**2026-09-06 — `W1-D4-13` published for review:** [PR #22](https://github.com/Fatihmaull/evergreen/pull/22) closes [Issue #21](https://github.com/Fatihmaull/evergreen/issues/21). The exact boundary remains confirmed by 412 raw responses. The verifier rejects malformed, unrelated, and duplicate entries; two regression tests failed before the fix and pass after it. `pnpm check` passes typecheck, lint, formatting, 5 existing placeholder tests, and all 11 verifier tests. The PR uses `chore/W1-D4-13-ttl-boundary`, based on `main`, and requests review from @Fatihmaull. Setup PR #20 is unchanged. Notion publication sync completed via MCP: the exact task ID is `Done` with PR/Issue links, and the Knowledge Base links the published evidence and records the 11-test verifier. Both updates were independently fetched and verified.

**Scheduler preparation history:** [PR #24](https://github.com/Fatihmaull/evergreen/pull/24) was published on 2026-09-06 and merged on 2026-09-07. It added the read-only SDK probe, manual/15-minute workflow, and nine offline regression tests. The original [local runtime record](evidence/2026-09-06-scheduler-smoke/README.md) remains preserved. The merged test command retains both TTL and scheduler suites (25 total tests). Current GitHub runtime proof is recorded above.

| Workstream | State | Owner | Task |
|---|---|---|---|
| Product, repo and tooling | Done | F/R/S | W1-D1/02/03; both-machine setup confirmed |
| Stellar foundation | Done; drift continues | F/R | A/B/C, permissionless proof, inclusive boundary; D4-09 through Sep 20 |
| Services and accounts | Done | F/R | npm namespace, Pages placeholder, Actions schedule, email delivery |
| Types, mock and persistence decision | Done | R/F | Shared types/mock merged; unused persistence spike merged #52; Neon adoption deferred to W4 |
| Architecture | Done | R | `W1-D6-02` merged in #53 (`59c3cf8`); broader discovery remains W2-D8-03/04 |
| W1 closeout | Done | R/F | `W1-D7-03/04/05/06` merged in #57 (`88372ec`); merging it *is* the shared acceptance |
| CLI | Initial instance scan complete | F | W1-D7-01/02/07 merged; four-entry coverage in review, PR #60 |
| Engine and dashboard | Future implementation | R/F | Stage 1 engine W3; functional dashboard W4 |
| W1 review and evidence | Reports complete; shared review open | S | 24 indexed txs and fresh scan; D7-04/#44 remains In progress |

## Blocked

*(nothing blocked)*

> Format when something blocks: `**[TASK-ID]** what's blocked · what was tried · what would unblock it · since when`. A blocker sitting here for more than a day gets escalated between Fatih and Rakha directly, not left in the doc.

## Decisions made

| ID | Decision | Date |
|---|---|---|
| ADR-001 | Auto-bump engine runs as a scheduled serverless job (5–15 min), not an always-on service | 2026-09-04 |
| ADR-002 | Policy signer via `stellar/passkey-kit` (Ed25519 + policy scoping); OpenZeppelin as fallback; custom signer contract out of scope | 2026-09-04 |
| **ADR-002 amendment** | **`extendTTL` is permissionless — the policy signer is not what makes Evergreen non-custodial. Week 3 splits: Stage 1 (plain funded account, critical path) / Stage 2 (policy signer, off critical path, still SOW-committed).** | **2026-09-04** |
| ADR-003 (part 1) | Toolchain: Node 24, pnpm workspaces, TypeScript strict, ESLint + Prettier, **Vitest** over Jest | 2026-09-04 |
| ADR-003 (scheduler) | GitHub Actions + Node 24 chosen; local, manual GitHub, and genuine scheduled reads verified. Hosting (D5-02) and atomicity (D6-04) remain open. | 2026-09-07 |
| **ADR-004** | **The user always pays their own extend fees. Apex never subsidises rent, in any phase.** | **2026-09-04** |
| — | Dashboard: **public read-only P0** (scan any contract, no wallet), wallet-connect + user-signed extend **P1** | 2026-09-04 |
| — | Alerting: email in v1, behind a `NotificationChannel` interface so Telegram/webhook are drop-in for SOW 2 | 2026-09-04 |
| — | Official sprint window: 2026-09-03 → 2026-10-02 (supersedes the SOW's suggested 2026-08-17 start) | 2026-09-04 |
| — | **Commits carry no AI attribution.** The contributor list reflects the two people on the team. Enforced in committed `.claude/settings.json` (`attribution`), documented in CONVENTIONS. Existing commits keep their trailer — not worth a force-push. | 2026-09-05 |

## Scope changes from the original plan

All dated 2026-09-04, from the Phase 0 alignment pass. Every one has a reason; none were silent.

| # | Change | Why |
|---|---|---|
| 1 | **`extendTTL` confirmed permissionless** (Stellar state-archival docs: *"There is no access control for TTL extension operations"*). Empirical check queued at `W1-D4-06`. | The plan assumed the engine needed authority over user contracts. It does not. This reshaped Week 3, the payment model, and the dashboard. |
| 2 | **Week 3 split into Stage 1 / Stage 2.** Core loop proven with a plain funded account first; policy signer added after. | The never-cut unattended-bump proof moves ~5 days earlier and stops depending on an unverified third-party library. The old ADR-002 fallback (25–40h of Rust starting Sep 19 against a Sep 22 proof) never closed arithmetically; now it doesn't have to. |
| 3 | **Policy signer restated, not dropped.** SOW-committed; purpose is protecting the *self-hosting user's* hot key, not earning non-custodiality. | The SOW names it in Deliverable 2's description and evidence list. Resequencing is not dropping — Fatih raises the change with Kenny in W1, not at review. |
| 4 | **ADR-004 written: the user always pays.** Three mechanisms (dashboard signature / self-hosted engine / future hosted prepay), one invariant. Apex never subsidises. | Subsidy is unbounded cost and the hosted-billing non-goal in disguise. Now a hard rule in `AGENTS.md`. |
| 5 | **Data model must not foreclose multi-tenancy.** `BumpRecord.payer` distinct from contract; config N contracts × M payers; `Signer` an interface resolved per payer. | A single public engine is the SOW 2 direction. Cheap to preserve on Day 6, expensive to retrofit in Week 3. Design for it; do not build it. |
| 6 | **Dashboard split P0/P1 and the write path added.** P0 public read-only incl. **scan any contract**; P1 wallet-connect + user-signed extend. Overturns ARCHITECTURE's "no write path". | Scanning is a permissionless read, so serving strangers costs ~nothing and makes the instance a real utility. Wallet-connect became necessary for user-signed extends, but stays P1 because Week 4 cannot absorb it. Constraint held: the read-only layer must ship complete on its own. |
| 7 | **Wallet spike pulled forward to `W2-D13-02`**, displacing batch scan (already cut-order #1). | Fatih's day, and the tx-building machinery from `W2-D11` is hot. `W2-D11` is Rakha's day, already 4 tasks, and carries the first required SOW evidence — crowding it risked evidence for convenience. |
| 8 | **Second guinea-pig (B) deployed `W1-D4-04c`**, kept deliberately out of the engine config. | The natural-decay proof needs weeks of aging. Deploying it in Week 3 would be too late. If the engine ever sees it, it will bump it and destroy the evidence. |
| 9 | **TTL floors measured at `W1-D4-04b`.** | Thresholds must be set against real numbers, and the floors decide whether the natural-decay proof is achievable in-sprint at all. |
| 10 | **Evidence rows now require three artifacts** — hash + full JSON + explorer screenshot — plus a `signer` column. | A testnet reset before review makes every explorer link dead. A hash pointing at a chain that no longer exists proves nothing. |
| 11 | **Replanned against 24 effective days** with an explicit 6-day slack ledger; D-numbers frozen as sequence positions with slippable planned dates. | The old plan assigned work to all 30 days including every weekend. Consuming slack is now a visible, logged event rather than silent drift. |
| 12 | **Week 4 reallocated:** `evergreen-check` Action, npm publish, and engine/Action docs move from Fatih to Rakha. | Week 4 was full before the write path was added and nearly all of it was Fatih's. The Week 3 rescope frees Rakha ~Sep 19. **Dependency: if Stage 2 runs long, these come back to Fatih — that is the first sign Week 4 is in trouble.** |
| 13 | **Rent model reads fee parameters from the network** rather than constants validated once. | A constant validated in Week 2 is quietly wrong by Week 4 after any protocol or network movement, and the cost estimate is the CLI's headline feature. |
| 15 | **`W1-D4-00` added: guinea-pig contract source.** Assigned to Fatih, not Rakha. | Work discovered mid-week (hard rule 8): `W1-D4-04` said "deploy a guinea-pig contract" but no contract source existed, and `deploy-guinea-pig.sh` was a stub. Rakha's D4 was already five tasks; writing the boilerplate for him means his day starts on the TTL floors and the permissionless check. |
| 16 | **History rewritten on `main` 2026-09-05.** `c8aea7b "test: protection probe"` removed. | An empty commit created while testing branch protection by actually pushing — before `enforce_admins` was on, admin bypass let it through silently. Removed while the window was cheap: zero clones, one contributor. See the note below. |
| 14 | Root `Evergreen-PRD.md` deleted (byte-identical duplicate of `docs/PRD.md`); bootstrap prompt archived to `docs/archive/BOOTSTRAP-PROMPT.md` with a not-a-source-of-truth header. | A duplicate drifts on first edit. The bootstrap prompt predates the permissionless finding and must never be read as authoritative. |

## `W1-D4-13` — exact boundary observed

The 2026-09-06 temporary entry was present at its final live ledger **4,529,810** (remaining 0) and absent at **4,529,811** (remaining -1). The 412 raw RPC responses confirm the inclusive boundary, consistent with the documented semantics. The [evidence record](evidence/2026-09-06-ttl-boundary/README.md) includes the seed transaction JSON and explorer screenshot. The earlier 189 samples remain unchanged and inconclusive.

The configured minimum is **720 ledgers**; **688** was remaining TTL at an earlier sample. This finding informs `W2-D8-01`. It is a temporary-entry expiry observation; the unattended-bump deliverable remains pending. B/C instance entries and their shared code are unchanged before/after this experiment. No new network transaction was needed during publication review.


## ⚠️ `W1-D6` (Tue Sep 8) matters more than its position suggests

`shared-types` was scoped on Sep 4 and has accumulated three findings since, with no change to its estimate:

1. **`Signer` as an interface** — Stage 1 and Stage 2 drop-in (ADR-002 amendment).
2. **`payer` distinct from contract, config as N contracts × M payers** — keeps the hosted direction open (ADR-004).
3. **`ScanResult` keyed by ledger key, carrying which contracts each entry serves** — the shared-`ContractCode` finding.

Naming the growth because the cost curve is steep: **an hour on Tue Sep 8, a simultaneous refactor across CLI, engine and dashboard in Week 3.**

**The third is a shape inversion, and it is the one to get right.** The instinctive model is contract-centric — a contract with its entries hanging off it — and that shape *structurally cannot* represent one entry serving twelve contracts without duplicating it. Which is exactly the bug we found on Sep 5.

The primary collection must be keyed by ledger key, with the contracts it serves as a property of the entry. Contracts are the input to a scan and a back-reference on the output.

> **Acceptance check, to be answered explicitly here before `W1-D6-01` is marked done:**
> *Can this shape represent one ledger entry serving N contracts, exactly once?*

Get it wrong and the rent double-count, the severity error, and the dedupe bug are all inherited downstream — then found and fixed separately, late.

## 📉 The `W1-D5` hosting decision (Mon Sep 7) is lower-stakes than when it was written

`W3-D18-00` gives us the real engine code running on a GitHub Actions cron. That is not only a fallback for the Sep 19 gate — it is a **proven floor**. Actions cron plus a hosted database is a viable production answer, not an emergency one.

So it has to be *reasonable*, not *right*. SDK runtime compatibility stays the first filter — a platform the SDK cannot run on fails before cost or ergonomics matter — but it is **timeboxed to one afternoon**. If Cloudflare's `nodejs_compat` story for the Stellar SDK is not settled by then, that ambiguity *is* the answer for a 24-day sprint: take Railway for the plain Node runtime, or defer and let the Actions runner carry it.

## 🔎 Week 1's most consequential finding: contracts share code entries

**Contracts deployed from identical Wasm share a single `ContractCode` ledger entry.** Found while staggering guinea-pigs B and C, which turned out to share one.

**Why it is a product finding, not a fixture detail.** Deploying N contracts from one Wasm is the factory pattern — per-user vaults, per-pair pools, per-market instances. One entry expires and every instance breaks simultaneously, while a naive per-contract scan reports each as healthy right up to the moment they all die together. That is the worst possible shape for a monitoring tool: confidently green immediately before a total outage. We found it because two test contracts happened to share a Wasm; a user finds it in production.

**Four requirements now tracked, not one footnote:**

| Requirement | Where |
|---|---|
| Dedupe by ledger key; `ScanResult` carries which contracts each entry serves | `W2-D8-04` |
| Rent summed per unique key — a per-contract sum charges a factory deployment N times | `W2-D9-01` |
| Severity weighted by blast radius — a shared entry at 3 days is N contracts at 3 days | `W2-D10-01` |
| Sharing visible in CLI output and dashboard, not just optimizer advice | `W2-D10-01`, `W4-D23-01` |

Plus **within-run** idempotency as its own task (`W3-D16-02b`) — distinct from the across-run overlapping-scheduler case and not covered by it.

**Positioning is being measured, not assumed** (`F-01`, a *floating* task — no day, nothing depends on it): how often do deployed testnet contracts actually share code entries? Common → headline capability and it leads the demo video. Rare → correctness requirement and a footnote. Never done → the demo leads with something else, which is fine.

## 🔄 Dual-channel sync — live from 2026-09-05

Evergreen is now tracked in two places. **The repo is canonical; Notion is a mirror.** Truth flows repo → Notion, never the reverse. Only agents write to Notion — Fatih and Rakha read it, so any disagreement is an agent error, never a human update to respect.

Workflow is in `AGENTS.md` § Dual-channel sync; the status vocabulary is in `docs/CONVENTIONS.md`. Sync happens at boundaries only — session start, session end, PR merge — never per commit.

**The board is agent-write / human-read.** Fatih has posted that rule at the top of the Project Brain page, addressed to both humans by name: ticking a box there will be silently reverted, task state changes go through the repo, and prose in the Knowledge Base and Decisions pages is theirs to write freely — nothing syncs over that. Noted here because the rule only holds while it is visible *where a person is standing when they are tempted*, and `AGENTS.md` is read by agents, not by Rakha.

### Sync anomaly log

Discrepancies in **either** direction get logged here with date and task ID. **Two in one week means the workflow itself is suspect** — we are now at three, one authored by each session and one by the repo session on Sep 10.

> **Why the presence diff exists, with a real catch attached.** `AGENTS.md` § A step 2 says to *"diff on presence, not only on status"*. On 2026-09-10 that rule caught `W1-D7-08`, and **a status-only check would have reported green** — all 50 rows present in both channels agreed on status and owner. The divergence was not a wrong row; it was a missing one, and a status comparison can only compare rows that exist on both sides. *Cited here rather than left as a rationale, because a rule with a catch attached survives review in a way a rule with an argument does not.*

| Date | Task | What | Resolution |
|---|---|---|---|
| 2026-09-10 | 15 rows, incl. `W3-D15-03`, `W3-D18-02a`, `W3-D18-02c` | 🔴 **Fifth anomaly — the mirror was systematically losing CREATED-but-untouched tasks.** § D said *set Status on every task you touched*; creating a task and touching one are different events, and only the second triggered a write. A task added on a day nobody worked it never reached Notion — and was then invisible to every status, owner and title check forever, because all three can only compare rows present on both sides. Three separate discoveries, one mechanism: `W1-D7-08`, `W4-D24-04`, then twelve more. The three older ones were orphaned by the Week 3 restructure — **the same incident that produced the title divergences and the retired ~~W3-D18-02~~, now with three distinct symptoms.** Two further rows (`W3-D18-02d`, and `W3-D21-01d/e` earlier) were invisible to the task-ID checker as well, because its suffix pattern was `[0-9a-c]`. | All 15 created. **Four-field read-back: 145 repo IDs, 145 Notion live rows, zero missing, zero phantoms beyond the two awaiting manual deletion, zero status or owner disagreements.** Also corrected 10 status/owner rows found by that read-back — 8 W3 owners were still wrong after the titles were fixed, because an owner-only divergence passes a title check exactly as a title-only divergence passed the owner check. `AGENTS.md` § D now requires creating a row for every ID *added*, and running the presence diff across **all** rows at every session end. |
| 2026-09-10 | `W2-D13-02/03`, all of W3, part of W4 | 🔴 **Fourth anomaly, and a divergence class nothing was checking: the TITLE.** A row can carry the right ID, right status and right owner while describing different work — and that reads green on every check we have. Worse than the other three, because ID/status/owner drift makes something look *wrong*, while a wrong title makes it look *right* pointing at the wrong task. Found because Fatih read `W2-D13-02` from Notion and instructed a cut of the batch scan; the repo has `-02` as the wallet-connect spike. **22 title divergences and 3 phantom rows across 115 rows.** Root cause is not one build error: the Week 3 two-stage restructure **repurposed IDs in the repo** — the incident that produced six wrong `EVIDENCE.md` rows and the retire-never-repurpose rule — and the repo was corrected while **the mirror never was**. `W2-D13-02/03` is separate and was a build-time swap. | `W2-D13-02/03` corrected and read back. **W3/W4 held for Fatih's decision** — 22 rewrites plus 3 phantoms, one of which (~~W3-D18-02~~) is a *formally retired* ID still live in Notion, so whether phantoms are deleted or marked Dropped is a real choice. Title comparison is now part of the mirror diff. |
| 2026-09-10 | `W1-D7-08` | **Repo ahead of Notion — a missed write, and the third anomaly this week.** The task was added to `BACKLOG.md` on Sep 9 as unplanned corrective work and the mirror row was never created. Repo 51 W1 rows, Notion 50. **A status-only check would have read green:** every one of the 50 shared rows agreed on status *and* owner, so nothing was wrong with any row that existed — the divergence was a row that did not. | Row created and **read back**: Notion now returns 51 W1 rows, 50 Done, 1 In progress, matching the repo on ID, status and owner with zero phantoms. Authored by the repo session, recorded rather than backfilled silently. |
| 2026-09-05 | `W1-D4-04d` → `W1-D4-07` | **ID divergence, not a false claim.** Notion had guinea-pig C as `W1-D4-04d` (following the 04b/04c pattern); the repo calls it `W1-D4-07`. Same work, genuinely done, two identifiers. | Notion renamed to `W1-D4-07`. Repo canonical. **This is the more dangerous failure than a wrong status** — the ID is the join key, so a divergent ID silently breaks every future sync on that row rather than showing up as a visible mismatch. |
| 2026-09-05 | `W1-D4-09` | Notion "In progress", repo `[ ]`. | **The repo was wrong, not Notion.** The drift check has started and runs until Sep 20. Repo corrected to `[~]`, and `CONVENTIONS` now states that recurring work is `[~]`. *Repo-canonical means the repo is where truth is authored — not that it is always right. When the mirror reveals a repo error, fix the repo, then sync.* |

### The workflow's first catch — the other side of the cost ledger

`W1-D4-10` shipped in PR #7's title and commit subject but had **no checkbox row in `BACKLOG.md`** — only prose mentions. A task ID used in shipped work with nothing registered against it: a quiet violation of hard rule 8, committed by the agent that wrote the rule down.

**It was found only because Notion had no row to match.** No amount of reading `BACKLOG.md` would have surfaced it, because the file was internally consistent — the gap was invisible from inside. That is precisely the one job a second surface exists to do: catch what a single source cannot see about itself.

Recorded here deliberately alongside the cost. The sync runs **~3–4 minutes per session** of wall clock, plus roughly **35k tokens** of Notion tool schemas loaded per session — a context cost, not a time cost, and the one more likely to bite. On day one it returned one repo defect, one ID divergence, and one repo error the mirror was right about. Both sides of that ledger get reported at the `W1-D7-05` gate, not just the pleasant one.

## ✅ W1-D4 is complete — reproducibility proven, not asserted

`W1-D4-01/02` closed 2026-09-07. Every Day-4 task is now done.

**The evidence that matters is the hash, not the version strings.** `stellar contract build` produced Wasm `c7e55f0ad89efb0600bc15048b155099fa4d97cee16466fa1244b3dcbce98bfb` on **both** machines — byte-identical to the deployed guinea-pig. Matching `--version` output only suggests reproducibility; a matching hash demonstrates it.

Node differs by patch (Rakha 24.13.0, Fatih 24.20.0) and that is deliberate: `.nvmrc` pins the major, and pinning a patch buys churn rather than safety. If a patch ever *does* change build output, the hash comparison is what catches it — which is the argument for comparing hashes in the first place.

Fatih's everyday account `fatih-dev` — `GA66NAB6SLNZY737IXYHSZCO53EX5R3INKGJW34VRH3RNLAVIA456TJW` — is funded and verified live on Horizon. Secrets stay in each machine's `~/.config/stellar/` and have never entered the repo.

## ✅ ADR-005 accepted · `W1-D6-02` merged · W2–W4 carry-forward confirmed

**W1 is 45/50 done.** Only the review-gate tasks remain, and Rakha has them drafted.

### ADR-005 — accepted, with what was actually endorsed

Three things carried it, recorded in the ADR so a future reader does not re-derive them:

- **Money as integer decimal text.** Stroop values above `Number.MAX_SAFE_INTEGER` round *silently* as JSON numbers, and a rent estimate that is quietly wrong is worse than one that fails. The cost — consumers must convert before arithmetic — is the right trade: an explicit conversion is visible, a silent rounding is not.
- **Explicit variants over sentinels.** `known`/`unavailable`, `simulated`/`submitted`/`succeeded`/`failed`. This is what keeps "no TTL" structurally distinct from "expiring now" — they collapse into `0` under any nullable-number model, and that collapse is the exact bug class this project keeps finding.
- **The signer seam is explicitly NOT a security boundary.** A seam described as security but not enforced as security is worse than no seam, because it invites trust it cannot carry.

Its **downstream sweep** says plainly that this decision changed no dependency — stated rather than left blank, because an unconsidered sweep and an empty one look identical.

### Carry-forward — the temporary-entry question was entangled, so it is split

`W3-D15-02b` **stays in Week 3** rather than being settled early. But two decisions were riding on one ID:

- **Reporting** a temporary entry near deletion is a **W2** concern and is **not open**. Deletion is unrecoverable, so imminent deletion is high severity **whether or not we ever auto-bump.** W2 must not wait on this.
- **Auto-bumping** one is genuinely open and stays in W3, because the threshold work is what makes the trade concrete.

Nothing in W2 depends on the second, which is why settling it early buys nothing — and separating them is what stops W2 stalling on a decision it does not need.

### The two dates that matter now

Both before **Fri Sep 18**, and both exist because a silent skip is the dominant failure mode:
- **`W2-D10-04`** — the run exits non-zero when it sees an entry below threshold and did not bump it.
- **`W3-D17-05`** — Stage 1 failure modes (RPC timeout, insufficient balance, missed run) each alert rather than failing silently.

## 🔍 `pnpm check:task-ids` — the ID checker is now mechanical, and found four more

Rakha's W1 closeout noted that guinea-pig C's evidence row pointed at *"an unregistered alias."* He was right: **`W3-D18-02c` existed in `EVIDENCE.md` and had no task behind it** — I invented it when adding C's row.

**My earlier ad-hoc check missed it because it only matched backtick-delimited IDs, and this one was bold.** Same defect class as the case-sensitive duplication checker: the verification tool failing in the safe-looking direction. So it is a real script now, matching any delimiter, wired into `pnpm check` and CI.

It found three more beyond C's:

| ID | Where | Cause |
|---|---|---|
| ~~W3-D18-02~~ | `ARCHITECTURE`, `CONVENTIONS`, `ADR-001` | Another Week 3 renumbering casualty — the double-bump promise is `W3-D16-02` |
| ~~W2-D12-02b~~ | `PRD` | Renamed to `F-01` when floated; I fixed `STATUS` and missed `PRD` |
| `W3-D18-02c` | `EVIDENCE` | Now **registered as a real task** — C's spare proof is real work |

### It caught me on its own PR, twice over

CI failed on the very PR that added this check — and the reason is worth recording twice.

**First:** the STATUS table above quotes the retired IDs while explaining them. To the checker that is indistinguishable from a live reference. Fixed with a marker convention: **strikethrough means "retired, quoted deliberately"** — semantically exact, readable to humans, and documented in `CONVENTIONS` with the warning that using it on a *live* reference converts a caught bug into a hidden one.

**Second, and worse:** I had been verifying with `pnpm check && echo PASS`. **On failure that prints nothing**, and I read the silence as noise rather than as failure. I was also on `main` rather than the branch, so what I did check was the wrong tree. CI caught both.

`cmd; echo "exit=$?"` is now the recorded idiom — a number is always printed, so there is no silent case. **Fifth member of the reported-vs-actual family, and this one was my own verification lying to me.**

### What it catches, and what it deliberately cannot

✅ **Dangling** — an ID referenced but not registered.
❌ **Repurposed** — an ID that exists but now means something *else*.

The second is the more dangerous one and **nothing cheap detects it**, which is exactly why `CONVENTIONS` says retire an ID rather than repurpose it, and why the ADR template demands a downstream sweep. This check is the floor, not the ceiling — and the script says so.

**It skips `STATUS.md`'s session log by design.** A log is an append-only historical record; quoting an ID that has since been retired is *correct* there, and rewriting history to keep a checker quiet would destroy the thing the log is for.

## 🎯 ADR-003 restructured — the decision rests on one leg, and now says so

Rakha's three corrections were all right, and they narrowed **three of the four arguments** originally given for deferring the database. The decision did not change, because it never rested on them — but the ADR did not say that, and a Week 4 reader could have dismantled the decision by refuting the parts that were already weak.

| Argument | Status |
|---|---|
| Neon exhausts on Sep 20 | **Overstated** — an upper bound assuming ceiling-rate compute, not a prediction |
| Supabase pooler breaks advisory locks | **Does not apply** — the spike uses conditional row writes |
| Overlap is structurally impossible | **Partly wrong** — true of the scheduler, not of chain state |
| Ledger is idempotent + the cost asymmetry | **Stands** |

ADR-003 now labels them: **🟢 LOAD-BEARING** (the ledger is the idempotent source of truth; a fail-closed lock in front of a single-shot deadline inverts the risk) and **🟡 SUPPORTING — individually refutable** (both unmeasured quotas, and the scheduler guard).

**A decision defended by four arguments where three are weak is more fragile than one defended by a single argument that holds** — because refuting any of the three feels like refuting the decision.

### The in-flight gap is stated, not left to be rederived

"Overlap is structurally impossible" is on record as wrong, so the ADR now says the correct version outright. A concurrency group serialises *runs*, not chain state. The case it skips: **a run submits, dies before confirming, and the next run cannot tell whether it landed.**

**W1 review clarification:** current TTL answers whether another extend is needed, not whether a specific transaction landed. A low TTL can coexist with a pending send. Reconcile the known hash and its validity bounds before constructing a new transaction; `NOT_FOUND` alone is not a terminal result. Uncertain work remains submitted. See ADR-003 for the distinction between resending the same envelope and creating a new transaction.

### The divergence family is now a named pattern, not anecdotes

Four instances this sprint, same shape: something reported a state, the real state differed, and only the real state was checkable. `CONVENTIONS` carries them as a table — testnet guard, `pnpm check` vs CI, `.prettierignore`, Cloudflare's deploy UI — with the instruction to **add the fifth there rather than treat it as a fresh surprise.**

The reports are not lying; they measure something adjacent and present it as the answer.

## ✅ `W1-D5` closed — npm org owned, dashboard live

**npm: we own the ORG, not just a name.** `evergreen` was squatted, so instead of reserving an unscoped fallback Fatih took the scope: **`evergreen-stellar`**. That is strictly better than the plan — nothing in `@evergreen-stellar/*` can be squatted, no placeholder publishes are needed, and **the Sep 16 deadline pressure is gone.** The name should still land before `W2-D14-03`'s screenshots, but it is no longer a race.

Packages renamed to **`@evergreen-stellar/cli`** and **`@evergreen-stellar/core`**, with `shared-types` moved too — it is private and never published, but it sat in a scope we do *not* own, which is a trap if anyone ever flips `private: false`.

> ⚠️ **`publishConfig: { "access": "public" }` is now set in both published packages.** Scoped packages default to **private**, and private requires a paid plan — without this `W4-D27-02` either fails outright or silently ships a private package. It lives in `package.json` rather than depending on someone remembering `--access public` on the day.

**The command is unchanged.** `bin` maps to `evergreen`, so only the install line moves to `npx @evergreen-stellar/cli`. Propagated to both READMEs, the backlog, and the demo script task.

**Cloudflare Pages: live at https://evergreen-stellar.pages.dev** — verified HTTP 200 serving our page, not the dashboard's word for it. Which turns out to be the point:

### Two operational findings, both recorded in `SETUP.md`

**Cloudflare's deploy UI misreports progress.** The build log showed success at 17:30:06 while the step indicator sat on *"Initializing build environment"* for another **1 minute 34 seconds**, later steps showing `—`. From the dashboard alone you would conclude it had hung. **Verify a deploy by loading the URL, not by reading the dashboard** — the reported state and the actual state diverged, and only the actual state was checkable. Third family member after the testnet guard and the weaker-than-CI local gate.

**The Cloudflare account is shared, and Workers quota is account-wide.** It already runs `focustudio.online` and a Worker called `focuswebstudio`. Irrelevant to Pages; **relevant to ADR-003**, because Workers free-tier limits are per *account*, so an existing Worker already consumes part of any engine budget. **That is now two providers and two unverified quota assumptions** — Neon's autoscale ceiling and this — both belonging to the Week 4 revisit.

### Two new tasks, both sequenced before the first publish

- **`W4-D27-00`** — enable 2FA on the npm account. Currently disabled, and a public scope other people install from with an unprotected account is a supply-chain risk. Cheapest now, while nothing depends on the scope.
- **`W4-D27-00b`** — invite Rakha to the org. Publishing moved to him in the Week 4 rebalance and he cannot publish to the scope without membership. Blocked on his npm username, tracked so it does not surface on Sep 29.

## 🔴 Orphan sweep found a real sequencing bug — Stage 1 failure modes sat AFTER the proof

The retroactive sweep over W2–W4 was worth running. The headline:

**`W3-D20-02` — *"Failure modes: RPC timeout, insufficient balance, policy rejection, scheduler missed run. Each must alert, not fail silently"* — was scheduled for Day 20 (Tue Sep 22).** Guinea-pig B's crossing is Day 18 (**Sun Sep 20**). So the alerting for the failures that can occur unobserved during the Sunday window was scheduled **two days after that window**, inside a block the backlog itself labels *"Stage 2, off the critical path."*

Three of its four failure modes are Stage 1 concerns. Nothing was wrong when written — Day 20 *was* the proof day before the two-stage rescope moved it.

**Fixed:** the three Stage 1 modes are now **`W3-D17-05`, due before Fri Sep 18**. `W3-D20-02` keeps only *policy rejection*, which is genuinely Stage 2 and does not exist at all if the spike goes no-go.

### The root cause is mine, and it has a rule now

Restructuring Week 3 **reused task IDs for different work.** `W3-D16-01` stopped meaning "policy-signer e2e" and started meaning "bump execution"; `W3-D19-03` stopped meaning "alert emails" and started meaning the spike.

Every ID still resolved, so nothing looked broken — while **`EVIDENCE.md` filed six rows against the wrong tasks** and `POLICY-SIGNER.md` claimed a due date belonging to the slack-ledger reconciliation. All repointed.

**A dangling ID is detectable; a repurposed one is not.** A script can check that every referenced ID exists — and one now does, which is how the last stale reference was found. Nothing cheap can check that an ID still *means* what the referrer thought. So `CONVENTIONS` now says: **retire an ID, never repurpose it.** A gap in the sequence costs nothing.

### Also fixed

- **`W4-D24-03`** claimed *"cut order #3"* while the canonical list in the same file said #4 — the write path took #3 when it was added. Exactly the improvisation the "never improvise the cut order" rule exists to prevent, pointing at the wrong item under pressure.
- **`W2-D11-01`** said the developer key is *"not the policy signer yet"* — implying a replacement that is no longer coming. It is the signing path Stage 1 ships and the README teaches.
- **`W1-D4-04c`** still pointed guinea-pig B at the pre-rescope proof ID, which now means something else. Repointed to `W3-D18-02b`.
- **ADR-002's** body carries pre-rescope IDs. Left as written — an ADR records the reasoning we had at the time — with a mapping note at the top rather than a silent edit.

## 🧹 "Downstream sweep" is now the last step of every ADR

The two orphaned Week 3 tasks were not a one-off. **Every decision that changes a dependency leaves orphans downstream** — the decision gets made carefully, gets its ADR, gets synced to both channels, and two tasks three weeks out quietly keep assuming what just changed. Nothing fails. They describe a world that no longer exists, and it surfaces only when someone tries to do them, which here would have been Sep 18.

So it is a step rather than an instinct. Added to the ADR template in `docs/adr/README.md`:

> **Downstream sweep.** List every task in `BACKLOG.md` whose description assumes what this decision changed. Update their wording, or record why each still stands.

Cheap at the moment of decision, when the changed assumption is fresh. Expensive at every other moment.

**A retroactive sweep is running now** over W2–W4 and the Buffer, one lens per superseded decision — the Week 3 two-stage rescope, the dashboard P0/P1 split, the database deferral, and the permissionless/payment-model finding — plus a completeness critic for the decision or task class the lenses miss. We caught the database orphans; there is no reason to assume the earlier three were clean.

## 🔧 The deferral broke two Week 3 tasks — resequenced

Deferring the database to Week 4 left `W3-D16-02` and `W3-D16-03` assuming a store that will not exist on Sep 20. Caught while recording the decision, not after.

- **`W3-D16-02`** no longer means *"build a lock."* Overlap is already structurally impossible via `concurrency:` + `timeout-minutes: 5` under a 15-minute cron, so Week 3's job is to **verify that guarantee for the real engine workflow, in both directions** — that a second run genuinely queues rather than races.
- **`W3-D16-03`** persists **without a database**: `BumpRecord` to the Actions step summary and an uploaded artifact, plus the tx hash into `EVIDENCE.md` the same day. Evidence-grade, no service, cannot be cold on a Sunday.

## ⚠️ The unmeasured Neon ceiling — written down as a task, not left as a comment

The arithmetic swings entirely on the autoscale ceiling: **0.25 CU fits (60/100), 1.0 CU exhausts on the crossing date.** We never measured it.

**Deliberately not measuring it now** — it cannot change the decision, and spending the five minutes would imply it might. The decision rests on three things that hold at any ceiling: the lock guards a case that cannot occur, the ledger is already the idempotent store, and the asymmetry runs backwards.

But it is now `W4-D26-05`, sequenced **before any migration runs**, and ADR-003 carries a warning addressed to whoever reads it in Week 4: *the deferral was about when, and the reasons were never only about quota.* An unmeasured assumption written down is a task; left in a comment it is a trap.

## 📖 New convention: run it, don't only read it

Recorded in `CONVENTIONS` because of how this week's finding actually happened.

Static reading said `claim()` can never take over a `pending` row — true, and reported as a deadlock bug. **Executing it meant being inside `persistence-store.mjs`, next to `prepare()`'s comment: *"Pending work never expires into a new send."*** The behaviour was deliberate and fail-closed, working exactly as designed.

Running it was requested so the finding would be undeniable rather than arguable. It turned out to reveal the finding was **mis-framed** — which is a stronger argument for the practice than the one it was requested under. *Executing code puts you in contact with intent that reading a diff does not.*

Three things changed: accuracy (*"you missed line 116"* would have been wrong), the **kind** of fix (a lease timer — the obvious repair for a deadlock — would reintroduce the exact double-send the design prevents), and how it lands on a person.

## ✅ ADR-003 decided — and the database waits until after Sep 20

**Runtime: Actions cron + Node 24. Persistence: PostgreSQL on Neon, adopted Week 4, deliberately not before the crossing.**

Rakha's spike asked for a provider choice. Independent analysis said the question was slightly wrong — the issue is *when*, not *which*.

**The arithmetic.** Cron is 4×/hour = 2,880 runs/month. Neon's free plan suspends after a 300s idle window that cannot be disabled, so every run bills the full window: **240 compute-hours against a 100-hour allowance.** At a 1.0 CU ceiling that exhausts on **day 12.5 — Sep 20 itself**, as a hard stop, with no free-plan warning and no reset until after the deadline. It would remove Sep 20 and Sep 25 together. The outcome depends on the autoscale ceiling, which we never measured — **and that uncertainty is the argument**, not a detail to resolve later.

**The deeper reason.** The lock guards a case that cannot currently occur: `scheduler-smoke.yml` already has `concurrency:` with `cancel-in-progress: false` and `timeout-minutes: 5` under a 15-minute cron, and `packages/engine` is still a placeholder. More fundamentally, **the ledger is already the durable atomic store** — after a bump, `remainingLedgers` is above threshold, so the next run skips naturally. The decision is idempotent without a lock.

**The asymmetry that settles it.** A double bump costs a few testnet stroops and damages no evidence. A cold or paused database on a Sunday costs the grant's least recoverable proof. B's 24-hour window is ~96 independent attempts; a held claim converts all 96 into one. **The scheme is fail-closed where our risk demands fail-open.**

### Two defects reproduced, not just read

Run against the spike's own code on local Postgres 16.15:

| | Finding | Measured |
|---|---|---|
| 1 | `pending` is terminal — `claim()` takes over only `phase='claimed'`, `prepare()` sets `'pending'` | **0 non-null returns from 100 `claim()` attempts** past lease expiry |
| 2 | `history` CHECK forbids `outcome != 'succeeded'` | `failed` rejected by constraint; `succeeded` inserts |

**Defect 1 is deliberate, and reporting it as a slip would have been wrong.** `prepare()`'s comment reads *"Pending work never expires into a new send"* — it is fail-closed on purpose and works against that goal. The consequence he had not traced is that `pending` has no reconciliation path, so the fix is `getTransaction()` reconciliation rather than a timer, which would reintroduce the double-send it prevents.

Both are recorded on `W3-D16-03` as adoption prerequisites so they cannot be inherited quietly in Week 4.

### What ships instead — `W2-D10-04`, before Sep 18

**The run exits non-zero when it observes an entry below threshold and did not bump it**, including a held claim. The dominant failure mode is a run that does nothing and looks exactly like a run that succeeded; this makes it loud. It now outranks everything in W2 that is not the CLI.

## 🔄 Mirror synced 2026-09-08 — one anomaly, and the repo was wrong again

Validated all 50 W1 rows in both directions. **50/50, no presence mismatches**, one status discrepancy:

| Task | Repo | Notion | Resolution |
|---|---|---|---|
| `W1-D6-04` | `[ ]` Pending | In progress | **Notion was right.** Rakha's spike branch has three commits pushed. Repo corrected to `[~]`. |

**This is the second time Notion has been right and the repo stale** — `W1-D4-09` was the first. Both times the correct move was repo-first-then-sync rather than mechanically "correcting" the mirror, which is the exception installed in `AGENTS.md` § A after the first occurrence.

Worth noting the pattern rather than just the instance: **both cases were work that had genuinely started but hadn't produced a merge yet.** The repo records state at commit boundaries; work in flight lives in the gap. That is not a flaw in the rule, but it does mean a `[ ]` on an actively-worked task should be read as *"no commit yet,"* not as *"nobody has started."*

Notes brought current on the four rows that changed materially: `W1-D7-01` (the gate), `W1-D6-03` (mock), `W1-D5-01` (deadline correction), `W1-D6-04` (spike + the persistence/hosting caution).

## 🔴 `W1-D5-01` npm deadline is **Sep 16**, not Week 4 — corrected

I had this wrong. The package name is not just a publish-week concern.

It appears in the README quickstart, `docs/ONBOARDING.md` and the demo script — and **`W2-D14-03` captures CLI screenshots on Sep 16 as evidence snapshot #2.** Screenshots showing `npx evergreen` against a published name of `evergreen-soroban` are wrong evidence, retaken during publish week. That is precisely the expensive version this task exists to prevent, arriving eight days earlier than I said.

**Order matters too: npm before Cloudflare.** Cloudflare will succeed; npm can *fail*, because the name may be unobtainable. Do the thing that can fail while there is still day left to react.

## ⚠️ A Cloudflare account does not decide persistence

Recorded in ADR-003, because the pull is obvious once the account exists.

| Part | Status | Blocked on the SDK question? |
|---|---|---|
| Dashboard hosting | **Settled — Cloudflare Pages** | No — Pages is static and never touches the SDK |
| Engine runtime + persistence | **Open; Actions + Node + PostgreSQL proposed** | Full Workers engine compatibility remains unverified; local SDK reads have passed. |

The [existing local Workers result](evidence/2026-09-08-persistence-spike/README.md#workers-read-path) answers import, instance-key XDR and Testnet reads. Deployment, cron, signing and D1 remain unverified. Fatih's one-afternoon evaluation limit still applies; Actions remains the proven scheduler fallback. This follow-up requests agreement on retaining Actions + Node with PostgreSQL rather than claiming the full Workers path is proven or that the timebox has elapsed.

## 📋 Where W1 actually risks slipping — not the account tasks

The milestone gate is met, so **W1 does not slip on the gate.** Fatih's four remaining items total ~20 minutes.

It slips on two things, both Rakha's: **`W1-D6-04` persistence (ADR-003)**, which blocks Week 3, and **`W1-D6-02` architecture data-flow**, not started, which is what makes `shared-types` legible to whoever touches it next. A spike branch for the first is pushed and in flight.

**At the review, say plainly whether those two close.** If not: name which W2 day absorbs them and what moves out to make room. *"D6-02 slides to Thursday and batch scan goes"* is a decision; letting it ride along quietly is not.

## 🎯 W1 MILESTONE GATE MET — 2026-09-08, a day early

The gate: *"if `scan` doesn't return real testnet data by end of Sep 9, W2 starts with this task and the first P1 item gets cut."* It does.

```
$ evergreen scan CANZNTAW7DYM…XL6L
instance  AAAABgAAAA…
  contracts:  CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
  remaining:  148,875 ledgers — live
  ends at:    ledger 4,712,648
  observed:   ledger 4,563,773
```

`4,712,648` is exactly what A's instance was extended to on Sep 5 — the number the CLI computes matches independently recorded evidence, which is a stronger check than "it printed something."

**No P1 item is cut.** The cut order is untouched.

### What landed

- **`W1-D7-01`** the vertical slice: CLI → core → real testnet RPC. `core/rpc.ts` is the only file that imports the SDK, behind a `LedgerEntryReader` interface, so everything else tests offline.
- **`W1-D6-03`** the **mock RPC client** — promised in the docs since day one and never actually built, which the onboarding fresh-eyes test caught. It replays the recorded fixture rather than invented data, returns *only* keys it was asked for, and can be told to omit entries or fail. Absence and transport failure are first-class cases; a mock that only returns happy-path data tests nothing.
- **`W1-D7-02`** fixture tests against the unedited 2026-09-05 recording, asserting the inclusive boundary from `W1-D4-13` and that an absent `liveUntilLedgerSeq` never arrives as 0.
- **`W1-D7-07`** duplication check — no drift.

**Exit codes verified in all four directions** (0 healthy / 1 below threshold / 2 error / 2 usage). That contract is the `evergreen-check` Action's entire interface, so it is now locked by tests rather than by intention.

**63 tests** on `main`.

### Two things worth recording honestly

**My first duplication check was wrong.** It used a case-sensitive match and reported `dry-run` missing from both documents. The docs were fine; the *checker* was broken, and it failed in the safe-looking direction — it would have sent someone hunting for a problem that did not exist. A verification tool can have the same defect as the thing it verifies.

**I also mis-measured the exit codes at first**, reading `$?` after a pipe and getting `tail`'s status instead of the CLI's. Both codes were correct all along. Measure the thing, not the pipeline around it.

### Ownership drift corrected

`W1-D6-04` read `(F)` in the backlog while issue #30 assigned it to Rakha; `W1-D6-03` read `(F)` while #32 assigned it to Rakha, and Fatih has now taken it back deliberately. Owners were written into issues without updating `BACKLOG.md` — the same divergence class the dual-channel discipline exists to prevent, caused here inside the repo rather than between repo and mirror.

## 🔁 New rule in `AGENTS.md`: push the branch as soon as work starts

**On 2026-09-07 the same email task was built twice.** Rakha had `W1-D5-04` working on a local branch; I built `scripts/send-test-email.mjs` a few hours later without knowing, because that branch had never been pushed.

Nobody did anything wrong by the rules as written. That is what makes it worth a rule: **the repo is canonical, but only the *pushed* repo is visible.** The dual-channel sync cannot catch what does not exist on the remote, and neither can a person reading the repo.

So: push the branch as soon as work starts — unfinished, failing, WIP. A branch name on the remote is enough. Stacking is fine; reconciling three open PRs takes minutes, rebuilding someone's work takes a day.

**`W1-D5-04` is resolved in Rakha's favour.** He had already sent a real test email (HTTP 200, confirmed inbox receipt) — the task is complete. And his script previews by default and requires `--send`, where mine sent on invocation. Hard rule 6 is written about transactions, but the shape is identical: an irreversible outward action on plain invocation is exactly what that rule guards against. His version is the one consistent with our own conventions, and the `--send` guard is now on `main`.

**No mailbox screenshot, no second send.** The three-artifact rule is scoped to testnet transactions; an email has no hash, no JSON RPC response and no explorer page. Alert screenshots are real evidence but belong to `W3-D19-03`, when there are bump-success and bump-failure alerts worth capturing.

## ✅ `W1-D6-01` merged — the shape inversion landed correctly

PR #36. `ScanResult.entries` is keyed by canonical ledger key with `contracts` as a back-reference on each entry, so one shared code entry and its rent are represented once for N contracts. Acceptance answer recorded, and honestly scoped: it validates *representability*, not a production dedupe algorithm.

Two things in it are better than what the issue asked for:

- **`endBehavior` is bound to `kind` in a discriminated union** — `temporary → 'deleted'`, `instance|code|persistent → 'archived'`. "A temporary entry that gets archived" is structurally unrepresentable rather than merely discouraged.
- **`endsAtLedger?: never` on the no-TTL variant**, so a TTL that does not exist cannot be read. The optional-`liveUntilLedgerSeq` trap closed in the type system instead of in review.

31 tests green. **ADR-005 is `Proposed` and needs Fatih's acceptance** — a non-trivial decision is not settled by the code merging.

## `W1-D5-02` / `W1-D5-04` — hosting prepared, email verified

Hosting still needs its account/deployment step. Email readiness is verified by the accepted local delivery proof; its integration follow-up is recorded above.

**Dashboard hosting.** `apps/dashboard/public/index.html` is a static placeholder — framework-free on purpose, because the framework choice is still deferred and a hello-world should prove the *pipeline*, not commit the stack.

The useful finding here: **the P0 dashboard needs no backend at all.** Scanning is a permissionless read, so the browser calls Soroban RPC directly — no server-side secret, nothing to keep warm. That makes Vercel, Netlify and Cloudflare Pages functionally identical, and the decision not worth deliberating. Recommending **Cloudflare Pages** on a non-hosting ground: the same signup provides the account needed to test whether the Stellar SDK runs on Workers, which is the one blocking unknown left in ADR-003 Part 2. One signup, two questions.

**Email.** `scripts/send-test-email.mjs` previews by default and requires `--send` for a local request. It uses `EMAIL_TO` for the smoke-test recipient; `EVERGREEN_ALERT_TO` remains reserved for the engine. One Resend delivery and inbox receipt are recorded, with nine offline tests. The script is marked for deletion once `EmailChannel` lands at `W3-D17-01`.

## 🚨 `W1-D5-01` BLOCKED — the npm name `evergreen` is taken

Checked 2026-09-07 (this is exactly what the task meant by *"confirm availability now, not in Week 4"*).

`evergreen` is squatted by an abandoned package — a MongoDB build-platform client, last published **2016-04-28**. So `packages/cli/package.json`'s declared name and the README's `npx evergreen scan` are both unpublishable as written.

**Free:** `evergreen-soroban`, `soroban-evergreen`, `stellar-evergreen`, `@evergreen-soroban/*`. The `@evergreen` scope could not be confirmed without an account (npm org page returns 403).

**The command name is recoverable even though the package name is not.** A package published as `evergreen-soroban` can still declare `"bin": { "evergreen": … }`, so `npm i -g evergreen-soroban` still gives users `evergreen scan <contract-id>`. Only `npx <name>` and the install line change — the DX we actually care about survives.

**Needs Fatih's npm account.** Once the name is picked it touches `packages/cli/package.json`, `README.md`, `packages/cli/README.md` and `BACKLOG.md`.

## ✅ 2026-09-07 — `W1-D5` partly closed

- **`W1-D5-05` secrets** — one table, one home per secret per surface, plus the rules that follow. Notable: the scheduler workflow needs **no credential at all**, because it only reads public data. A workflow with no secret cannot leak one.
- **`W1-D5-06` evidence location — resolved differently than planned.** We have been committing evidence to `docs/evidence/<date>-<topic>/` rather than a cloud drive, and that is better: versioned, reviewed through a PR, cannot drift from the claim it supports, and a grant reviewer needs no access grant. The drive is now scoped to the demo video and anything over ~5 MB. Tree is 3.0 MB; re-check each gate.
- **`W1-D5-07` conflict-marker check** (new) — wired into `pnpm check` and CI, running first because it is the cheapest. Written because I left markers in `.prettierignore` and the whole suite went green: **Prettier treats an unparseable line as a pattern matching nothing, so a broken ignore file passes.** Third silent-direction failure this sprint — after the testnet guard that refused everything and the local gate weaker than CI — which is enough evidence that this class belongs in a check rather than a paragraph. Tested in both directions, and against Markdown `====` rules for false positives.

## ✅ 2026-09-07 — three PRs merged, one silent-loss conflict caught

`main` had not moved since Sep 5 while Rakha stacked three CI-green PRs. All merged today in dependency order: **#22** (TTL boundary) → **#20** (testnet setup) → **#24** (scheduler smoke).

**The boundary is settled by observation.** Entry present at ledger **4,529,810** (remaining 0), absent at **4,529,811** (remaining −1) — confirming the documented inclusive boundary and the `remainingLedgers == 0` trap. `W2-D8-01` is unblocked. Rakha used an **isolated contract** with a `protectedIDs` guard enforcing the B/C rule in code rather than in a doc note; verified independently after merge, both proofs still +0.0h.

**Correction to the primer, from him:** the temporary floor is **720** (`min_temporary_ttl` from live network settings), not 688. My 688 was remaining-at-sampling. He also noted these are *network configuration, not constants to hardcode* — the same reason the rent model must read fee params live.

> ### ⚠️ The `package.json` conflict was a near-miss worth remembering
>
> PR #24 set `"test": "vitest run && pnpm test:scheduler"`; `main` had `"test": "vitest run && pnpm test:ttl"` from #22. **Both sides chained their own suite onto the same entry point, so taking either side would have silently dropped the other's tests — and CI would still have passed**, because everything remaining is green.
>
> Resolved to run both. `main` now runs **25 tests** (5 vitest + 11 TTL verifier + 9 scheduler), confirmed by running them, not by reading the diff.
>
> Same shape as the testnet guard that refused everything and the local gate weaker than CI: **a failure in the safe-looking direction.** Watch for it whenever two branches extend one entry point — it is a structural hazard of parallel work, not anyone's mistake.

**Still open:** `W1-D4-01/02` await second-machine tooling and everyday-account confirmation **from Fatih**, not from Rakha. **Later Sep 7 update:** both scheduler runtime proofs succeeded; Issue #23 now remains open for review and merge of the published evidence in PR #27.

## 🔴 HARD DATE — Fri Sep 18: the engine must be watching guinea-pig B

**Moved from Sep 19 to Sep 18 on 2026-09-05, and the reason matters more than the date.**

Every weekday label in `BACKLOG.md` was shifted by one day — Sep 3 2026 is a Thursday, not a Wednesday. The dates and task IDs were always right; only the day names were wrong, and we had been using them as shorthand. Recomputed:

| | |
|---|---|
| **Fri Sep 18** | engine-live gate |
| **Sat Sep 19** | *(was the gate)* — now margin |
| **Sun Sep 20 ~12:00 UTC** | **B's crossing** |
| **Fri Sep 25 ~12:00 UTC** | C's crossing |

**We replanned to 24 effective days precisely because weekends are not real working days — and then the least recoverable event in the sprint landed on a Sunday, with its gate on a Saturday.** Nobody noticed because the labels said otherwise.

So: **Friday Sep 18 is the gate; Saturday is margin, not the deadline.**

**The crossing happening with nobody watching is the claim, not a problem** — "unattended" is the entire point. But it makes the alerting path load-bearing as evidence: `W3-D17-04` requires it **verified working before Sep 18**, exercised in both directions, not merely built. A bump with no alert leaves us reconstructing the event afterwards instead of capturing it as it happens.

**C's crossing is a Friday** — a working day with people around. Another point in C's favour, and an argument for treating B as the proof that may be observed imperfectly rather than the one everything rests on.

**The one date in this sprint that is not ours to move.** Now a milestone gate in `BACKLOG.md` with the same weight as the weekly gates.

The gate is **not** "the hosting decision is deployed and hardened." It is: *the engine's decision-and-bump path is running unattended on some scheduler, watching B, at the calibrated threshold.* The `W3-D18-00` minimal fallback runner — GitHub Actions cron invoking the same engine code — satisfies it completely. Nothing in the claim being proved requires the platform chosen at `W1-D5`, so an unrecoverable date is no longer coupled to an open decision (ADR-003).

## ⏳ The decay proof is armed — two shots, staggered

| | Contract | Crossing | Role |
|---|---|---|---|
| **B** | `CCYGO7KQ…LTTQ` | **2026-09-20 ~12:00 UTC** | the plan |
| **C** | `CCLW55OI…33FL` | **2026-09-25 ~12:00 UTC** | the spare |

C was deployed 2026-09-05 as insurance: a single unrecoverable date protecting a never-cut proof is one point of failure. If the Sep 20 window is missed — deployment slips, the spike runs long, someone gets sick — C is still ahead of us with room before Oct 2. If Sep 20 works, C is documented as an unused spare and cost nothing. **C is not a reason to relax about Sep 19.**

**The crossing is a window, not a timestamp.** The calibration assumes 5.000 s/ledger holds for ~16 days. A 0.5% deviation over 280,747 ledgers is ~1,400 ledgers ≈ 2 hours, and testnet close times are less regular than mainnet's. **Drift running early is the dangerous direction** — being live "by the projected date" is worthless if the crossing arrives six hours before it.

So it is checked, not assumed: `python3 scripts/check-decay-drift.py`, **twice weekly, output pasted below**, exiting non-zero if anything drifts >6h early.

### Drift log

| Checked (UTC) | B crossing | drift | C crossing | drift |
|---|---|---|---|---|
| 2026-09-05 06:29 | 2026-09-20 12:00 | +0.0h | 2026-09-25 12:01 | +0.0h |
| 2026-09-06 02:20 | 2026-09-20 12:00 | +0.0h | 2026-09-25 12:01 | +0.0h |
| 2026-09-07 05:13 | 2026-09-20 12:00 | +0.0h | 2026-09-25 12:01 | +0.0h |
| 2026-09-08 17:25 | 2026-09-20 12:00 | +0.0h | 2026-09-25 12:01 | +0.0h |
| 2026-09-09 11:00 | 2026-09-20 12:00 | +0.0h | 2026-09-25 12:01 | +0.0h |

The fifth reading was taken **immediately after** the `W1-D7-08` extends on guinea-pig A, and doubles as the check that they touched nothing else. Both crossings unmoved.

Four readings, four zeros, across ledgers 4,4xx,xxx → 4,572,943.

**What a zero reading does and does not establish.** Rakha's review note argued that `+0.0h` cannot say anything about the real cadence, because the script assumes 5.000 s/ledger — so a zero would just be the assumption echoed back. Worth checking rather than conceding, and the script's own arithmetic settles it:

```python
seconds_away = (crossing_ledger - current) * SECONDS_PER_LEDGER
projected    = now + seconds_away
```

`crossing_ledger` is fixed on chain, but `current` and `now` are both observed independently. Between two readings the projection moves by `T − 5N` (wall seconds elapsed, minus five times the ledgers elapsed). **If the chain ran slower than 5.000 s/ledger, `N` would lag `T/5` and the projection would slide later; faster, and it slides earlier.** The assumption multiplies a measured delta rather than replacing it, so a real deviation cannot hide behind it. Drift printed to one decimal bounds it: `|drift| < 0.05h` over the ~59,800 ledgers between the first and fourth readings puts the **average** cadence within ≈0.003 s/ledger of 5.000.

Confirmed outside the script — two `getLatestLedger` observations, 16.3 hours apart:

```
2026-09-08 17:25 UTC  ledger 4,572,943
2026-09-09 09:40 UTC  ledger 4,584,643
58,510 s / 11,700 ledgers = 5.0008 s/ledger
```

So the correction runs the other way: the finding is real, but my original wording claimed more than the method supports. **A zero reading measures the average over the interval, not steadiness within it** — excursions that cancel are invisible to it, which is precisely how a validator hiccup could pass unnoticed between two checks. *(Recorded because the reflex on receiving a correction is to accept it; this one was half right, and the half that was wrong would have discarded a genuine measurement.)*

None of which is a licence to stop checking. The eleven days before B's crossing are exactly where a hiccup would land, and the reading that matters is the one taken after something changes, not the four taken before.

> ⚠️ **B and C can now sit in the engine config early** — calibrated against a threshold, the engine correctly does nothing until the crossing. But that safety depends on the configured threshold matching the calibration, so adding them is a deliberate verified step: add, run **dry-run**, confirm the engine reports **no action needed**, only then run live. A threshold accidentally too high bumps them immediately and destroys both proofs silently. Procedure in `docs/SETUP.md`.

## ✅ W1-D4-06 — the permissionless property is confirmed on testnet

**2026-09-05.** Two independently generated accounts, no authorization between them. Account B extended **all four entry types** on a contract deployed by account A, and every `liveUntilLedgerSeq` increased. Verified by reading `getLedgerEntries` before and after — not by trusting a success code — and by confirming through Horizon that the transaction source was B, not A. The built transaction's footprint carries no auth entries at all.

Full record with tx hashes, before/after ledger values and account addresses: `docs/SOROBAN-PRIMER.md`.

**What this settles.** The ADR-002 amendment, the Week 3 two-stage restructure, ADR-004's payment model, and the public non-custodial claim in the README all rested on this. They now rest on an observation rather than a reading of the docs.

**It also produced the TTL floors** (`W1-D4-04b`), and one number was a surprise: a fresh **temporary** entry lives **688 ledgers ≈ 57 minutes**, against ≈120,927 (~7 days) for instance, code and persistent. Two consequences, both recorded in the primer:

- ADR-001's reaction-time argument — "TTL headroom is measured in days, so a 5–15 minute cadence buys plenty of margin" — **holds for persistent/instance/code and does not hold for temporary.** Thresholds for temporary entries need to account for that, and the CLI should warn when one is within a couple of cron intervals.
- It changed `W1-D4-04c`, above.

## History rewrite — 2026-09-05

**If you are here because a commit SHA doesn't resolve, this is why.**

`main` was force-pushed once, on 2026-09-05, to remove `c8aea7b "test: protection probe"` — an empty commit created while verifying branch protection by attempting a real push. With admin bypass still enabled at the time, the push silently succeeded.

- **What changed:** the probe commit is gone; every commit after it has a new SHA. `1a0f543` → `1f8feb0` for the PR #1 squash-merge.
- **What did not change:** nothing. The working tree after the rebase was byte-identical to before it — verified by comparing tree hashes, not by eye.
- **Known cost:** [PR #1](https://github.com/Fatihmaull/evergreen/pull/1) still shows as merged but references `1a0f543`, which is no longer reachable from `main`. Judged worth it — an orphaned reference inside a merged PR is invisible unless someone goes looking, while `test: protection probe` would sit in `git log` forever in a repo a grant reviewer reads.
- **Why it was safe then and would not be now:** zero clones, one contributor. Rakha had not yet cloned. **This is the last such rewrite** — from here `main` is shared, and hard rule 9 applies without exception.
- **Procedure note:** removing it needed *two* protections relaxed, not one. `enforce_admins: false` was not enough; `allow_force_pushes: false` blocks everyone independently. Both were restored afterwards and verified by re-reading the API, not by assuming the calls succeeded.

## Open risks being watched

Reordered after Phase 0 — the Week 3 spike risk has been largely defused; Week 4 is now the top concern.

- **🔴 Week 4 compression, Fatih as single bottleneck.** Was arithmetically impossible; now merely full, after the reallocation above. The write path was a symptom, not the cause. Watch the Stage-2-runs-long dependency.
- **🟠 The natural-decay proof is fragile.** Two ways to lose it: an accidental bump (mitigated — B stays out of the config, warnings in SETUP and EVIDENCE), or a TTL floor too long to decay in-sprint (mitigated — threshold proof banked at `W3-D18-02a` as insurance). Floors measured `W1-D4-04b`.
- **🟠 Testnet resets.** Can wipe both guinea-pigs *and* invalidate every explorer link in EVIDENCE.md. Mitigated by the three-artifact rule and contract IDs in config. **Check whether SDF has a reset announced inside Sep 3 – Oct 2.** A reset also destroys B's accumulated age.
- **🟡 `shared-types` churn.** It now carries `Signer`, payer-distinct `BumpRecord`, and N×M config — all landing `W1-D6`, all rippling across both developers if changed later. Get it right on `W1-D6` (Tue Sep 8); don't refactor it mid-week.
- **🟡 Stage 2 scope compliance.** If the policy signer slips, Deliverable 2 ships with a documented gap against the SOW's literal wording. Fatih owns raising it with Kenny early. Not an agent task.
- **🟡 Fee model fidelity.** Rent estimates must be validated against a real tx fee (`W2-D9-02`) *and* read live network parameters, or the CLI's headline feature is guesswork.
- **🟢 Week 3 policy-signer spike.** Was the top risk; now off the critical path. Rakha's Rust is solid, so the OpenZeppelin fallback is genuinely available and no longer time-boxed against a proof deadline.

## Evidence captured so far

See [`docs/EVIDENCE.md`](EVIDENCE.md), which is the index. Count as of the W1 close: **24 unique testnet transactions** — 19 Sep 5 bootstrap transactions recovered on Sep 8, plus 5 setup/boundary records — each with full RPC JSON and an explorer screenshot, alongside the `W1-D7-03` scan snapshot. One published artifact: the Cloudflare Pages dashboard placeholder.

**Re-count at every week gate.** This line read `0 · 0 · 0` until Sep 9, four days after the first evidence landed — a standing summary nobody re-derives is worth less than no summary, because it is read as current.

## Session log

Append one entry per working session. Newest at the top. Keep entries short — what moved, what broke, what's next.

### 2026-09-05 — TTL boundary semantics recorded; onboarding corrections (Fatih + Claude)
- **The `liveUntilLedgerSeq` boundary is answered by the docs, and it carries a trap.** The boundary is **inclusive**: an entry stops being live only when `currentLedger > liveUntilLedgerSeq`, so `remainingLedgers = liveUntil − current` with no `+1` — and therefore **`remainingLedgers == 0` means the entry is on its last live ledger, not that it has expired.** The naive `<= 0` guard is wrong by one ledger *in the dangerous direction* and is silent, because every test agrees with whichever convention was picked.
- **Recorded as documented-not-yet-pinned.** Partial observation today: B and C's temporary entries were absent at ledger 4,515,215, ~1,300 ledgers past their `liveUntil` — consistent with the inclusive boundary, but it confirms *dead well after* and does **not** pin *alive exactly at*. `W1-D4-13` observes the exact boundary ledger using a ~57-minute temporary entry, **before `W2-D8-01`'s math is written**. If observation disagrees with the docs, the observation wins and it escalates.
- **`projectedArchiveDate` is banned from `shared-types`** (`W1-D6-01c`). Both halves are wrong — *archive* is false for temporary entries, which are deleted, and *date* invites storing wall-clock where the truth is a ledger. One field cannot describe two fates: `endsAtLedger` plus `endBehavior: 'archived' | 'deleted'`, with any wall-clock estimate derived at the display edge and never stored.
- **The self-test was measuring the wrong property.** 7/7 on recall with zero readiness meant it tested whether an agent could restate facts, not act on them. Question 8 now requires *doing* something checkable against the repo — pick a task, name its branch, state that task's specific done conditions — with a note explaining why it is shaped differently so nobody tidies it back into a comprehension question.
- **"Precision distributed backwards" is now a standing rule** in `CONVENTIONS`: identifiers a reader must *act on* are complete and exact; identifiers a reader must *avoid* may be abbreviated. The instinct gets this backwards because the dangerous ones feel like they deserve the full string.
- **`W1-D7-07` added to the week gate:** verify the four deliberately duplicated statements in `ONBOARDING.md` and `AGENTS.md` still agree. The duplication is justified; leaving it unchecked is how it becomes accidental.
- **`AGENTS.md` now says why `CLAUDE.md` stays thin** — some harnesses inject it at session start, so it can be stale in context while correct on disk. A stale pointer is inert; a stale manual misleads the highest-traffic agent on the project.

### 2026-09-05 — tool-agnostic agent onboarding (Claude)
- **`AGENTS.md` is now the canonical operating manual**, tool-agnostic, for any agent — Cursor, Codex, Copilot, Gemini, Claude Code. `CLAUDE.md` is a 15-line pointer carrying only Claude-Code-specific facts with no general equivalent. Two full manuals would have drifted within a week, which is the duplicate-`Evergreen-PRD.md` failure again.
- **`docs/ONBOARDING.md` written** — orientation rather than rules: what Evergreen is, the five things that will bite you, the workflows, the dates, and a self-test.
- **Fresh-eyes tested** with an agent restricted to those two files, attempting a real backlog task (`W2-D8-01`). It scored 7/7 on the self-test and still could not correctly start the task — which was the useful result. Fixed from its gap list: guinea-pig A's contract ID was **truncated *and* mistyped** in ONBOARDING (worst kind of error: the contract you must *not* touch was fully specified, the one you verify against was wrong); the definition of done never said what "verified against testnet" means for a pure function; "evidence if applicable" never defined applicable; PR title format was asserted but never given; "ask rather than assume" had no channel; and "Apex" appeared in ADRs without ever being introduced.
- **Two of its findings were wrong about the repo and still valuable.** It reported `CLAUDE.md` as a stale 175-line duplicate — it had read a copy *injected by its harness at session start*, not the 15-line file on disk. That is a real discovery in a different form: harnesses cache `CLAUDE.md`, which argues *for* the pointer design, since a stale pointer is harmless where a stale manual is not. It also reported `pnpm check` as possibly weaker than CI; the script is correct, but ONBOARDING listed three of its four commands and implied equivalence. Both fixed.
- **Found a real domain gap:** the primer never says whether an entry is live *at* `liveUntilLedgerSeq` or whether that is the first dead ledger — the entire arithmetic content of `W2-D8-01`. Flagged as open in the primer rather than guessed (hard rule 3), with a note that a ~57-minute temporary entry makes the boundary cheap to observe directly.

### 2026-09-05 — sync workflow corrections installed (Fatih + Claude)
- **The discrepancy rule had a narrow-case error and it is now fixed in `CLAUDE.md`.** "Correct Notion to match the repo" would have degraded the mirror for `W1-D4-09`, where Notion was right and the repo was wrong. Installed the clarification: *repo-canonical means the repo is where truth is authored, not that it is always right; when the mirror reveals a repo error, fix repo-first-then-sync.* Rules that are wrong in a narrow case get followed, which makes them more dangerous than obviously wrong ones.
- **Escalation broadened** from "Notion claimed a completion" to *"Notion asserts something the repo does not support"* — covering wrong status, phantom row, and divergent ID in one sentence rather than naming only the imagined failure mode. The actual finding was none of the three originally described.
- **Two rules against ID divergence:** row IDs come from `BACKLOG.md` and are never inferred from a naming pattern; and the session-start diff reports presence/absence, not only status disagreement. A divergent ID does not fail — it silently stops matching, so the row that most needed checking is the one no longer checked.
- **The `userDefined:ID` SQL trap** is in `CONVENTIONS` now, not only in the workflow section: `SELECT ID` returns page UUIDs rather than task IDs and does not error. Same family as the testnet guard and the weaker-than-CI local gate — a check that fails in the safe-looking direction.
- Recorded the workflow's first catch alongside its cost, so the `W1-D7-05` gate reports both sides.

### 2026-09-05 — dual-channel sync installed and exercised (Fatih + Claude)
- **Notion MCP was already connected** via claude.ai connectors at `https://mcp.notion.com/mcp`. Running the `claude mcp add` from the brief would have created a duplicate server; checked before acting.
- All three connection verifications passed: workspace identity, database read, and a write → read-back → revert round trip (write via `update_page`, read back via SQL — genuinely independent code paths, not an echo).
- **First validation found three real things**, two of them recorded above as anomalies and one a repo defect (`W1-D4-10` shipped with no task row). Week 1 rows were hand-populated from a snapshot, so mismatches were expected — but the *shape* of them was more interesting than a wrong status.
- Also missing from Notion and now created: `W1-D4-07`, `W1-D4-08`, `W1-D6-01b`.
- The workflow was exercised end to end on its own PR, including a deliberately introduced discrepancy to confirm detection works in both directions rather than only on the happy path.

### 2026-09-05 — weekday labels corrected; engine-live gate moved to Fri Sep 18 (Fatih + Claude)
- **Every weekday label in `BACKLOG.md` was shifted by one day.** Sep 3 2026 is a Thursday. Verified by computing all 30, then rewriting them from their dates programmatically rather than by hand, so the same slip cannot recur.
- **Prose shorthand was doubly wrong** — "Friday's hosting decision" was `W1-D5` on **Mon Sep 7**, and "Monday's shape check" was `W1-D6` on **Tue Sep 8**. Replaced weekday shorthand with task ID + explicit date throughout, which cannot drift again.
- **The engine-live gate moved from Sat Sep 19 to Fri Sep 18.** The collision was invisible behind the wrong labels: we replanned to 24 effective days *because weekends are not working days*, and the sprint's least recoverable event sits on a **Sunday** with its gate on a **Saturday**. Friday is the gate; Saturday is margin.
- **Added `W3-D17-04`: alerting verified working before Sep 18**, exercised in both directions. B's crossing happens with nobody watching — which is the claim being proved, but it makes the alert the evidence trail. A bump with no alert means reconstructing the event after the fact instead of capturing it live.
- **C's Sep 25 crossing is a Friday**, a working day. That strengthens the case for treating B as the proof that may be observed imperfectly rather than the one everything depends on.

### 2026-09-05 — ledger refined into three categories (Claude)
- **"Six added tasks" was still the wrong unit.** Split it: **four corrections** (`W2-D8-04`, `W2-D9-01`, `W2-D10-01`, `W3-D16-02b`) — the rent model always needed to not double-count and the severity model was always wrong for shared entries, so these are a mispriced estimate found on day 3, **not cuttable without shipping wrong answers**; **two elective** (`F-01`, `W4-D23-01`); **one that pays for itself** (`W3-D18-00`, which protects a never-cut proof *and* buys a production floor).
- **`W2-D12-02b` moved out of Week 2 entirely** and became **`F-01`** under a new *Floating tasks* section. Its only consumer is the demo video's framing; nothing in W2 depends on it, and leaving it there made it a cut decision in Week 2 rather than a non-decision now. If no day has room it simply doesn't happen and the demo leads with something else.
- With `W4-D23-01` already sitting in a cuttable W4 slot, **both elective items are neutralised before Week 2 starts** — which is the entire point of doing this accounting on Sep 5 rather than Sep 16.
- **Added `W1-D7-06`: report Rakha's ramp as a measured thing.** It is the one variable this week nobody has checked empirically, which is conspicuous given everything else was observed rather than assumed. He clones into a repo with an unusual amount of context; *"should help"* is a hypothesis. Record what he picked up unaided, where the docs failed him, what he had to ask — fixing the context files on Sep 9 is far cheaper than finding the gap in Week 3 when he is building the engine alone.

### 2026-09-05 — W1-D6 scope growth named; slack accounting opened (Claude)
- **Named the silent growth on `W1-D6`.** Three findings have landed on `shared-types` since it was scoped Sep 4, with no change to its estimate. Written into the task itself, `packages/shared-types/README.md`, and above — so the `W1-D6` session sees it wherever it looks.
- **The `ScanResult` shape inversion is the acceptance criterion**, not a suggestion: the primary collection is keyed by ledger key, contracts are a property of the entry. The explicit check — *can this shape represent one entry serving N contracts, exactly once?* — must be answered in writing here before `W1-D6-01` closes.
- **Friday downgraded from load-bearing to reasonable.** `W3-D18-00` turned GitHub Actions cron from a fallback into a proven floor, so the hosting decision no longer sits on the critical path. SDK compatibility remains the first filter, timeboxed to an afternoon; unresolved ambiguity *is* the answer.
- **Opened the slack accounting** in `BACKLOG.md` with a running table, and added `W1-D7-05` to report it formally at the W1 gate. Current honest read: **0 of 6 slack days consumed, sequence position ahead** (day 3 complete plus six of day 4's tasks on calendar day 3) — **but scope grew by ~5 task IDs in W1 and ~6 in W2–W4**, and the W2–W4 additions land in days that were already full. That is where the pressure will show, and `W1-D7-05` is where it gets a number rather than a feeling.

### 2026-09-05 — shared code-entry finding propagated (Claude)
- Took the shared `ContractCode` finding out of the primer footnote it was buried in and propagated it as a product requirement: PRD (candidate headline capability), ARCHITECTURE (ledger key is the unit of work, not the contract), core README, and six backlog tasks.
- Added **within-run** idempotency as its own task rather than assuming the across-run task covered it. It does not: one run over N contracts sharing a Wasm would try to bump one entry N times.
- The rent model double-count is the sharpest correctness consequence — a per-contract sum overcharges a factory deployment by N for exactly the users most sensitive to cost. Regression test uses B and C, which already share an entry.
- **Positioning deferred to measurement** (`W2-D12-02b`) rather than asserted. We are reasoning from how contracts are usually structured; the survey settles whether this leads the demo or stays a footnote.
- Drift check now warns on **late** drift (>24h) as well as failing on early (>6h). C has only ~7 days of margin before Oct 2, so a large late drift could push its crossing out of the sprint — proportionate response is a visible warning, not a failure, but not something to discover on Sep 26.

### 2026-09-05 — decay-proof mitigations (Claude)
- **Guinea-pig C deployed and calibrated** to cross 2026-09-25, five days after B. One unrecoverable date protecting a never-cut proof was a single point of failure; now there are two shots.
- **Found that B and C share one `ContractCode` ledger entry** — same Wasm, one entry. Extending it for one extends it for both, so it cannot be staggered. Pushed it to ~Oct 19, past the whole sprint, so each contract's crossing is driven only by its own instance and persistent entries. Recorded in the primer as domain knowledge: a scan reporting per-contract TTL without the shared code entry can show four healthy contracts whose common code expires tomorrow.
- **Wrote `scripts/check-decay-drift.py`** and logged the first reading. The calibration is an assumption with a 16-day horizon, so it gets re-derived from live ledger state twice weekly rather than trusted.
- **Sep 19 promoted to a milestone gate** in BACKLOG, and redefined so it does not depend on Friday's hosting decision — `W3-D18-00` adds a minimal GitHub Actions fallback runner. The proof needs the engine's logic running unattended somewhere, not the production platform. Side benefit: platform-independence becomes tested rather than assumed, which matters while Cloudflare's SDK compatibility is open.
- **Relaxed the "keep B out of the config" rule into a verified procedure** — calibration makes early inclusion safe, but only if the configured threshold matches, so it is add → dry-run → confirm no-action → go live.
- Storage optimizer (`W2-D12-01`) now cites the observed temporary-entry deletion with its date, and must report the shared code entry.

### 2026-09-05 — W1-D4-04c guinea-pig B calibration (Claude)
- **Decay proof armed.** B deployed and calibrated with one manual extend; crossing projected 2026-09-20 ~12:00 UTC. Details above.
- Measured the ledger close rate from Horizon rather than assuming 5s — it is exactly 5.000 s/ledger over a 100,000-ledger sample, so the calibration arithmetic is grounded.
- **Disclosed the calibration up front in `EVIDENCE.md`**, next to the proof rather than buried: a reviewer reading B's history sees deploy → manual extend → engine extend, and the middle transaction is explained before they have to wonder about it.
- B's *temporary* entry was deliberately left uncalibrated and was deleted about an hour after deploy — which is what temporary storage is for.
- **Seeded two downstream decisions rather than pre-empting them:** `W3-D15-02b` asks whether Evergreen should auto-bump temporary entries *at all* (proposed: default off, opt-in per contract) and defers the ADR-001 amendment until that is settled; `W2-D12-01` now points the storage optimizer at the measured floors, which turn generic hygiene advice into a checkable warning.
- Added the write-the-failing-case-first requirement to `W3-D19-02` and the dry-run default — a scope check only ever observed permitting things has the same invisible-failure shape as the testnet guard that refused everything.
- **Noted `extXdr` in the primer** as unanticipated and currently unused, and flagged that the RPC client should exploit `latestLedger` arriving in the same response rather than making a second call.

### 2026-09-05 — W1-D4-06 permissionless verification (Claude)
- **Confirmed on testnet.** See the section above. This was the highest-leverage unverified assumption in the plan and it holds.
- Ran it end to end on the hot environment rather than waiting for ownership to line up: two independent funded testnet identities, deployed guinea-pig A from one, extended all four entry types from the other, read before/after from RPC, cross-checked the source account on Horizon.
- **Measured the TTL floors** as a by-product (`W1-D4-04b`). Temporary at 688 ledgers (~57 min) vs ~120,927 (~7 days) for everything else — a two-order-of-magnitude gap with real design consequences for threshold defaults, and it partially qualifies ADR-001's reaction-time reasoning.
- **Recorded the first real RPC fixture** (`W1-D4-05`) at `packages/core/test/fixtures/getLedgerEntries-guinea-pig-a.json`, unedited. It carries an `extXdr` field the plan hadn't anticipated, and confirms `latestLedger` arrives in the same response — so `remainingLedgers` needs one round trip, not two.
- Excluded fixtures from Prettier: reformatting a recorded response would defeat the purpose of recording it.
- **Surfaced a scheduling problem in the natural-decay proof** — guinea-pig B would archive ~8 days before the proof date. Blocked pending a decision rather than deploying B on a guess.
- Guinea-pig A deployed and recorded: `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L`.
- **Next:** `W1-D4-01/02/03` (Rakha) — pin tooling versions, generate the team's own keypairs, wire `.env`. Then the guinea-pig B decision.

### 2026-09-05 — W1-D3 closeout (Fatih + Claude)
- **Repo live and public:** [github.com/Fatihmaull/evergreen](https://github.com/Fatihmaull/evergreen). Fatih authorized `gh` and pushed; blocker cleared.
- **CI verified green on GitHub**, not only locally (run #1 on `e2a3ae6`, 19s). README tables render correctly in GitHub's stricter renderer — the exclude-markdown-from-Prettier call holds up.
- **Branch protection on `main`** with CI as a required status check, set before Rakha clones rather than after. `W1-D3` closed.
- Bumped `actions/checkout`, `actions/setup-node`, and `pnpm/action-setup` to v5 — the v4 line targets Node 20 and was being force-upgraded with a deprecation warning. Same reasoning as the ESLint 9 bump: don't carry a warning through a sprint when the fix is a version bump on day 3.
- **Stubbed `docs/POLICY-SIGNER.md`** — it was a live 404 from the public README, in the closing sentence of the strongest section in the repo. Swept every markdown link repo-wide with a script rather than by memory; it was the only broken one, but the sweep caught a second error: `SOROBAN-PRIMER.md` pointed at `docs/adr/ADR-002.md`, which is not the filename. Fixed.
- Added `docs/EVIDENCE.md` to the README's documentation table — plausibly the file Kenny most wants to find, and it was missing.
- **Commit attribution turned off** via committed `.claude/settings.json`. Worth noting: the `includeCoAuthoredBy` key is deprecated as of Claude Code v2.0.62; the current key is `attribution`, and setting it makes the old key inert. Verified against the docs rather than recall.
- Recorded the reasoning for three earlier judgment calls in CONVENTIONS (markdown/Prettier, TypeScript 5.x, conventions-as-lint-rules) so they don't get re-litigated.
- **`W1-D4-00`** — wrote the guinea-pig contract, which turned out not to exist. `W1-D4-04` said "deploy a guinea-pig contract" and `deploy-guinea-pig.sh` was a stub that failed loudly; there was no Rust source anywhere. Logged as discovered work rather than built quietly.
  - Minimal Soroban contract writing one persistent + one temporary entry, so all four entry types sit on one contract for the `W1-D4-04b` floor measurements. `soroban-sdk` pinned to `=27.0.6`.
  - Verified by compiling and running it, not by reading docs — 3 local tests pass, wasm builds at 2.4K. That is the check hard rule 3 actually asks for.
  - Deploy script takes `A` or `B`, deploys *and* seeds, and refuses any network whose passphrase is not testnet's.
  - The decay warning is now in four places: the contract's own doc comment, the deploy script, `evergreen.config.example.json`, and `SETUP.md`. A comment at the point of use beats a line in a doc nobody rereads.
  - Contract build is deliberately **not** in CI — it needs the Rust toolchain and would add minutes per PR for a fixture that changes almost never. The tradeoff is documented in `contracts/README.md` with the trigger for revisiting it.
- **History rewritten** — see the section above.
- **Next:** W1-D4 proper — Stellar environment, both guinea-pigs deployed, TTL floors, and `W1-D4-06` the permissionless check.

### 2026-09-04 — W1-D3 scaffolding (Claude)
- **Monorepo scaffolded and verified.** Node 24, pnpm workspaces, TypeScript strict, ESLint flat config + Prettier, Vitest. Five packages (shared-types, core, cli, engine, dashboard), each importable with a passing no-op test.
- **Clean-clone test passed** — cloned to a fresh directory, `pnpm install --frozen-lockfile` then `pnpm check`: typecheck, lint, format:check, 5/5 tests green. That is the Phase 1 definition of done, minus the push.
- Toolchain recorded in ADR-003 Part 1. Chose Vitest over Jest: no per-package transform config, and v8 coverage needs no extra plumbing for the SOW's required coverage report.
- **Prettier excluded from markdown** — it reflows tables and rewrites emphasis markers, burying real docs changes under churn in a repo whose docs a grant reviewer reads. Noted in CONVENTIONS.
- Bumped ESLint to 10.x: 9.x is out of support and installing it printed a deprecation warning on day 3, which is a bad first impression in a repo built to be read.
- **Blocked on pushing** — see Blocked above. Two commits sit locally, ready.
- **Next:** Fatih authorizes GitHub and pushes; Rakha starts W1-D4 (Stellar env, both guinea-pigs, TTL floors, the permissionless check at W1-D4-06).

### 2026-09-04 — Phase 0 alignment + doc reconciliation (Fatih + Claude)
- **Phase 0 closed.** Vision, scope boundaries, payment model, and risk ranking agreed and restated. Alignment happens once; future sessions follow the STATUS-first ritual (noted in CLAUDE.md).
- **Found `extendTTL` is permissionless** — verified against Stellar's state-archival docs. Empirical confirmation queued at `W1-D4-06`; docs are not the network.
- Reconciled 12 documents against the finding (see Scope changes above). Several were asserting things now known to be wrong — README's "authorized by a policy signer", ARCHITECTURE's "no write path", ADR-002's non-custodial framing.
- Wrote ADR-003 (toolchain decided, infra pending) and ADR-004 (payment model).
- Deleted the duplicate root PRD; archived the bootstrap prompt.
- **Next:** W1-D3 scaffolding — monorepo skeleton, CI, repo hygiene, push to GitHub. Then W1-D4 (Rakha): Stellar env, both guinea-pigs, TTL floors, permissionless check.
- **Still outstanding:** `W1-D1-03`, Fatih's start-date confirmation to Kenny — now bundled with the Stage 2 scope conversation.

### 2026-09-04 — planning (Fatih + Claude)
- Wrote `docs/PRD.md`: problem, goals, non-goals, personas, P0/P1/P2 requirements, success metrics.
- Researched policy-signer options; chose `passkey-kit` over OpenZeppelin and over building custom (ADR-002). Cost comparison: ~$450–750 vs ~$750–1,200 vs ~$1,200–1,800.
- Resolved all five open questions from the PRD draft (team split, signer tooling, dashboard scoping, alert channels, sprint dates).
- Wrote `BACKLOG.md` (30 days, daily tasks, milestone gates, cut order) and the agent context docs.

### 2026-09-03 — kickoff
- Sprint officially started. SOW re-read, scope confirmed, dates locked (Sep 3 → Oct 2).
