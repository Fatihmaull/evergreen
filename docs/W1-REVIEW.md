# Week 1 review — 2026-09-08

W1's foundation and real Testnet scan milestone are ready for W2. Shared closeout is still open in [Issue #44](https://github.com/Fatihmaull/evergreen/issues/44). This report covers `W1-D7-03/04/05/06`; it does not mark the future CLI, engine or dashboard deliverables complete.

## Review basis and branch state

- Merged baseline: main `b0f0d0b`, including persistence artifact PR #52, npm/Pages PR #54 and decision rationale PR #55.
- Architecture: [PR #53](https://github.com/Fatihmaull/evergreen/pull/53), synchronized at `bcc41c7`, complete but awaiting review/merge.
- Closeout: `docs/W1-D7-03-week-one-review`, stacked on #53. Review its incremental diff against `bcc41c7`. A pushed coordination branch is not a reviewed or merged PR.
- [BACKLOG](../BACKLOG.md): 50 W1 tasks; this branch records **48 Done, 2 In progress**. The latter are recurring drift `W1-D4-09` and shared adjustments `W1-D7-04`. Open-branch completion is explicitly distinct from merged main.

## Foundation checklist — W1-D7-03

| Area | Verified outcome | Evidence / remaining scope |
|---|---|---|
| Scope and onboarding | SOW, PRD, module boundaries, conventions and agent manual exist | [PRD](PRD.md), [ONBOARDING](ONBOARDING.md); observations below |
| Local environment | Both developers' setup and identical Wasm build recorded | [SETUP](SETUP.md); runtime keys stay local |
| Soroban behavior | A/B/C deployed; permissionless extends; inclusive TTL boundary measured | [Primer](SOROBAN-PRIMER.md), [boundary evidence](evidence/2026-09-06-ttl-boundary/README.md) |
| Scheduler | Actual manual and scheduled Actions invocations read Testnet | [Runtime evidence](evidence/2026-09-07-scheduler-runs/README.md); no automated bump yet |
| Email | Resend accepted test send; recipient confirmed inbox delivery; follow-up merged #40 | [EVIDENCE](EVIDENCE.md); engine notifications remain W3-D17-01 |
| Hosting and package names | Pages placeholder live; npm organization/name reserved | [SETUP](SETUP.md); functional dashboard and package publication remain W4 |
| Shared contracts and harness | Shared types and mock RPC merged, negative type examples checked | [ARCHITECTURE](ARCHITECTURE.md); ADR-005 acceptance remains open |
| Persistence | Local experiment/evidence merged #52; Actions + Node selected; Neon deferred to W4 | [ADR-003](adr/ADR-003-toolchain-hosting-persistence.md); hosted validation is W4-D26-05 |
| CLI milestone | Actual A instance scan succeeds in human and JSON modes | [Snapshot](evidence/2026-09-08-w1-review/README.md); all-entry discovery/deduplication remain W2 |

### Evidence snapshot and recovery

Fresh scan: Sep 8 at 13:26:21 UTC, A instance at ledger **4,570,079**, final live ledger **4,712,648**, **142,569 ledgers remaining**. Both scan commands exited 0. Raw stdout/stderr and command metadata are preserved. The readable screenshot renders saved stdout; it is not a screenshot of a terminal application.

The [recovery inventory](evidence/2026-09-08-w1-review/README.md) contains **19 Sep 5 historical transactions**: experiment account funding, Wasm upload, A/B/C deployment and seeding, four permissionless A extends, B/C calibration and the later shared-code extension. All have successful full RPC responses and real Stellar Expert screenshots captured Sep 8, plus hash/ledger/envelope verification. The scope is the two documented experiment account histories, not every transaction from every developer account. Together with five existing setup/boundary records, the indexed W1 evidence contains **24 unique transactions**.

This repairs missing durable artifacts while public history is still available. It does not retroactively satisfy same-day capture: transaction and capture dates are separate. No new transaction, calibration, email or hosted database was run for this closeout. These manual/calibration extends do not substitute for the W3 unattended natural-decay proof.

## Slack accounting — W1-D7-05

**Recorded consumption: 0 of 6 slack days; all six remain uncharged in the backlog ledger.** No independent hours/day log exists, so actual extra effort cannot be reconstructed honestly. No W1 milestone overrun is observed as of Sep 8; the scan passed before Sep 9. Shared review remains open and is not evidence of zero remaining effort.

| Category | Work | Capacity implication |
|---|---|---|
| Required correctness | W2-D8-04 key dedupe; W2-D9-01 unique-key rent; W2-D10-01 shared-entry severity; W3-D16-02b within-run dedupe | Existing estimates underpriced correct behavior; keep these |
| Elective, already contained | F-01 research moved to floating; W4-D23-01 sharing UI is cuttable | No new W2 dependency |
| Protective | W3-D18-00 fallback runner | Protects the Sep 18/20 proof; retain |
| W1 foundations | Guinea-pig source, C, calibration, drift script/checks, shared-code finding and setup fixes | Completed within the observed foundation phase; recurring drift continues |
| Coordination and review | Notion mirror, email overlap reconciliation, evidence recovery, documentation corrections | Real effort without a reliable time ledger; not claimed free |

**Does W2 still fit?** It remains feasible under the current plan: environment, services, shared types, RPC harness and first scan are ready. This is not an elapsed-effort forecast. All-entry discovery and rent estimation still carry uncertainty. Keep correctness and the Sep 18 gate first; if a scheduled build day slips, record the consumed day and apply the existing cut order, starting with batch scan `W2-D13-03`. No cut or new deadline has been silently imposed here.

Mirror cost is visible: the original record estimated 3–4 minutes/schema overhead per session, but no trustworthy aggregate was measured. Repeated owner drift and the stale Project Brain show that more writes alone do not ensure accuracy. Compare presence, status and owner at task/review boundaries and update the hub at week gates; do not sync each commit.

## Onboarding observations — W1-D7-06

This is an observation of the assisted workflow, not a proficiency test. Rakha authorized a summary from the conversation rather than supplying a separate self-report. **What he understood unaided was not measured; no claim of independent mastery is made.**

| Observed question or action | What it tells us | Response / next-use guidance |
|---|---|---|
| Asked for the overall product, components, flow and division of work | Dense reference docs were insufficient as a first orientation | Architecture now separates the working instance scan from the planned engine, with diagrams |
| Asked for today's scope, W1 mapping and plans before execution | Task IDs alone did not communicate the work boundary | Start each task with its ID, owner, inputs, concrete outcome and review boundary |
| Asked about branches, publication, PRs, issues and merge timing | Local execution and remote coordination were being conflated | ONBOARDING now distinguishes local work, WIP push, PR review and merge |
| Challenged the email overlap and coordinated with Fatih | Ownership/handoff was unclear across parallel sessions | One owner/primary branch; post explicit progress and handoff in the existing Issue |
| Asked why Neon vs Supabase and deferred a choice until local results | Platform recommendation needed evidence and timing context | ADR-003 records the accepted provider and why adoption waits until W4 |
| Configured email locally and confirmed inbox delivery | An assisted setup step was observed and confirmed | Reuse the checked setup; do not infer broader unaided familiarity |
| Asked for final review before publication | Human review boundary matters to the workflow | Keep the reviewed diff, validation and publication step explicit |

The earlier onboarding-agent test also found a mock-RPC reference before implementation and an unresolved TTL boundary. Both have since been addressed by #42 and W1-D4-13. The stale Day 8 instruction to repeat the boundary experiment is removed. A later self-explanation of one scan result would give stronger evidence of independent understanding; this report does not require or pretend that it happened.

## Decisions and W2 handoff — W1-D7-04

Shared acceptance stays open in #44. The prepared adjustments are:

1. Reuse the existing inclusive boundary proof and core helpers at W2-D8-01. Remaining TTL 0 is the final live ledger; below zero is beyond it. Temporary data is deleted, persistent data is archived.
2. Preserve the accepted Actions + Node runtime and W4 Neon adoption. Low TTL is not proof that a prior transaction failed. W3-D16-02 must reconcile known transaction hashes and validity bounds; W3-D16-03 owns the interim history. A timeout or `NOT_FOUND` alone must not be rewritten as success or safe new submission.
3. Leave ADR-005 **Proposed** until Fatih accepts or amends it. Existing type implementation is merged; this closeout does not invent decision approval.
4. Keep temporary-entry engine policy in its existing task **W3-D15-02b**. The W1 permissionless experiment proves capability, not a settled product policy for extending disposable data.
5. Keep D4-09 drift checks through Sep 20. The last recorded check is Sep 7, not this scan. The instance-only CLI does not yet replace B/C persistent/code drift coverage.

| Next task | Owner | Planned local outcome |
|---|---|---|
| W2-D8-01/02 | Fatih | Complete TTL helpers/edge tests using existing semantics and fixtures |
| W2-D8-03 | Rakha | Establish supported entry-discovery inputs and scan instance, code, persistent and temporary entries |
| W2-D8-04 | Rakha | Deduplicate by ledger key and preserve every consuming contract; shared-Wasm regression |

Before implementing D8-03, verify what the configured RPC can actually enumerate and which storage keys need explicit input. Do not invent an API that lists arbitrary contract storage. Agree that input boundary in the task plan, then implement against fixtures. No W2 code is included in this closeout.

Fixed dates remain **Sep 18 engine ready**, **Sep 20 ~12:00 UTC B crossing**, **Sep 25 ~12:00 UTC C spare**, **Oct 2 deadline**. Preserve calibration and controlled proof timing; this review has not extended B/C.

## Validation and mirror

`pnpm check` passed conflict detection, typecheck, lint, formatting and all 70 offline tests (34 workspace + 11 TTL + 9 scheduler + 9 email + 7 persistence). All 19 recovered RPC/image bundles and 158 local document links passed validation. No configured credential or secret-pattern match was found in the candidate files. `.env`, stash, other prior branch heads and original evidence were preserved. Runtime code, workflows, package manifests, lockfile and original evidence are outside this closeout diff. The only AGENTS change corrects its introductory TTL boundary description; operating policy is unchanged.

The audit found all 50 W1 IDs in Notion, with no presence mismatch. Eleven historical Owner fields differed from BACKLOG (`W1-D4-00/04/04b/07/08/12/11/10/04c/05/06`); formal owners are Fatih except 04b Shared. Correction retained historical executor notes; read-back confirms all 50 IDs, statuses and owners match. Project Brain was refreshed to Sep 8/day 6 with 24 days remaining and current per-week counts, preserving its child pages. Knowledge Base and Decisions were updated and read back. No new task ID is introduced.
