# STATUS — living board

**This is the first file to read and the last file to write, every session.** BACKLOG.md is the plan; this is reality.

**Last updated:** 2026-09-04 · by: Phase 0 alignment + doc reconciliation (Fatih + Claude)
**Sprint day:** 2 of 30 · **Deadline:** 2026-10-02
**Current week:** W1 — Foundation
**Health:** 🟢 on track — one blocker (GitHub auth) that needs Fatih, not code

---

## Right now

| Workstream | State | Owner | Task |
|---|---|---|---|
| Product definition | ✅ done | S | PRD, backlog, agent docs (W1-D2) |
| Phase 0 alignment | ✅ closed | S | Vision, scope, payment model, risks agreed 2026-09-04 |
| Doc reconciliation | ✅ done | S | 12 documents updated to match the permissionless finding |
| Repo & toolchain | 🟡 done locally, **push blocked** | F | W1-D3-02/03/04 ✅ · W1-D3-01 `[!]` · W1-D3-05 partial |
| Stellar dev env | ⬜ not started | R | W1-D4-01 → W1-D4-06 |
| Services & accounts | ⬜ not started | F/R | W1-D5-01 → W1-D5-06 |
| Shared types & harness | ⬜ not started | R/F | W1-D6-01 → W1-D6-04 |
| CLI | ⬜ not started | F | first slice at W1-D7-01 |
| Engine | ⬜ not started | R | Stage 1 starts W3-D15 |
| Dashboard | ⬜ not started | F | starts W4; wallet spike at W2-D13-02 |
| Evidence | ⬜ empty | S | first snapshot due W1-D7-03 |

## Blocked

**[W1-D3-01] Cannot create or push to the GitHub repo — no GitHub authentication on this machine.**

- *What was tried:* `gh auth status` reports no logged-in host. The GitHub MCP connector is configured but unauthorized, and this session is non-interactive, so neither the OAuth flow nor `gh auth login` (device/browser flow) can be completed from here.
- *What is ready:* the local repo is initialized on `main` with two commits — the doc reconciliation and the full scaffold. Nothing is lost; this is purely the publish step.
- *What would unblock it:* Fatih authorizes GitHub — either `gh auth login` in an interactive terminal, or the GitHub connector via claude.ai connector settings. Then: create the public repo `evergreen` under the Apex org and `git push -u origin main`.
- *Also still pending on this:* branch protection on `main` (part of W1-D3-05), and confirming CI is green on GitHub rather than only locally (W1-D3-04).
- *Since:* 2026-09-04. **Not on the critical path today** — W1-D4 (Rakha's Stellar environment work) does not depend on the remote existing, though he cannot clone until it does.

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
| 14 | Root `Evergreen-PRD.md` deleted (byte-identical duplicate of `docs/PRD.md`); bootstrap prompt archived to `docs/archive/BOOTSTRAP-PROMPT.md` with a not-a-source-of-truth header. | A duplicate drifts on first edit. The bootstrap prompt predates the permissionless finding and must never be read as authoritative. |

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
