# STATUS — living board

**This is the first file to read and the last file to write, every session.** BACKLOG.md is the plan; this is reality.

**Last updated:** 2026-09-06 · scheduler smoke test prepared for local review
**Sprint day:** 4 of 30 · **Deadline:** 2026-10-02
**Current week:** W1 — Foundation
**Health:** 🟢 on track · **`W1-D4-06` confirmed** · **decay proof armed (Sun Sep 20 / Fri Sep 25)** · 🔴 **hard gate Fri Sep 18**

---

## Right now

**2026-09-06 — `W1-D5-03` ready for local review:** GitHub Actions + Node 24 selected for the scheduler smoke test on `chore/W1-D5-03-scheduler-smoke`. SDK 17.0.1 verified Testnet and read guinea-pig A's instance at ledger **4,530,578**, with **182,070** ledgers remaining. The read-only script, manual/15-minute workflow, and nine offline regression tests are prepared; `pnpm check` passes, including the five existing package placeholder tests. No signing or transaction is involved. Publication and a real GitHub `schedule` run remain pending, so the task stays **In progress**. Notion task and Decisions page synced through MCP and fetched again to verify the exact task ID, In progress state, and local-only proof boundary.

Local proof: [runtime record](evidence/2026-09-06-scheduler-smoke/README.md). This branch starts from `main`; the separate setup and TTL publications remain in PR #20 and PR #22. Reconcile their overlapping tracking updates when integrating; they are not included in this scheduler change.

| Workstream | State | Owner | Task |
|---|---|---|---|
| Product definition | ✅ done | S | PRD, backlog, agent docs (W1-D2) |
| Phase 0 alignment | ✅ closed | S | Vision, scope, payment model, risks agreed 2026-09-04 |
| Doc reconciliation | ✅ done | S | 12 documents updated to match the permissionless finding |
| Repo & toolchain | ✅ done | F | W1-D3 closed — repo public, CI green on GitHub, `main` protected |
| Stellar dev env | 🟡 partly done | F/R | ⏱️ **start `D4-13` first — it runs in background** · then D4-01/02/03 (R) |
| Services & accounts | 🟡 scheduler preparation in progress | F/R | W1-D5-03 local SDK check passed; scheduled-run proof pending. Other D5 tasks remain open. |
| Shared types & harness | ⚠️ **grew 3×** | R/F | W1-D6-01 → W1-D6-04 · **shape inversion, see below** |
| CLI | ⬜ not started | F | first slice at W1-D7-01 |
| Engine | ⬜ not started | R | Stage 1 starts W3-D15 |
| Dashboard | ⬜ not started | F | starts W4; wallet spike at W2-D13-02 |
| Evidence | ⬜ empty | S | first snapshot due W1-D7-03 |

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
| ADR-003 (scheduler) | GitHub Actions + Node 24 chosen for the initial smoke test; local SDK reads verified, scheduled proof pending. Hosting (D5-02) and atomicity (D6-04) remain open. | 2026-09-06 |
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

## ⏱️ Start `W1-D4-13` before the other D4 tasks

It is a **timer, not a task**: ~57 minutes elapsed, a few minutes of effort — seed a temporary entry, then poll until the read fails. `W1-D4-01/02/03` are hands-on and will fill the wait, so run the boundary check alongside them rather than behind them.

Its task number hides this. **`W2-D8-01` (Thu Sep 10) cannot be written correctly until it lands**, so picking it up last converts an hour of waiting into a day of slippage on the week's first real math task.

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
