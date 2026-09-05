# Evergreen — 30-Day Backlog

**Sprint:** 2026-09-03 → 2026-10-02 (30 calendar days, hard deadline)
**Team:** F = Fatih Maulana · R = Rakha · S = shared
**Capacity:** planned against **24 effective days, not 30.** See the slack ledger below.

## ⚠️ The D-number is a sequence position, not a date

**`W2-D8` means "the eighth task-day in sequence." It is not a promise about Sep 10.** Each day-block carries a separate *Planned* date that is allowed to slip; the ID never moves.

Task IDs are stable identifiers referenced in commit subjects (`feat(cli): scan command [W2-D8-01]`), branch names, PR titles, `docs/EVIDENCE.md` rows, and `docs/STATUS.md`. **Never renumber a task** — renumbering breaks every one of those references. If scope changes, edit the task text and note it in STATUS.

A future session that reads `W2-D8` as a calendar commitment will re-derive this whole problem. It isn't one.

## Capacity model — 24 effective days

The original plan assigned build work to all 30 calendar days including every weekend. Plans shaped like that deliver about 80% of their days, so this one is planned against **24 effective days** with **6 slack days** held explicitly.

Slack is not rest scheduled in advance — it is unassigned absorption capacity. Consuming one is a **visible event**: tick it in the ledger below and log it in `docs/STATUS.md` with what consumed it. Six silent slips look identical to being on track right up until the deadline; six ticked boxes do not.

### Slack ledger

| # | Sits in | State | Consumed by |
|---|---|---|---|
| 1 | W2 | ⬜ available | |
| 2 | W2 | ⬜ available | |
| 3 | W3 (freed by the Stage 1/2 split) | ⬜ available | |
| 4 | W3 (freed by the Stage 1/2 split) | ⬜ available | |
| 5 | W4 | ⬜ available | |
| 6 | W4 | ⬜ available | |

**W1 carries no slack** — it is already 5 build days for 5 day-blocks with 2 days spent on planning. A W1 slip consumes W2's slack immediately.

### Running account (updated as things land; formal report at `W1-D7-05`)

**Slack consumed so far: 0 of 6.** That number is true and nearly useless on its own — the real signal is what landed in days that were already full. And those additions are not one category.

**Corrections — the estimate was wrong on Sep 4 and we found out on Sep 5. Not cuttable.**

| Task | What it corrects |
|---|---|
| `W2-D8-04` | dedupe by ledger key |
| `W2-D9-01` | rent summed per unique key |
| `W2-D10-01` | severity by blast radius |
| `W3-D16-02b` | within-run dedupe |

None of this is new scope. The rent model always needed to not double-count; the severity model was always wrong for shared entries. **Cutting any of it means shipping something that computes wrong answers**, so it is not a cut candidate — it is work that was always required and was mispriced. Discovering it on day 3 is the cheapest possible outcome.

**Elective — genuinely optional, and both already neutralised.**

| Task | Status |
|---|---|
| `F-01` sharing-prevalence research | moved out of Week 2 into *Floating tasks* — nothing depends on it |
| `W4-D23-01` sharing visible in dashboard | sits in W4, cuttable without affecting correctness |

**Pays for itself.**

| Task | Why it earns its slot |
|---|---|
| `W3-D18-00` fallback runner | protects a never-cut proof *and* buys a viable production floor, which de-risks an open ADR |

**Absorbed by running ahead (W1, already done):** `W1-D4-00` guinea-pig contract · `W1-D4-07` guinea-pig C · `W1-D4-08`/`09` drift script and recurring check · `W1-D4-10` shared-code propagation.

**Sequence position is ahead, not behind:** on calendar day 3, Day 3 is complete and six of Day 4's tasks are done (`04`, `04b`, `04c`, `05`, `06`, plus the added `00`). Only `W1-D4-01/02/03` remain of Rakha's day.

**But scope grew by ~5 task IDs in W1 and ~6 in W2–W4**, and the W2–W4 additions land in days that were already full. That is where the pressure shows up, not here. `W1-D7-05` is where it gets a number.

**Sequencing rule:** anything producing never-cut evidence moves as early as it can go; anything that is polish moves as late as it can go. The Week 3 two-stage split and the `W2-D13` wallet spike are both applications of this rule — look for more.

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked · `[-]` dropped (must say why in STATUS.md)

---

## Milestone map

| Week | Dates | Milestone (definition of "week is done") |
|---|---|---|
| W1 | Sep 3 – Sep 9 | **Foundation ready.** Repo, monorepo skeleton, CI, testnet accounts, all third-party services connected, agent context docs complete, and one real `scan` call returning live testnet TTL data. Week 2 can start with zero setup work. |
| W2 | Sep 10 – Sep 16 | **CLI complete (Deliverable 1).** Published-quality `evergreen scan`, TTL/archive prediction, rent cost model, manual `extendTTL` proven on testnet with tx hash, storage optimizer, tests green. |
| W3 | Sep 17 – Sep 23 | **Auto-bump engine live (Deliverable 2).** *Stage 1:* scheduled worker prevents archival end-to-end on testnet with a plain funded account, email alerts firing, bump history persisted, unattended-bump proof captured. *Stage 2 (off the critical path):* capped policy signer + setup guide. |
| W4 | Sep 24 – Sep 30 | **Dashboard + CI check + docs (Deliverable 3).** Public read-only dashboard deployed, `evergreen-check` Action published, docs complete, npm packages published. |
| Buffer | Oct 1 – Oct 2 | **Evidence submitted.** Demo video recorded, evidence bundle assembled per SOW §6.1, handed to Ambassador Chapter Lead, retro + SOW 2 candidate list written. |

**Non-negotiable ordering rule:** a week does not start until the previous week's milestone is met. If a week slips, cut P1 scope (see PRD §7), never cut evidence capture.

---

## Week 1 — Foundation (Sep 3 – Sep 9)

Goal: by Sep 9 nobody should ever again say "I can't start because X isn't set up." Every service, key, package boundary, and doc an agent or human needs exists.

### Day 1 · Kickoff & scope lock
*Planned: Thu Sep 3 — may slip; the D-number does not.*
- [x] **W1-D1-01** (S) Re-read the signed SOW; confirm the three deliverables and out-of-scope list are what we're actually building.
- [x] **W1-D1-02** (S) Confirm official sprint start = Sep 3, deadline = Oct 2.
- [ ] **W1-D1-03** (F) Send the start-date confirmation message to Kenny Rivaldi (Ambassador Chapter Lead) so his records match ours. *Carried into D3 if not sent.*

### Day 2 · Product definition
*Planned: Fri Sep 4 — may slip; the D-number does not.*
- [x] **W1-D2-01** (S) Write the PRD (`docs/PRD.md`) — problem, goals, non-goals, personas, requirements P0/P1/P2, metrics.
- [x] **W1-D2-02** (S) Research policy-signer tooling; decide build vs. buy (→ `docs/adr/ADR-002`).
- [x] **W1-D2-03** (S) Decide engine runtime shape: scheduled serverless, not always-on (→ `docs/adr/ADR-001`).
- [x] **W1-D2-04** (S) Write this backlog + the agent context docs (`CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/SOROBAN-PRIMER.md`, `docs/STATUS.md`).

### Day 3 · Repo & toolchain
*Planned: Sat Sep 5 — may slip; the D-number does not.*
- [x] **W1-D3-01** (F) Create the GitHub repo `evergreen` (public, MIT, Apex-owned). Push these docs as the first commit — docs land before code. *Live at [github.com/Fatihmaull/evergreen](https://github.com/Fatihmaull/evergreen).*
- [x] **W1-D3-02** (F) Monorepo skeleton: pnpm workspaces, root `tsconfig.base.json`, strict TS, ESLint + Prettier, **Vitest** (decided — ADR-003 Part 1), Node 24 pinned via `.nvmrc`.
- [x] **W1-D3-03** (R) Package boundaries created empty but importable: `packages/core`, `packages/cli`, `packages/engine`, `packages/shared-types`, `apps/dashboard`. Each with its own `package.json`, `README.md` stub, and passing no-op test.
- [x] **W1-D3-04** (F) CI workflow: install → typecheck → lint → format:check → test on every PR. **Verified green on GitHub**, not only locally. Actions pinned to v5 majors — the v4 line targets Node 20 and warns.
- [x] **W1-D3-05** (F) Repo hygiene: branch protection on `main` with CI as a required status check, PR template, issue templates, `CODEOWNERS`, `.gitignore` covering `.env*` and key material, commit convention documented.
- **Done when:** a fresh `git clone && pnpm install && pnpm test` passes on both machines. *(Verified 2026-09-04 against a clean clone: install, typecheck, lint, format:check and 5/5 tests green. CI confirmed green on GitHub 2026-09-05. Re-verify on Rakha's machine when he clones.)*

### Day 4 · Stellar/Soroban dev environment
*Planned: Sun Sep 6 — may slip; the D-number does not.*
- [x] **W1-D4-00** (F) **Guinea-pig contract source.** *Added 2026-09-05 — work discovered mid-week (hard rule 8): `W1-D4-04` said "deploy a guinea-pig contract" but no contract existed to deploy. Written by Fatih rather than Rakha so his day starts on the two things that matter — the TTL floors and the permissionless check — instead of on boilerplate.* Minimal Soroban contract writing one persistent + one temporary entry, so all four entry types exist on one contract (instance and code come with any deployment). `soroban-sdk` pinned exactly. 3 local tests, no network. Parameterised deploy script (`A` | `B`) that refuses any network but testnet.
- [ ] **W1-D4-01** (R) Install and pin the Stellar CLI + Soroban tooling versions on both machines; record exact versions in `docs/SETUP.md`.
- [ ] **W1-D4-02** (R) Generate testnet keypairs (one per developer + one for the future bot); fund via friendbot. **Testnet only — never a mainnet key, never a real-funds key.**
- [ ] **W1-D4-03** (R) Configure Soroban RPC endpoint + network passphrase as env vars; document `.env.example` (no real values committed, ever).
- [x] **W1-D4-04** (F) *(done during W1-D4-06)* Deploy **guinea-pig A** to testnet — our working test subject for the sprint. Record the contract ID in `docs/SETUP.md`.
- [x] **W1-D4-04b** (S) **Measure the real TTL floor per entry type** (instance, code, persistent, temporary) on a fresh deploy and record the numbers in `docs/SOROBAN-PRIMER.md` § Measured TTL floors. Two things depend on these and neither can be guessed: the bump threshold has to be set against a real floor, and whether the natural-decay proof is achievable in-sprint at all.
- [x] **W1-D4-07** (F) ✅ **Guinea-pig C — staggered spare**, calibrated to cross **2026-09-25 ~12:00 UTC**, five days after B. Converts an unrecoverable one-shot proof into two shots. Also pushed the **shared code entry** (B and C share one, being the same Wasm) past the whole sprint so it drives neither crossing.
- [x] **W1-D4-08** (F) ✅ `scripts/check-decay-drift.py` — re-derives both projected crossings from live ledger state. **Run twice weekly, paste into STATUS.** Exits non-zero if a crossing drifts >6h early. Temporary stand-in; delete it once `evergreen scan` does the job.
- [~] **W1-D4-09** (S) **Recurring drift check.** *(`[~]` not `[ ]`: it has started and runs until Sep 20. Recurring work is in-progress, not pending — see `docs/CONVENTIONS.md`.)* Twice weekly until Sep 20, run `check-decay-drift.py` and record the output in `docs/STATUS.md`. A set-and-forget calibration is how a two-hour drift becomes a missed proof.
- [x] **W1-D4-10** (F) ✅ **Shared code-entry finding propagated as a product requirement.** Taken out of a primer footnote into the PRD, ARCHITECTURE, core README and six backlog tasks. *Added retroactively 2026-09-05: this ID shipped in PR #7's title and commit subject but was never registered as a task — found by the first dual-channel sync validation.*
- [x] **W1-D4-04c** (F) ✅ **Deployed and calibrated 2026-09-05** (`CCYGO7KQ…LTTQ`), crossing projected **2026-09-20 ~12:00 UTC**. Calibration disclosed in `EVIDENCE.md`. *Resolved:* The measured floor (`W1-D4-04b`) is ≈120,928 ledgers ≈ 7 days for persistent, so a B deployed 2026-09-05 archives ~Sep 12 — about eight days *before* `W3-D18-02b`, the proof it exists for. Either deploy it ~Sep 12–13, or deploy now with one calibrating extend placing the crossing in the Sep 19–21 window. See `docs/SETUP.md`. Deploy **guinea-pig B** and leave it to age. This is the natural-decay subject for `W3-D20-02b` — the proof that a contract *which would otherwise have been archived* was saved. Deployed on Day 4 rather than Week 3 because it needs the intervening weeks to decay. ⚠️ **Guinea-pig B stays out of the engine's watched-contract config until the moment of proof** — if the engine sees it, it will bump it and destroy the evidence. Put a comment in the config saying so.
- [x] **W1-D4-05** (F) *(done during W1-D4-06)* Manually call `getLedgerEntries` against guinea-pig A and eyeball a real `liveUntilLedgerSeq`. Paste the raw response into `docs/SOROBAN-PRIMER.md` as a reference fixture.
- [x] **W1-D4-06** (F) ✅ **CONFIRMED 2026-09-05.** **Empirical permissionless check.** Rakha extends the TTL of a contract deployed by *Fatih's* account. Confirms in practice what Stellar's docs state — that `extendTTL` needs no authorization from the contract's owner. The whole Week 3 rescope rests on this. If it fails, **stop and escalate**: that discovery outranks everything else in the plan. Record the result in `docs/SOROBAN-PRIMER.md` either way — a confirmation is worth recording as much as a contradiction is worth escalating.
- **Done when:** both devs can hit testnet RPC and read live TTL data from our own contract, TTL floors are recorded, guinea-pig B is aging, and the permissionless property is confirmed on the network.

### Day 5 · Third-party services & accounts
*Planned: Mon Sep 7 — may slip; the D-number does not.*
- [ ] **W1-D5-01** (F) Reserve the npm scope/package names (`evergreen` CLI + core). Confirm availability *now*, not in Week 4.
- [ ] **W1-D5-02** (F) Dashboard hosting account + empty project deployed (Vercel/Netlify/Cloudflare — pick one, record in ADR-003). A "hello world" deploy must be live by end of day.
- [ ] **W1-D5-03** (R) Scheduler platform decided and a trivial cron job running end-to-end (GitHub Actions cron vs Cloudflare Workers cron — see ADR-001). Prove it can run on schedule and log output before we trust it with bumps.
  - **Run SDK runtime compatibility as the first filter.** A platform the Stellar SDK cannot run on fails before cost or ergonomics matter. **Timebox it to one afternoon**: if Cloudflare Workers' `nodejs_compat` story for the SDK is not settled by then, *that ambiguity is the answer* for a 24-day sprint — take Railway for the plain Node runtime and move on.
  - **This decision is lower-stakes than when it was written.** `W3-D18-00` gives us a GitHub Actions cron running the real engine code, which is not only a fallback — it is a **proven floor**. Actions cron plus a hosted database is a viable production answer, not an emergency one. This decision (`W1-D5`, **Mon Sep 7**) has to be *reasonable*, not *right*; it is no longer the only path to a working engine. Deferring is also legitimate: let the Actions runner carry the load and decide later with more information.
- [ ] **W1-D5-04** (R) Email provider account (Resend/SendGrid/etc.) + a test email successfully sent from code in the sandbox.
- [ ] **W1-D5-05** (F) Secrets handling: where do prod-ish secrets live (GitHub Actions secrets / hosting env vars)? Document the rule in `docs/CONVENTIONS.md`. **No secret ever enters git, a doc, or a chat log.**
- [ ] **W1-D5-06** (S) Create the shared evidence folder (cloud drive) referenced by `docs/EVIDENCE.md`, for screenshots and video.
- **Done when:** every external dependency the next 3 weeks need is authenticated and smoke-tested.

### Day 6 · Contracts-first design
> ### ⚠️ This day has grown since it was written, and its estimate has not
>
> `shared-types` was scoped on Sep 4. Three findings have landed on it since, none of which were in the original task:
>
> 1. **`Signer` as an interface** so Stage 1 (plain funded account) and Stage 2 (policy signer) are drop-in — from the ADR-002 amendment.
> 2. **`payer` distinct from contract, and an N-contracts × M-payers config shape** — from ADR-004, to keep the hosted direction open without building it.
> 3. **`ScanResult` keyed by ledger key, carrying which contracts each entry serves** — from the shared-`ContractCode` finding.
>
> Naming the growth out loud because the cost curve is steep: **an hour on `W1-D6` (Tue Sep 8), a simultaneous refactor across CLI, engine and dashboard in Week 3.** CLAUDE.md already says not to churn `shared-types` mid-week; this is why.
>
> ### The third one is a shape inversion — get it right or inherit three bugs
>
> The model anyone writes by instinct is **contract-centric**: a contract, with its entries hanging off it. That shape *structurally cannot* represent one ledger entry serving twelve contracts without duplicating it — which is precisely the bug we found on Sep 5.
>
> The primary collection must be **keyed by ledger key**, with the contracts it serves as a property of the entry. Contracts are the *input* to a scan and a back-reference on the output, not the thing the result is organised around.
>
> **Acceptance check before this task is marked done — answer it explicitly, in writing, in STATUS:**
>
> > *Can this shape represent one ledger entry serving N contracts, exactly once?*
>
> If `ScanResult` comes out of `W1-D6` organised by contract, everything downstream inherits the rent double-count (`W2-D9-01`), the severity error (`W2-D10-01`), and the dedupe bug (`W2-D8-04`, `W3-D16-02b`) — and each gets found and fixed separately, late.
*Planned: Tue Sep 8 — may slip; the D-number does not.*
- [ ] **W1-D6-01** (R) Define shared TypeScript types in `packages/shared-types`: `ContractRef`, `LedgerEntryTTL`, `ScanResult`, `RentEstimate`, `BumpDecision`, `BumpRecord`, `NotificationChannel`, `EvergreenConfig`, `Signer`. These are the seams every later task codes against — and per CLAUDE.md they must not churn mid-week, so get them right today.
- [ ] **W1-D6-01b** (R) Honour the three ADR-004 shape constraints, all cheap now and expensive later: `BumpRecord` carries **payer** as a field distinct from the contract (and which signer produced it); `EvergreenConfig` expresses **N contracts × M payers**, not one global bot; `Signer` is an **interface** resolved per payer, so Stage 1 (plain funded account) and Stage 2 (policy signer) are drop-in. v1 implements no multi-tenancy — it must only avoid foreclosing it.
- [ ] **W1-D6-02** (R) Write `docs/ARCHITECTURE.md` data-flow section against those types (RPC → core → {CLI, engine, dashboard}).
- [ ] **W1-D6-03** (F) Test harness: fixtures directory, a recorded RPC response fixture, and a mock RPC client so unit tests never hit the network.
- [ ] **W1-D6-04** (F) Decide and document the persistence choice for bump history (flat JSON file vs SQLite vs hosted KV) in ADR-003 — the dashboard and engine both read it, so it can't be decided ad hoc in Week 3.
- **Done when:** an agent can open `shared-types` and know exactly what shape every module speaks.

### Day 7 · First vertical slice + W1 review
*Planned: Wed Sep 9 — may slip; the D-number does not.*
- [ ] **W1-D7-01** (F) `evergreen scan <contract-id>` — thinnest possible end-to-end path: CLI → core → real testnet RPC → prints remaining TTL. No cost model yet, no pretty output.
- [ ] **W1-D7-02** (F) Unit test for the TTL-remaining calculation using the recorded fixture.
- [ ] **W1-D7-03** (S) **Week 1 review:** walk the W1 checklist, mark STATUS.md, screenshot the working scan (evidence snapshot #1).
- [ ] **W1-D7-05** (S) **Slack accounting — report against the ledger, not against a feeling.** Real unplanned work was absorbed this week: the guinea-pig contract (`W1-D4-00`), guinea-pig C and its calibration (`W1-D4-07`), the drift script (`W1-D4-08`), the shared-code propagation (`W1-D4-10`), and two self-caught bugs. All of it was correct and most of it prevented something worse — but it came from somewhere. State explicitly: **how many of the six slack days are spent, what consumed each, and whether W2 still fits** — and report the additions by category rather than as one number. Four are **corrections** (a mispriced estimate found on day 3, not cuttable without shipping wrong answers), two are **elective** (both already neutralised), one **pays for itself**. "Six added tasks" reads as six units of avoidable growth; that is not the honest picture. The ledger exists so this is a number rather than a feeling. **If W1 ran over, say so plainly** — the cut order exists and its first item (`W2-D13-03` batch scan) is cheap. An honest number now is worth more than an optimistic one on Sep 16.
- [ ] **W1-D7-06** (S) **Report Rakha's onboarding as a measured thing, not an impression.** His ramp is the one variable this week that nobody has checked empirically — everything else has been observed rather than assumed, which makes it conspicuous by contrast. He clones into a repo carrying an unusual amount of context, which *should* help; "should help" is a hypothesis, not a finding. Record concretely: **what he picked up unaided, where the docs failed him, what he had to ask.** If the context files work, that is worth knowing before Week 2 depends on them. If they don't, fixing the docs on Sep 9 is far cheaper than discovering the gap in Week 3 when he is building the engine alone.
- [ ] **W1-D7-04** (S) Adjust W2–W4 tasks if W1 revealed anything (e.g. RPC quirks, tooling surprises). Record changes in STATUS.md.
- **Milestone gate:** if `scan` doesn't return real testnet data by end of Sep 9, W2 starts with this task, and the first P1 item gets cut.

---

## Week 2 — Core CLI, Deliverable 1 (Sep 10 – Sep 16)

### Day 8
*Planned: Thu Sep 10 — may slip; the D-number does not.*
- [ ] **W2-D8-01** (F) TTL math module: remaining ledgers → projected archive ledger → projected archive **date** using network ledger-close cadence.
- [ ] **W2-D8-02** (F) Unit tests incl. edge cases: already-archived entry, entry with no TTL, ledger close-time drift.
- [ ] **W2-D8-03** (R) Scan all entry types for a contract (instance, code/wasm, persistent, temporary) — not just one; each has different archival behavior (see `docs/SOROBAN-PRIMER.md`).
- [ ] **W2-D8-04** (R) **Deduplicate by ledger key.** Scanning N contracts that share a Wasm surfaces the same `ContractCode` entry N times. `ScanResult` must carry unique entries with the set of contracts each one serves — that set is what severity and reporting both need downstream.

### Day 9
*Planned: Fri Sep 11 — may slip; the D-number does not.*
- [ ] **W2-D9-01** (R) Rent/cost estimation model: what does extending N ledgers cost, per entry and per contract?
  - **Sum per unique ledger key, never per contract.** Contracts sharing a Wasm share one `ContractCode` entry, so a per-contract sum charges it N times across a factory deployment — the headline cost estimate would be silently wrong for exactly the users who care most about cost. **Regression test with two contracts sharing a Wasm; B and C are that fixture.**
- [ ] **W2-D9-02** (R) Validate the estimate against a real testnet transaction's actual fee — the model is worthless if it's off by an order of magnitude. Record the comparison.
- [ ] **W2-D9-03** (F) Unit tests for the cost model with fixture inputs.

### Day 10
*Planned: Sat Sep 12 — may slip; the D-number does not.*
- [ ] **W2-D10-01** (F) CLI UX: `--json` vs human-readable output, colored TTL health states (healthy / warning / critical), `--help` that a stranger can follow.
  - **Severity accounts for blast radius.** A shared code entry at 3 days is not one contract at 3 days, it is N contracts at 3 days. This changes what "critical" means and must be reflected in both the colour states and the exit code the Action depends on.
  - **Say when an entry is shared** — *"this code entry is shared with 12 other contracts"*. A per-contract view that omits it is misleading by omission, and misleading in the confidently-green-before-total-outage direction.
- [ ] **W2-D10-02** (F) Proper exit codes (0 healthy, non-zero when below threshold) — the GitHub Action in W4 depends on this.
- [ ] **W2-D10-03** (F) Error handling: bad contract ID, RPC down, network mismatch, archived entry. Every failure gets a human-readable message, never a raw stack trace.

### Day 11 · First write transaction
*Planned: Sun Sep 13 — may slip; the D-number does not.*
- [ ] **W2-D11-01** (R) `evergreen extend <contract-id> --ledgers N` — manual `extendTTL` submission, signed locally by the developer key (not the policy signer yet).
- [ ] **W2-D11-02** (R) Execute on the guinea-pig contract; **capture the tx hash into `docs/EVIDENCE.md`** — this is required SOW evidence for Deliverable 2.
- [ ] **W2-D11-03** (R) Verify TTL actually increased by re-running `scan` before/after; screenshot both.
- [ ] **W2-D11-04** (F) Dry-run mode (`--dry-run`) that simulates without submitting. This becomes the engine's safety default in W3.

### Day 12
*Planned: Mon Sep 14 — may slip; the D-number does not.*
- [ ] **W2-D12-01** (R) Storage optimizer: flag entries that are oversized, duplicated, or better suited to temporary storage; output concrete recommendations, not just warnings.
  - **Cite the observed deletion, not a hypothetical.** We watched guinea-pig B's temporary entry get written at deploy and deleted ~57 minutes later on 2026-09-05. "We watched one go, here is the date" is more persuasive than "temporary entries are deleted."
  - **Report the shared code entry.** Contracts built from identical Wasm share one `ContractCode` entry (primer). A per-contract-only report can show four healthy contracts whose common code entry expires tomorrow.
  - **Use the measured floors** (`docs/SOROBAN-PRIMER.md`). They turn vague hygiene advice into a checkable warning: *"this data is in temporary storage and will be **deleted** — not archived — roughly an hour after creation unless extended"* is concrete and verifiable, where "consider your storage class" is not. The 688-vs-120,927 ledger gap is the sharpest thing the optimizer can say.
- [ ] **W2-D12-02** (R) Run it against the guinea-pig contracts + third-party public testnet contracts; sanity-check the advice isn't nonsense.

### Day 13
*Planned: Tue Sep 15 — may slip; the D-number does not.*
- [ ] **W2-D13-01** (F) Config file support (`evergreen.config.json`): contract list, thresholds, RPC URL, payer/signer resolution — shared later by the engine. Include the comment marking guinea-pig B as deliberately unwatched (`W1-D4-04c`).
- [ ] **W2-D13-02** (F) **Wallet-connect spike (half a day, throwaway).** Connect a wallet, sign one `extendTTL` payment, throw the code away. Moved here from Week 4 deliberately: the transaction-building machinery from `W2-D11` is hot, this is Fatih's day, and it displaces the batch scan below, which is already first in the cut order. Turns the Week 4 job from *learn wallet integration under deadline* into *put a button on something that already works*. **If this spike says the write path is unshippable at 24 effective days, say so now** — an early, cheap decision, and SOW 2 is a strong home for it.
- [ ] **W2-D13-03** (F) Batch scan: multiple contracts in one command with a summary table *(P1 — cut this first if the week is tight)*.

### Day 14 · W2 review
*Planned: Wed Sep 16 — may slip; the D-number does not.*
- [ ] **W2-D14-01** (S) Coverage pass; get `packages/core` meaningfully covered (target ~80% on the math/cost modules, not vanity 100% everywhere).
- [ ] **W2-D14-02** (F) `packages/cli/README.md` quickstart good enough for a stranger to install and run.
- [ ] **W2-D14-03** (S) **Week 2 review** + evidence snapshot #2 (CLI screenshots, coverage report, extend tx hash).
- **Milestone gate:** Deliverable 1 is feature-complete. Publishing to npm happens in W4, but no CLI *features* should be built after this date.

---

## Week 3 — Auto-Bump Engine, Deliverable 2 (Sep 17 – Sep 23)

**Restructured 2026-09-04 into two stages** (ADR-002 amendment). `extendTTL` is permissionless, so the engine needs no authority over anyone's contract and the policy signer is no longer what makes Evergreen non-custodial. That takes it off the critical path.

- **Stage 1 (D15–D18, critical path):** prove the whole loop with a plain funded account. Lands the unattended-bump proof around Sep 17–19 instead of Sep 22.
- **Stage 2 (D19–D21, off the critical path):** add the capped policy signer and its setup guide. SOW-committed, so not optional — but a failure here now costs hardening, not the deliverable.

The old plan spent the riskiest week's first two days on a spike the whole deliverable depended on. It no longer does.

### Day 15 · Engine core
*Planned: Thu Sep 17 — may slip; the D-number does not.*
- [ ] **W3-D15-01** (R) Engine core: read config → scan registered contracts → evaluate threshold rules → decide bump/no-bump. Dry-run by default.
- [ ] **W3-D15-02** (R) Threshold rules: bump when remaining TTL < X ledgers OR < Y days; per-contract overrides. Set thresholds against the **measured** floors from `W1-D4-04b`, not assumed ones.
- [ ] **W3-D15-02b** (S) **Decide whether Evergreen auto-bumps temporary entries at all — a scope question, not a cadence one.** Temporary storage exists for data *meant* to expire (nonces, sessions), and it is deleted rather than archived. An autopilot that silently keeps temporary entries alive forever fights the storage type's purpose and may preserve exactly the data a contract's design intends to drop. Proposed position, to settle here: **default off** — scan and report temporary entries, do not extend them; **opt-in per contract**, with an explicit warning that a ~688-ledger (~57 min) floor leaves very little margin at a 5–15 minute cadence and that a miss is unrecoverable. **Amend ADR-001 once this is decided** — recording that its reaction-time argument was validated for three entry types and bounded for the fourth, with the measured numbers. Deliberately not amended in advance.
- [ ] **W3-D15-03** (F) Unit tests for the decision logic with mocked scan results (no network).

### Day 16 · Bump execution
*Planned: Fri Sep 18 — may slip; the D-number does not.*
- [ ] **W3-D16-01** (R) Bump execution path behind the `Signer` interface, with retry + backoff. Stage 1 implementation = plain funded Ed25519 account holding only enough XLM to pay extend fees.
- [ ] **W3-D16-02** (R) Idempotency **across** runs: handle an in-flight tx when overlapping scheduler runs collide.
- [ ] **W3-D16-02b** (R) Idempotency **within** a run: bump each unique ledger key exactly once. Distinct from the across-run case above and **not covered by it** — a single run over N contracts sharing a Wasm will otherwise try to bump one `ContractCode` entry N times. Test with B and C. This is the correctness property ADR-001 accepted the risk on — it needs the atomic write from ADR-003, so it cannot be faked with a flat file.
- [ ] **W3-D16-03** (F) Persist `BumpRecord` history per the ADR-003 decision, including **payer** and **which signer produced it**.

### Day 17 · Notifications
*Planned: Sat Sep 19 — may slip; the D-number does not.*
- [ ] **W3-D17-01** (R) `NotificationChannel` interface + `EmailChannel` implementation.
- [ ] **W3-D17-02** (R) Stub `WebhookChannel` / `TelegramChannel` — interface-conformant, deliberately unimplemented, clearly marked as SOW 2 scope. Foundation, not half-features.
- [ ] **W3-D17-03** (F) Email templates: bump succeeded, bump failed, contract approaching critical TTL. Send real test emails.
- [ ] **W3-D17-04** (R) **Verify the alerting path end-to-end, before Fri Sep 18 — working, not merely built.** Trigger a real bump on guinea-pig A and confirm the success alert actually arrives; force a failure and confirm the failure alert arrives too. B's crossing is on a **Sunday** with nobody watching, so the alert is the evidence trail. A bump that happens with no alert leaves us reconstructing the event afterwards instead of capturing it as it happens. **Exercise both directions** — an alerting path only ever observed succeeding has the same invisible-failure shape as the testnet guard.

### Day 18 · **The proof** — end-to-end on a real schedule
*Planned: Sun Sep 20 — may slip; the D-number does not.*
- [ ] **W3-D18-00** (R) **Minimal fallback runner — build it early, well before Fri Sep 18.** A GitHub Actions cron invoking the same engine code. *The proof does not require the production scheduler.* The claim is "the engine's decision logic ran unattended, detected the crossing, and bumped with no human involved" — nothing in that requires the platform chosen at `W1-D5`. This decouples an unrecoverable date from an open decision (ADR-003), and it can stand by ready while production deployment proceeds on its own timeline. Bonus: it makes the engine's platform-independence a *tested* property rather than an assumed one, which matters while the Cloudflare option's Stellar SDK compatibility is unresolved.
- [ ] **W3-D18-01** (R) Deploy the engine to the scheduler chosen in `W1-D5-03`; run on a real cron cadence (5–15 min).
- [ ] **W3-D18-02a** (S) **Threshold proof (insurance — bank this first).** Set the threshold above guinea-pig A's current TTL; the engine fires on its next scheduled run, unattended. Proves detect-and-bump on a real cron. Cheap and repeatable.
- [ ] **W3-D18-02b** (S) **Natural-decay proof (the compelling one).** Guinea-pig B, deployed `W1-D4-04c` and aging since Sep 6, decays to threshold on its own and is saved with nobody watching. This is the claim the demo video makes. Achievable only if the floors measured at `W1-D4-04b` allow it — if not, say so in STATUS and ship the threshold proof described honestly.
- [ ] **W3-D18-03** (S) Capture per the three-artifact rule: tx hash **+ full JSON response + explorer screenshot**, plus engine logs and alert email screenshots → `docs/EVIDENCE.md`. Same day, not later.
- **🔴 HARD DATE GATE — Fri Sep 18: the engine must be running unattended against guinea-pig B.**
  This is the one date in the sprint that is not ours to move. B's threshold crossing is projected for **Sun 2026-09-20 ~12:00 UTC**, and drift can run **early**. Both failure modes are silent and unrecoverable inside the sprint: the engine live too late and the crossing passes unobserved; B in the config with a wrong threshold and it gets bumped before the crossing.

  **The gate is Friday Sep 18, not Saturday Sep 19.** Sep 19 is a Saturday and Sep 20 is a Sunday — and we replanned to 24 effective days precisely because weekends are not real working days. The most important, least recoverable event in the sprint lands on a Sunday with its gate on a Saturday. **Friday is the gate; Saturday is margin, not the deadline.**

  **The crossing will happen with nobody watching, which is the claim** — "unattended" is the entire point, so that is not a hardship. But it means the **alerting path must be verified working before Sep 18** (`W3-D17-04`), not merely built. If the engine bumps B on Sunday and no alert fires, we still have the event but a weaker evidence trail, and the confirming screenshots get taken after the fact rather than as it happens.

  **C's Sep 25 crossing is a Friday** — a working day, people around. That is another point in C's favour, and an argument for treating B as the proof that may be observed imperfectly rather than the one everything depends on.
  The gate is **not** "the W1-D5 hosting decision is deployed and hardened." It is: *the engine's decision-and-bump path is running unattended on some scheduler, watching B, at the calibrated threshold.* The `W3-D18-00` fallback runner satisfies it. If production is ready, use production; if not, the proof still lands.
  Guinea-pig C (crossing **Sep 25**) is the second shot if Sep 20 is missed. Do not treat C as a reason to relax about Sep 19.
- **Stage 1 gate:** an unattended bump has demonstrably happened on testnet with proof that survives a testnet reset. **Deliverable 2's core is now safe.** Everything after this is hardening.

### Day 19 · Stage 2 spike — policy signer
*Planned: Mon Sep 21 — may slip; the D-number does not.*
- [ ] **W3-D19-01** (R) Spike `stellar/passkey-kit`: deploy a smart account on testnet, register an **Ed25519 signer** (not passkey/WebAuthn — we need headless).
- [ ] **W3-D19-02** (R) Attach a policy scoping that signer to `extendTTL` only; verify a fund-moving call is actually **rejected**. *A signer that works but can also move funds is a failed spike, not a partial success.*
  - **Write the failing case first.** A scope check that has only ever been observed permitting things has the same invisible-failure shape as the `W1-D4-00` testnet guard, which refused everything and looked fine because nothing failed loudly. Exercise the mechanism in **both** directions: it must permit `extendTTL` *and* reject a fund-moving call, with both observed. The same applies to the dry-run default (`W2-D11-04`) — prove it does not submit, not just that it runs.
- [ ] **W3-D19-03** (R) End-to-end: script signs and submits `extendTTL` through the policy signer, fully headless. Capture the tx hash with all three artifacts.

### Day 20 · Stage 2 decision + hardening
*Planned: Tue Sep 22 — may slip; the D-number does not.*
- [ ] **W3-D20-01** (S) **Go/no-go on Stage 2.** Go → wire it in behind the `Signer` interface as the documented hardened path. No-go → fall back to OpenZeppelin (ADR-002 Option B; Rakha's Rust is solid, and this is no longer on the critical path so it can take the time it takes) **or** ship policy scoping documented as partial with full scoping deferred to SOW 2. Record the outcome in ADR-002's update log — amend, don't rewrite.
- [ ] **W3-D20-02** (R) Failure modes: RPC timeout, insufficient balance, policy rejection, scheduler missed run. Each must alert, not fail silently.
- [ ] **W3-D20-03** (R) `docs/POLICY-SIGNER.md` setup guide — required SOW evidence for Deliverable 2. Present it as **the hardened path for self-hosters**: in v1 the hot key sits on the user's server with the user's lumens on it, so capping it protects *them*. That is the reason worth reading, not the SOW line item.

### Day 21 · W3 review
*Planned: Wed Sep 23 — may slip; the D-number does not.*
- [ ] **W3-D21-01** (S) **Week 3 review** + evidence snapshot #3. Confirm every transaction row carries all three artifacts.
- [ ] **W3-D21-02** (S) Reconcile the slack ledger: how many of the six are gone, and what took them.
- **Milestone gate:** unattended non-custodial bump proven with reset-proof evidence (Stage 1), and Stage 2 either shipped or explicitly, honestly documented as partial.

---

## Week 4 — Dashboard, CI check, docs, Deliverable 3 (Sep 24 – Sep 30)

**Reallocated 2026-09-04.** Week 4 was arithmetically impossible: it was full before the dashboard write path was added, and nearly every task belonged to Fatih. The Week 3 rescope frees Rakha earlier than planned — Stage 1 lands ~Sep 19 where the old plan had him occupied through Sep 23 — so the Action, the npm publish, and his own components' docs move to him.

Fatih keeps dashboard, README, troubleshooting, demo video, and evidence assembly. Still full; no longer impossible.

> **Dependency:** if Stage 2 runs long, `W4-D25` (Action) and `W4-D27` (npm publish) come back to Fatih. That is the first sign Week 4 is in trouble — surface it in STATUS the day it happens, don't absorb it quietly.

### Day 22 · Dashboard — public read-only (P0)
*Planned: Thu Sep 24 — may slip; the D-number does not.*
- [ ] **W4-D22-01** (F) Dashboard scaffold. **No wallet, no signup, no accounts.** Build the public view as the whole product — the write path is additive and must be removable without leaving dead buttons or empty auth-gated regions.
- [ ] **W4-D22-02** (F) **Scan any contract.** Paste any contract ID → TTL health, projected archive date, rent estimate. Scanning is a permissionless read, `core` already does it, and the dashboard already renders `ScanResult` — near-zero cost, and it makes the deployed instance a real utility for strangers rather than a display case.

### Day 23 · Dashboard — status and history
*Planned: Fri Sep 25 — may slip; the D-number does not.*
- [ ] **W4-D23-01** (F) Contract list view: TTL health, projected archive date, last bump. **Surface shared code entries** — a list showing N healthy contracts whose common code entry expires tomorrow is the exact failure this tool exists to prevent.
- [ ] **W4-D23-02** (F) Bump history view reading real `BumpRecord` data from W3. For contracts this instance doesn't monitor, the section reads "not monitored by this instance" — it must not imply the contract is unprotected.
- [ ] **W4-D23-03** (F) Empty states + error states (unknown contract, no history, RPC down).

### Day 24 · Deploy
*Planned: Sat Sep 26 — may slip; the D-number does not.*
- [ ] **W4-D24-01** (F) Deploy to the hosting set up in `W1-D5-02` — **live public URL** (required evidence). This is a demonstration instance, not a service: no registration, no accounts, no storing strangers' contract IDs.
- [ ] **W4-D24-02** (F) Mobile-reasonable layout; the Ambassador may review on a phone.
- [ ] **W4-D24-03** (F) Rent cost view: estimated ongoing storage cost per contract *(P1 — cut order #3)*.
- [ ] **W4-D24-04** (F) Wallet-connect + user-signed "extend now" *(P1 — the DX feature; ship only if the `W2-D13-02` spike said it fits. Wallet-connect authorizes a **payment**, never access — check the UI copy says so.)*

### Day 25 · `evergreen-check` Action — **owner: R**
*Planned: Sun Sep 27 — may slip; the D-number does not.*
- [ ] **W4-D25-01** (R) `evergreen-check` GitHub Action: `action.yml`, wraps the CLI, fails the job below threshold.
- [ ] **W4-D25-02** (R) Test it in a **separate** throwaway repo — proving it works for someone who isn't us.
- [ ] **W4-D25-03** (R) Publish/tag the Action so it's referenceable as `apex/evergreen-check@v1`; screenshot a red run and a green run.

### Day 26 · Docs
*Planned: Mon Sep 28 — may slip; the D-number does not.*
- [ ] **W4-D26-01** (F) Root `README.md`: what Evergreen is, install, 60-second quickstart, screenshots. Quickstart teaches the **plain funded account**; the policy signer is the documented hardened path, not the default (ADR-002 amendment).
- [ ] **W4-D26-02** (R) Engine setup guide + CI Action usage guide — his components, his docs.
- [ ] **W4-D26-03** (S) Troubleshooting page from every real failure we hit during the sprint *(cut order #4 for depth, not existence)*.
- [ ] **W4-D26-04** (S) `CONTRIBUTING.md` + roadmap naming SOW 2 candidates (hosted engine per ADR-004, mainnet, Telegram channel, always-on mode, dashboard write path if it slipped).

### Day 27 · Publish — **owner: R**
*Planned: Tue Sep 29 — may slip; the D-number does not.*
- [ ] **W4-D27-01** (R) `npm publish --dry-run`, verify package contents (no secrets, no junk, correct files field).
- [ ] **W4-D27-02** (R) Publish `packages/core` + `packages/cli` to npm; verify a clean `npx evergreen scan ...` works on a machine that never saw the repo.
- [ ] **W4-D27-03** (R) Git tag + GitHub release with notes.

### Day 28 · Demo + W4 review
*Planned: Wed Sep 30 — may slip; the D-number does not.*
- [ ] **W4-D28-01** (S) Demo video script (3–5 min): problem → scan → auto-bump saving a contract → dashboard → CI check. **If `F-01` finds code-entry sharing is common, lead with it** *(and if `F-01` never happens, lead with something else — it is not a blocker)*: *"your 40 vault contracts share one code entry that expires Thursday"* is a non-obvious operational trap, and non-obvious traps are what make tooling worth installing.
- [ ] **W4-D28-02** (S) Record + edit; upload; put the link in `docs/EVIDENCE.md`.
- [ ] **W4-D28-03** (S) **Week 4 review** + evidence snapshot #4.
- **Milestone gate:** all three deliverables shipped and publicly reachable.

---

## Buffer — Evidence & submission (Oct 1 – Oct 2)

### Day 29
*Planned: Thu Oct 1 — may slip; the D-number does not.*
- [ ] **B-D29-01** (S) Assemble the evidence bundle exactly per SOW §6.1: repo link, npm links, CLI screenshots, coverage report, tx hashes, engine logs, alert screenshots, policy-signer guide, dashboard URL, Action link, demo video.
- [ ] **B-D29-02** (F) Write a one-page verification walkthrough for Kenny — a non-technical reviewer should be able to confirm each deliverable in under 10 minutes.
- [ ] **B-D29-03** (S) Fresh-machine test: clone, install, run, following only the README. Fix whatever breaks.

### Day 30 · Submit
*Planned: Fri Oct 2 — may slip; the D-number does not.*
- [ ] **B-D30-01** (F) Send the evidence bundle to the Ambassador Chapter Lead for the Airtable submission.
- [ ] **B-D30-02** (S) Retro: what slipped, what we cut, what we learned.
- [ ] **B-D30-03** (S) Draft the SOW 2 candidate list (mainnet auto-bump, Telegram/webhook channels, always-on mode, custom policy contract if A/B fell short).

---

## Floating tasks — no day, no dependency

Work that belongs to no particular day because nothing is blocked by not having it. Do them on whichever day has room. **If no day has room, they don't happen** — that is the intended outcome, not a failure, and it is why they live here instead of occupying a slot in a week that is already full.

- [ ] **F-01** (R) **Measure how often deployed contracts actually share a code entry.** Sample third-party testnet contracts and count distinct `ContractCode` entries against contract count. We are reasoning from how contracts are *usually* structured; find out instead.
  - *Only consumer:* the demo video's framing at `W4-D28-01`. **Common** → shared-entry detection leads the demo and is a real differentiator for the standard-rent-tooling ambition. **Rare** → it stays a correctness requirement and a footnote. **Not knowing** → the demo leads with something else, which is fine.
  - *Due:* any time before `W4-D28-01`. Originally filed as `W2-D12-02b`; moved out because nothing in Week 2 depends on it and leaving it there made it a cut decision later instead of a non-decision now.

## Cut order (when — not if — we run out of time)

Cut from the bottom up, in this exact order. Never improvise the cut order mid-week:

1. **W2-D13-03** batch scan (P1)
2. **W2-D12** storage optimizer depth — ship basic flags, drop advanced heuristics (P1)
3. **W4-D24-04** dashboard wallet-connect + "extend now" (P1) — decided early by the `W2-D13-02` spike rather than late under pressure; SOW 2 is a strong home for it
4. **W4-D24-03** dashboard rent cost view — scan, status and history are the P0 parts
5. **W4-D26-03** troubleshooting depth
6. *Never cut:* evidence capture, the demo video, the unattended bump proof (`W3-D18-02a`/`b`), or the fresh-machine test. These are what the grant is judged on.

**Not on this list, and not cuttable by improvisation:** the Stage 2 policy signer is SOW-named in both Deliverable 2's description and its evidence list. If it cannot ship, it ships *documented as partial* with scoping deferred to SOW 2 — and Fatih raises that with the Ambassador Chapter Lead when it becomes likely, not at review.
