# STATUS — living board

**This is the first file to read and the last file to write, every session.** BACKLOG.md is the plan; this is reality.

**Last updated:** 2026-09-08 · W1-D6-02 final review complete; ready for PR publication
**Sprint day:** 6 of 30 · **Deadline:** 2026-10-02
**Current week:** W1 — Foundation
**Health:** 🟢 on track · **`W1-D4-06` confirmed** · **decay proof armed (Sun Sep 20 / Fri Sep 25)** · 🔴 **hard gate Fri Sep 18**

---

## Right now

**2026-09-08 — architecture data-flow complete (`W1-D6-02`):** owner Rakha, branch `docs/W1-D6-02-architecture-flow`, based on main `a7d500d` (PR #51), tracked in [#32](https://github.com/Fatihmaull/evergreen/issues/32). Repo and Notion matched before starting: D6-02 Pending; D6-03 and D6-04 Done. Changes are limited to ARCHITECTURE.md, this status entry and the D6-02 backlog row. The WIP branch is visible for coordination; no new PR or Issue has been opened. User review precedes PR publication. The unused persistence artifact remains separately in open [PR #52](https://github.com/Fatihmaull/evergreen/pull/52); this branch does not include it.

**Outcome:** three Mermaid diagrams show dependencies, the actual instance scan and the planned engine flow. The document names the real shared-type fields and producer/consumer boundaries, a synthetic two-consumer/one-entry example, inclusive TTL semantics, optional rent, per-payer signer resolution, and simulated/submitted/succeeded/failed records. It records the accepted W3 Actions history / W4 Neon split and adoption prerequisites. Current limitations are explicit: scans read instances only; repeated input IDs remain repeated consumer references; unavailable TTL is skipped by the current CLI threshold helper. Broader discovery/consumer deduplication remain W2-D8-03/04, and future engine decisions must handle incomplete observations. No new product decision, runtime implementation or shared-type change is claimed.

**Validation:** `pnpm check` passed conflict detection, typecheck (including 17 negative type examples), lint, formatting and **63 offline tests** (34 workspace + 11 TTL + 9 scheduler + 9 email). The count excludes the seven persistence tests still in PR #52. All 22 document links were checked for valid local targets where applicable, and all 11 explicit task IDs resolve in BACKLOG. Final review parsed and rendered all three diagrams with Mermaid 11 in local Chromium and inspected their screenshots; rendering passed. The runtime/test tree is unchanged from the 63-test check, so that result remains applicable without rerunning the same suites. Runtime source, workflows, dependency files and original evidence match main; prior branch heads, stash and .env content/permissions are preserved. No new chain read/transaction, database run or email was needed: existing fixture-based tests and the merged scan proof cover the documented behavior.

**Mirror:** D6-02 was set to Done via Notion MCP with the documented outcome, 63-test validation and explicit pending user-review/PR boundary; queried again by exact ID to verify status and notes. Earlier OAuth notes below are historical.

**Final review:** two diagram clarifications landed: unit tests enter through the mock reader without calling the network guard/SDK, and the engine resolves the public fee-paying account before envelope preparation/simulation, with signing gated by live opt-in. Existing shared types and code were rechecked; no blocking finding remains within this documentation scope. Temporary Mermaid rendering tools/screenshots are outside the repository; no dependency or runtime changes were added.

**Next:** PR publication for #32 is ready for user authorization. No new PR/Issue was created during review. The shared W1 review gate in #44 remains separate.

## Earlier session notes

**2026-09-08 — email follow-up published (`W1-D5-04`):** [PR #40](https://github.com/Fatihmaull/evergreen/pull/40) integrates the preserved probe, nine offline tests and original delivery evidence from `chore/W1-D5-04-email-follow-up`, based on main `cdbbb77`, with review requested from @Fatihmaull. [Issue #37](https://github.com/Fatihmaull/evergreen/issues/37#issuecomment-5573281589) accepts the implementation and delivery proof; [handoff #39](https://github.com/Fatihmaull/evergreen/issues/39) requests this follow-up. The old email branch at `470d41c` remains a checkpoint. Local review is complete; PR #40 closes Issue #37 on merge. The PR is open for review and has not been merged.

**Validation:** `pnpm check` passed conflict detection, typecheck (including all 17 shared-types negative examples), lint, formatting and **40 offline tests** (7 shared-types + 4 other workspace + 11 TTL + 9 scheduler + 9 email). The configured `pnpm email:smoke` preview returned `status: "dry-run"`, `submitted: false`, and redacted addresses at `2026-09-08T03:24:50.267Z`. The source and tests retain the accepted local implementation; current shared types, their compiler checks and all earlier suites remain intact. Original `send-result.json`, `.env` content/permissions, the RPC fixture, old branches and stash match the preservation snapshot. No new provider request, email, or Stellar transaction occurred during this follow-up.

**Mirror sync — caught up 2026-09-08 from Fatih's session.** `W1-D5-04` and `W1-D6-01/01b/01c` now carry their merge outcomes and PR links in Notion.

> ⚠️ **Rakha's Notion OAuth grant is revoked** (`invalid_grant`), confirmed twice during publication. Fatih's grant still works, which is why the mirror could be brought current — but that is luck, not design. **Rakha should reconnect before his next session**, otherwise every sync silently falls to whoever else happens to have a working grant.
>
> He handled it correctly: did the work, recorded everything in the repo, noted the pending sync by task ID. That is rule F, and it is the reason the mirror failing cost nothing. Original note follows.

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
| Product definition | ✅ done | S | PRD, backlog, agent docs (W1-D2) |
| Phase 0 alignment | ✅ closed | S | Vision, scope, payment model, risks agreed 2026-09-04 |
| Doc reconciliation | ✅ done | S | 12 documents updated to match the permissionless finding |
| Repo & toolchain | ✅ done | F | W1-D3 closed — repo public, CI green on GitHub, `main` protected |
| Stellar dev env | ✅ **W1-D4 complete** | F/R | all D4 tasks done — reproducible build confirmed on both machines |
| Services & accounts | 🟡 scheduler proof complete; other services open | F/R | W1-D5-03 manual + scheduled GitHub reads verified; exported evidence published for review in [PR #27](https://github.com/Fatihmaull/evergreen/pull/27). Other D5 tasks remain open. |
| Shared types & harness | 🟡 types merged in PR #36; other D6 tasks pending | R/F | W1-D6-01/01b/01c validated; data flow, mock RPC and persistence remain Pending. |
| CLI | ⬜ not started | F | first slice at W1-D7-01 |
| Engine | ⬜ not started | R | Stage 1 starts W3-D15 |
| Dashboard | ⬜ not started | F | starts W4; wallet spike at W2-D13-02 |
| Evidence | 🟡 building | S | Setup: 2 funding txs. Boundary: adjacent-ledger proof + 3 tx records. All with JSON + screenshots. First weekly snapshot due W1-D7-03 |

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

Notion-ahead-of-repo discrepancies get logged here with date and task ID. **Two in one week means the workflow itself is suspect.**

| Date | Task | What | Resolution |
|---|---|---|---|
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
- **`W1-D4-04c`** still called guinea-pig B the subject for `W3-D20-02b`, an ID that now means something else.
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

## ✅ ADR-003 decided — and the database waits until after Sep 20## ✅ ADR-003 decided — and the database waits until after Sep 20

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
| Engine runtime + persistence | **Open** | **Yes, blocking** |

*Does the Stellar SDK run in the Workers runtime?* is still unanswered. If it does not, the engine is not on Cloudflare, and reaching D1 from elsewhere is awkward enough to be a bad default arrived at by momentum rather than decision. Timeboxed to one afternoon; past that, the ambiguity **is** the answer and the Actions cron floor carries us.

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

See `docs/EVIDENCE.md`. Count: **0 tx hashes · 0 screenshots · 0 published artifacts.** First evidence expected W1-D7-03.

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
