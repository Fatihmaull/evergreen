# STATUS — living board

**This is the first file to read and the last file to write, every session.** BACKLOG.md is the plan; this is reality.

**Last updated:** 2026-09-05 · by: decay-proof mitigations — C, drift check, Sep 19 gate (Fatih + Claude)
**Sprint day:** 3 of 30 · **Deadline:** 2026-10-02
**Current week:** W1 — Foundation
**Health:** 🟢 on track · **`W1-D4-06` confirmed** · **decay proof armed, two shots (Sep 20 / Sep 25)** · 🔴 **hard gate Sep 19**

---

## Right now

| Workstream | State | Owner | Task |
|---|---|---|---|
| Product definition | ✅ done | S | PRD, backlog, agent docs (W1-D2) |
| Phase 0 alignment | ✅ closed | S | Vision, scope, payment model, risks agreed 2026-09-04 |
| Doc reconciliation | ✅ done | S | 12 documents updated to match the permissionless finding |
| Repo & toolchain | ✅ done | F | W1-D3 closed — repo public, CI green on GitHub, `main` protected |
| Stellar dev env | 🟡 partly done | F/R | D4-00/04/04b/04c/05/06 ✅ · D4-01/02/03 remain (R) |
| Services & accounts | ⬜ not started | F/R | W1-D5-01 → W1-D5-06 |
| Shared types & harness | ⬜ not started | R/F | W1-D6-01 → W1-D6-04 |
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
| ADR-003 (part 2) | *(pending W1-D5-03)* hosting, scheduler, persistence — framed as **atomicity**, not storage | — |
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
| 4 | **ADR-004 written: the user always pays.** Three mechanisms (dashboard signature / self-hosted engine / future hosted prepay), one invariant. Apex never subsidises. | Subsidy is unbounded cost and the hosted-billing non-goal in disguise. Now a hard rule in CLAUDE.md. |
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

## 🔴 HARD DATE — Sep 19: the engine must be watching guinea-pig B

**The one date in this sprint that is not ours to move.** Now a milestone gate in `BACKLOG.md` with the same weight as the weekly gates.

The gate is **not** "the hosting decision is deployed and hardened." It is: *the engine's decision-and-bump path is running unattended on some scheduler, watching B, at the calibrated threshold.* The `W3-D18-00` minimal fallback runner — GitHub Actions cron invoking the same engine code — satisfies it completely. Nothing in the claim being proved requires the platform chosen on Friday, so an unrecoverable date is no longer coupled to an open decision (ADR-003).

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
- **🟡 `shared-types` churn.** It now carries `Signer`, payer-distinct `BumpRecord`, and N×M config — all landing `W1-D6`, all rippling across both developers if changed later. Get it right Monday; don't refactor it mid-week.
- **🟡 Stage 2 scope compliance.** If the policy signer slips, Deliverable 2 ships with a documented gap against the SOW's literal wording. Fatih owns raising it with Kenny early. Not an agent task.
- **🟡 Fee model fidelity.** Rent estimates must be validated against a real tx fee (`W2-D9-02`) *and* read live network parameters, or the CLI's headline feature is guesswork.
- **🟢 Week 3 policy-signer spike.** Was the top risk; now off the critical path. Rakha's Rust is solid, so the OpenZeppelin fallback is genuinely available and no longer time-boxed against a proof deadline.

## Evidence captured so far

See `docs/EVIDENCE.md`. Count: **0 tx hashes · 0 screenshots · 0 published artifacts.** First evidence expected W1-D7-03.

## Session log

Append one entry per working session. Newest at the top. Keep entries short — what moved, what broke, what's next.

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
