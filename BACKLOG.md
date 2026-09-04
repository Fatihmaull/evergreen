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
*Planned: Wed Sep 3 — may slip; the D-number does not.*
- [x] **W1-D1-01** (S) Re-read the signed SOW; confirm the three deliverables and out-of-scope list are what we're actually building.
- [x] **W1-D1-02** (S) Confirm official sprint start = Sep 3, deadline = Oct 2.
- [ ] **W1-D1-03** (F) Send the start-date confirmation message to Kenny Rivaldi (Ambassador Chapter Lead) so his records match ours. *Carried into D3 if not sent.*

### Day 2 · Product definition
*Planned: Thu Sep 4 — may slip; the D-number does not.*
- [x] **W1-D2-01** (S) Write the PRD (`docs/PRD.md`) — problem, goals, non-goals, personas, requirements P0/P1/P2, metrics.
- [x] **W1-D2-02** (S) Research policy-signer tooling; decide build vs. buy (→ `docs/adr/ADR-002`).
- [x] **W1-D2-03** (S) Decide engine runtime shape: scheduled serverless, not always-on (→ `docs/adr/ADR-001`).
- [x] **W1-D2-04** (S) Write this backlog + the agent context docs (`CLAUDE.md`, `docs/CONVENTIONS.md`, `docs/SOROBAN-PRIMER.md`, `docs/STATUS.md`).

### Day 3 · Repo & toolchain
*Planned: Fri Sep 5 — may slip; the D-number does not.*
- [ ] **W1-D3-01** (F) Create the GitHub repo `evergreen` (public, MIT, Apex-owned). Push these docs as the first commit — docs land before code.
- [ ] **W1-D3-02** (F) Monorepo skeleton: pnpm workspaces, root `tsconfig.base.json`, strict TS, ESLint + Prettier, **Vitest** (decided — ADR-003 Part 1), Node 24 pinned via `.nvmrc`.
- [ ] **W1-D3-03** (R) Package boundaries created empty but importable: `packages/core`, `packages/cli`, `packages/engine`, `packages/shared-types`, `apps/dashboard`. Each with its own `package.json`, `README.md` stub, and passing no-op test.
- [ ] **W1-D3-04** (F) CI workflow: install → typecheck → lint → test on every PR. It must be green on the skeleton before any feature work.
- [ ] **W1-D3-05** (F) Repo hygiene: branch protection on `main`, PR template, issue templates, `CODEOWNERS`, `.gitignore` covering `.env*` and key material, commit convention documented in `docs/CONVENTIONS.md`.
- **Done when:** a fresh `git clone && pnpm install && pnpm test` passes on both machines.

### Day 4 · Stellar/Soroban dev environment
*Planned: Sat Sep 6 — may slip; the D-number does not.*
- [ ] **W1-D4-01** (R) Install and pin the Stellar CLI + Soroban tooling versions on both machines; record exact versions in `docs/SETUP.md`.
- [ ] **W1-D4-02** (R) Generate testnet keypairs (one per developer + one for the future bot); fund via friendbot. **Testnet only — never a mainnet key, never a real-funds key.**
- [ ] **W1-D4-03** (R) Configure Soroban RPC endpoint + network passphrase as env vars; document `.env.example` (no real values committed, ever).
- [ ] **W1-D4-04** (S) Deploy **guinea-pig A** to testnet — our working test subject for the sprint. Record the contract ID in `docs/SETUP.md`.
- [ ] **W1-D4-04b** (S) **Measure the real TTL floor per entry type** (instance, code, persistent, temporary) on a fresh deploy and record the numbers in `docs/SOROBAN-PRIMER.md` § Measured TTL floors. Two things depend on these and neither can be guessed: the bump threshold has to be set against a real floor, and whether the natural-decay proof is achievable in-sprint at all.
- [ ] **W1-D4-04c** (S) Deploy **guinea-pig B** and leave it to age. This is the natural-decay subject for `W3-D20-02b` — the proof that a contract *which would otherwise have been archived* was saved. Deployed on Day 4 rather than Week 3 because it needs the intervening weeks to decay. ⚠️ **Guinea-pig B stays out of the engine's watched-contract config until the moment of proof** — if the engine sees it, it will bump it and destroy the evidence. Put a comment in the config saying so.
- [ ] **W1-D4-05** (R) Manually call `getLedgerEntries` against guinea-pig A and eyeball a real `liveUntilLedgerSeq`. Paste the raw response into `docs/SOROBAN-PRIMER.md` as a reference fixture.
- [ ] **W1-D4-06** (R) **Empirical permissionless check (20 min, do it early).** Rakha extends the TTL of a contract deployed by *Fatih's* account. Confirms in practice what Stellar's docs state — that `extendTTL` needs no authorization from the contract's owner. The whole Week 3 rescope rests on this. If it fails, **stop and escalate**: that discovery outranks everything else in the plan. Record the result in `docs/SOROBAN-PRIMER.md` either way — a confirmation is worth recording as much as a contradiction is worth escalating.
- **Done when:** both devs can hit testnet RPC and read live TTL data from our own contract, TTL floors are recorded, guinea-pig B is aging, and the permissionless property is confirmed on the network.

### Day 5 · Third-party services & accounts
*Planned: Sun Sep 7 — may slip; the D-number does not.*
- [ ] **W1-D5-01** (F) Reserve the npm scope/package names (`evergreen` CLI + core). Confirm availability *now*, not in Week 4.
- [ ] **W1-D5-02** (F) Dashboard hosting account + empty project deployed (Vercel/Netlify/Cloudflare — pick one, record in ADR-003). A "hello world" deploy must be live by end of day.
- [ ] **W1-D5-03** (R) Scheduler platform decided and a trivial cron job running end-to-end (GitHub Actions cron vs Cloudflare Workers cron — see ADR-001). Prove it can run on schedule and log output before we trust it with bumps.
- [ ] **W1-D5-04** (R) Email provider account (Resend/SendGrid/etc.) + a test email successfully sent from code in the sandbox.
- [ ] **W1-D5-05** (F) Secrets handling: where do prod-ish secrets live (GitHub Actions secrets / hosting env vars)? Document the rule in `docs/CONVENTIONS.md`. **No secret ever enters git, a doc, or a chat log.**
- [ ] **W1-D5-06** (S) Create the shared evidence folder (cloud drive) referenced by `docs/EVIDENCE.md`, for screenshots and video.
- **Done when:** every external dependency the next 3 weeks need is authenticated and smoke-tested.

### Day 6 · Contracts-first design
*Planned: Mon Sep 8 — may slip; the D-number does not.*
- [ ] **W1-D6-01** (R) Define shared TypeScript types in `packages/shared-types`: `ContractRef`, `LedgerEntryTTL`, `ScanResult`, `RentEstimate`, `BumpDecision`, `BumpRecord`, `NotificationChannel`, `EvergreenConfig`, `Signer`. These are the seams every later task codes against — and per CLAUDE.md they must not churn mid-week, so get them right today.
- [ ] **W1-D6-01b** (R) Honour the three ADR-004 shape constraints, all cheap now and expensive later: `BumpRecord` carries **payer** as a field distinct from the contract (and which signer produced it); `EvergreenConfig` expresses **N contracts × M payers**, not one global bot; `Signer` is an **interface** resolved per payer, so Stage 1 (plain funded account) and Stage 2 (policy signer) are drop-in. v1 implements no multi-tenancy — it must only avoid foreclosing it.
- [ ] **W1-D6-02** (R) Write `docs/ARCHITECTURE.md` data-flow section against those types (RPC → core → {CLI, engine, dashboard}).
- [ ] **W1-D6-03** (F) Test harness: fixtures directory, a recorded RPC response fixture, and a mock RPC client so unit tests never hit the network.
- [ ] **W1-D6-04** (F) Decide and document the persistence choice for bump history (flat JSON file vs SQLite vs hosted KV) in ADR-003 — the dashboard and engine both read it, so it can't be decided ad hoc in Week 3.
- **Done when:** an agent can open `shared-types` and know exactly what shape every module speaks.

### Day 7 · First vertical slice + W1 review
*Planned: Tue Sep 9 — may slip; the D-number does not.*
- [ ] **W1-D7-01** (F) `evergreen scan <contract-id>` — thinnest possible end-to-end path: CLI → core → real testnet RPC → prints remaining TTL. No cost model yet, no pretty output.
- [ ] **W1-D7-02** (F) Unit test for the TTL-remaining calculation using the recorded fixture.
- [ ] **W1-D7-03** (S) **Week 1 review:** walk the W1 checklist, mark STATUS.md, screenshot the working scan (evidence snapshot #1).
- [ ] **W1-D7-04** (S) Adjust W2–W4 tasks if W1 revealed anything (e.g. RPC quirks, tooling surprises). Record changes in STATUS.md.
- **Milestone gate:** if `scan` doesn't return real testnet data by end of Sep 9, W2 starts with this task, and the first P1 item gets cut.

---

## Week 2 — Core CLI, Deliverable 1 (Sep 10 – Sep 16)

### Day 8
*Planned: Wed Sep 10 — may slip; the D-number does not.*
- [ ] **W2-D8-01** (F) TTL math module: remaining ledgers → projected archive ledger → projected archive **date** using network ledger-close cadence.
- [ ] **W2-D8-02** (F) Unit tests incl. edge cases: already-archived entry, entry with no TTL, ledger close-time drift.
- [ ] **W2-D8-03** (R) Scan all entry types for a contract (instance, code/wasm, persistent, temporary) — not just one; each has different archival behavior (see `docs/SOROBAN-PRIMER.md`).

### Day 9
*Planned: Thu Sep 11 — may slip; the D-number does not.*
- [ ] **W2-D9-01** (R) Rent/cost estimation model: what does extending N ledgers cost, per entry and per contract?
- [ ] **W2-D9-02** (R) Validate the estimate against a real testnet transaction's actual fee — the model is worthless if it's off by an order of magnitude. Record the comparison.
- [ ] **W2-D9-03** (F) Unit tests for the cost model with fixture inputs.

### Day 10
*Planned: Fri Sep 12 — may slip; the D-number does not.*
- [ ] **W2-D10-01** (F) CLI UX: `--json` vs human-readable output, colored TTL health states (healthy / warning / critical), `--help` that a stranger can follow.
- [ ] **W2-D10-02** (F) Proper exit codes (0 healthy, non-zero when below threshold) — the GitHub Action in W4 depends on this.
- [ ] **W2-D10-03** (F) Error handling: bad contract ID, RPC down, network mismatch, archived entry. Every failure gets a human-readable message, never a raw stack trace.

### Day 11 · First write transaction
*Planned: Sat Sep 13 — may slip; the D-number does not.*
- [ ] **W2-D11-01** (R) `evergreen extend <contract-id> --ledgers N` — manual `extendTTL` submission, signed locally by the developer key (not the policy signer yet).
- [ ] **W2-D11-02** (R) Execute on the guinea-pig contract; **capture the tx hash into `docs/EVIDENCE.md`** — this is required SOW evidence for Deliverable 2.
- [ ] **W2-D11-03** (R) Verify TTL actually increased by re-running `scan` before/after; screenshot both.
- [ ] **W2-D11-04** (F) Dry-run mode (`--dry-run`) that simulates without submitting. This becomes the engine's safety default in W3.

### Day 12
*Planned: Sun Sep 14 — may slip; the D-number does not.*
- [ ] **W2-D12-01** (R) Storage optimizer: flag entries that are oversized, duplicated, or better suited to temporary storage; output concrete recommendations, not just warnings.
- [ ] **W2-D12-02** (R) Run it against the guinea-pig contract + at least one third-party public testnet contract; sanity-check the advice isn't nonsense.

### Day 13
*Planned: Mon Sep 15 — may slip; the D-number does not.*
- [ ] **W2-D13-01** (F) Config file support (`evergreen.config.json`): contract list, thresholds, RPC URL, payer/signer resolution — shared later by the engine. Include the comment marking guinea-pig B as deliberately unwatched (`W1-D4-04c`).
- [ ] **W2-D13-02** (F) **Wallet-connect spike (half a day, throwaway).** Connect a wallet, sign one `extendTTL` payment, throw the code away. Moved here from Week 4 deliberately: the transaction-building machinery from `W2-D11` is hot, this is Fatih's day, and it displaces the batch scan below, which is already first in the cut order. Turns the Week 4 job from *learn wallet integration under deadline* into *put a button on something that already works*. **If this spike says the write path is unshippable at 24 effective days, say so now** — an early, cheap decision, and SOW 2 is a strong home for it.
- [ ] **W2-D13-03** (F) Batch scan: multiple contracts in one command with a summary table *(P1 — cut this first if the week is tight)*.

### Day 14 · W2 review
*Planned: Tue Sep 16 — may slip; the D-number does not.*
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
*Planned: Wed Sep 17 — may slip; the D-number does not.*
- [ ] **W3-D15-01** (R) Engine core: read config → scan registered contracts → evaluate threshold rules → decide bump/no-bump. Dry-run by default.
- [ ] **W3-D15-02** (R) Threshold rules: bump when remaining TTL < X ledgers OR < Y days; per-contract overrides. Set thresholds against the **measured** floors from `W1-D4-04b`, not assumed ones.
- [ ] **W3-D15-03** (F) Unit tests for the decision logic with mocked scan results (no network).

### Day 16 · Bump execution
*Planned: Thu Sep 18 — may slip; the D-number does not.*
- [ ] **W3-D16-01** (R) Bump execution path behind the `Signer` interface, with retry + backoff. Stage 1 implementation = plain funded Ed25519 account holding only enough XLM to pay extend fees.
- [ ] **W3-D16-02** (R) Idempotency: never double-bump the same entry in one cycle; handle an in-flight tx across overlapping scheduler runs. This is the correctness property ADR-001 accepted the risk on — it needs the atomic write from ADR-003, so it cannot be faked with a flat file.
- [ ] **W3-D16-03** (F) Persist `BumpRecord` history per the ADR-003 decision, including **payer** and **which signer produced it**.

### Day 17 · Notifications
*Planned: Fri Sep 19 — may slip; the D-number does not.*
- [ ] **W3-D17-01** (R) `NotificationChannel` interface + `EmailChannel` implementation.
- [ ] **W3-D17-02** (R) Stub `WebhookChannel` / `TelegramChannel` — interface-conformant, deliberately unimplemented, clearly marked as SOW 2 scope. Foundation, not half-features.
- [ ] **W3-D17-03** (F) Email templates: bump succeeded, bump failed, contract approaching critical TTL. Send real test emails.

### Day 18 · **The proof** — end-to-end on a real schedule
*Planned: Sat Sep 20 — may slip; the D-number does not.*
- [ ] **W3-D18-01** (R) Deploy the engine to the scheduler chosen in `W1-D5-03`; run on a real cron cadence (5–15 min).
- [ ] **W3-D18-02a** (S) **Threshold proof (insurance — bank this first).** Set the threshold above guinea-pig A's current TTL; the engine fires on its next scheduled run, unattended. Proves detect-and-bump on a real cron. Cheap and repeatable.
- [ ] **W3-D18-02b** (S) **Natural-decay proof (the compelling one).** Guinea-pig B, deployed `W1-D4-04c` and aging since Sep 6, decays to threshold on its own and is saved with nobody watching. This is the claim the demo video makes. Achievable only if the floors measured at `W1-D4-04b` allow it — if not, say so in STATUS and ship the threshold proof described honestly.
- [ ] **W3-D18-03** (S) Capture per the three-artifact rule: tx hash **+ full JSON response + explorer screenshot**, plus engine logs and alert email screenshots → `docs/EVIDENCE.md`. Same day, not later.
- **Stage 1 gate:** an unattended bump has demonstrably happened on testnet with proof that survives a testnet reset. **Deliverable 2's core is now safe.** Everything after this is hardening.

### Day 19 · Stage 2 spike — policy signer
*Planned: Sun Sep 21 — may slip; the D-number does not.*
- [ ] **W3-D19-01** (R) Spike `stellar/passkey-kit`: deploy a smart account on testnet, register an **Ed25519 signer** (not passkey/WebAuthn — we need headless).
- [ ] **W3-D19-02** (R) Attach a policy scoping that signer to `extendTTL` only; verify a fund-moving call is actually **rejected**. *A signer that works but can also move funds is a failed spike, not a partial success.*
- [ ] **W3-D19-03** (R) End-to-end: script signs and submits `extendTTL` through the policy signer, fully headless. Capture the tx hash with all three artifacts.

### Day 20 · Stage 2 decision + hardening
*Planned: Mon Sep 22 — may slip; the D-number does not.*
- [ ] **W3-D20-01** (S) **Go/no-go on Stage 2.** Go → wire it in behind the `Signer` interface as the documented hardened path. No-go → fall back to OpenZeppelin (ADR-002 Option B; Rakha's Rust is solid, and this is no longer on the critical path so it can take the time it takes) **or** ship policy scoping documented as partial with full scoping deferred to SOW 2. Record the outcome in ADR-002's update log — amend, don't rewrite.
- [ ] **W3-D20-02** (R) Failure modes: RPC timeout, insufficient balance, policy rejection, scheduler missed run. Each must alert, not fail silently.
- [ ] **W3-D20-03** (R) `docs/POLICY-SIGNER.md` setup guide — required SOW evidence for Deliverable 2. Present it as **the hardened path for self-hosters**: in v1 the hot key sits on the user's server with the user's lumens on it, so capping it protects *them*. That is the reason worth reading, not the SOW line item.

### Day 21 · W3 review
*Planned: Tue Sep 23 — may slip; the D-number does not.*
- [ ] **W3-D21-01** (S) **Week 3 review** + evidence snapshot #3. Confirm every transaction row carries all three artifacts.
- [ ] **W3-D21-02** (S) Reconcile the slack ledger: how many of the six are gone, and what took them.
- **Milestone gate:** unattended non-custodial bump proven with reset-proof evidence (Stage 1), and Stage 2 either shipped or explicitly, honestly documented as partial.

---

## Week 4 — Dashboard, CI check, docs, Deliverable 3 (Sep 24 – Sep 30)

**Reallocated 2026-09-04.** Week 4 was arithmetically impossible: it was full before the dashboard write path was added, and nearly every task belonged to Fatih. The Week 3 rescope frees Rakha earlier than planned — Stage 1 lands ~Sep 19 where the old plan had him occupied through Sep 23 — so the Action, the npm publish, and his own components' docs move to him.

Fatih keeps dashboard, README, troubleshooting, demo video, and evidence assembly. Still full; no longer impossible.

> **Dependency:** if Stage 2 runs long, `W4-D25` (Action) and `W4-D27` (npm publish) come back to Fatih. That is the first sign Week 4 is in trouble — surface it in STATUS the day it happens, don't absorb it quietly.

### Day 22 · Dashboard — public read-only (P0)
*Planned: Wed Sep 24 — may slip; the D-number does not.*
- [ ] **W4-D22-01** (F) Dashboard scaffold. **No wallet, no signup, no accounts.** Build the public view as the whole product — the write path is additive and must be removable without leaving dead buttons or empty auth-gated regions.
- [ ] **W4-D22-02** (F) **Scan any contract.** Paste any contract ID → TTL health, projected archive date, rent estimate. Scanning is a permissionless read, `core` already does it, and the dashboard already renders `ScanResult` — near-zero cost, and it makes the deployed instance a real utility for strangers rather than a display case.

### Day 23 · Dashboard — status and history
*Planned: Thu Sep 25 — may slip; the D-number does not.*
- [ ] **W4-D23-01** (F) Contract list view: TTL health, projected archive date, last bump.
- [ ] **W4-D23-02** (F) Bump history view reading real `BumpRecord` data from W3. For contracts this instance doesn't monitor, the section reads "not monitored by this instance" — it must not imply the contract is unprotected.
- [ ] **W4-D23-03** (F) Empty states + error states (unknown contract, no history, RPC down).

### Day 24 · Deploy
*Planned: Fri Sep 26 — may slip; the D-number does not.*
- [ ] **W4-D24-01** (F) Deploy to the hosting set up in `W1-D5-02` — **live public URL** (required evidence). This is a demonstration instance, not a service: no registration, no accounts, no storing strangers' contract IDs.
- [ ] **W4-D24-02** (F) Mobile-reasonable layout; the Ambassador may review on a phone.
- [ ] **W4-D24-03** (F) Rent cost view: estimated ongoing storage cost per contract *(P1 — cut order #3)*.
- [ ] **W4-D24-04** (F) Wallet-connect + user-signed "extend now" *(P1 — the DX feature; ship only if the `W2-D13-02` spike said it fits. Wallet-connect authorizes a **payment**, never access — check the UI copy says so.)*

### Day 25 · `evergreen-check` Action — **owner: R**
*Planned: Sat Sep 27 — may slip; the D-number does not.*
- [ ] **W4-D25-01** (R) `evergreen-check` GitHub Action: `action.yml`, wraps the CLI, fails the job below threshold.
- [ ] **W4-D25-02** (R) Test it in a **separate** throwaway repo — proving it works for someone who isn't us.
- [ ] **W4-D25-03** (R) Publish/tag the Action so it's referenceable as `apex/evergreen-check@v1`; screenshot a red run and a green run.

### Day 26 · Docs
*Planned: Sun Sep 28 — may slip; the D-number does not.*
- [ ] **W4-D26-01** (F) Root `README.md`: what Evergreen is, install, 60-second quickstart, screenshots. Quickstart teaches the **plain funded account**; the policy signer is the documented hardened path, not the default (ADR-002 amendment).
- [ ] **W4-D26-02** (R) Engine setup guide + CI Action usage guide — his components, his docs.
- [ ] **W4-D26-03** (S) Troubleshooting page from every real failure we hit during the sprint *(cut order #4 for depth, not existence)*.
- [ ] **W4-D26-04** (S) `CONTRIBUTING.md` + roadmap naming SOW 2 candidates (hosted engine per ADR-004, mainnet, Telegram channel, always-on mode, dashboard write path if it slipped).

### Day 27 · Publish — **owner: R**
*Planned: Mon Sep 29 — may slip; the D-number does not.*
- [ ] **W4-D27-01** (R) `npm publish --dry-run`, verify package contents (no secrets, no junk, correct files field).
- [ ] **W4-D27-02** (R) Publish `packages/core` + `packages/cli` to npm; verify a clean `npx evergreen scan ...` works on a machine that never saw the repo.
- [ ] **W4-D27-03** (R) Git tag + GitHub release with notes.

### Day 28 · Demo + W4 review
*Planned: Tue Sep 30 — may slip; the D-number does not.*
- [ ] **W4-D28-01** (S) Demo video script (3–5 min): problem → scan → auto-bump saving a contract → dashboard → CI check.
- [ ] **W4-D28-02** (S) Record + edit; upload; put the link in `docs/EVIDENCE.md`.
- [ ] **W4-D28-03** (S) **Week 4 review** + evidence snapshot #4.
- **Milestone gate:** all three deliverables shipped and publicly reachable.

---

## Buffer — Evidence & submission (Oct 1 – Oct 2)

### Day 29
*Planned: Wed Oct 1 — may slip; the D-number does not.*
- [ ] **B-D29-01** (S) Assemble the evidence bundle exactly per SOW §6.1: repo link, npm links, CLI screenshots, coverage report, tx hashes, engine logs, alert screenshots, policy-signer guide, dashboard URL, Action link, demo video.
- [ ] **B-D29-02** (F) Write a one-page verification walkthrough for Kenny — a non-technical reviewer should be able to confirm each deliverable in under 10 minutes.
- [ ] **B-D29-03** (S) Fresh-machine test: clone, install, run, following only the README. Fix whatever breaks.

### Day 30 · Submit
*Planned: Thu Oct 2 — may slip; the D-number does not.*
- [ ] **B-D30-01** (F) Send the evidence bundle to the Ambassador Chapter Lead for the Airtable submission.
- [ ] **B-D30-02** (S) Retro: what slipped, what we cut, what we learned.
- [ ] **B-D30-03** (S) Draft the SOW 2 candidate list (mainnet auto-bump, Telegram/webhook channels, always-on mode, custom policy contract if A/B fell short).

---

## Cut order (when — not if — we run out of time)

Cut from the bottom up, in this exact order. Never improvise the cut order mid-week:

1. **W2-D13-03** batch scan (P1)
2. **W2-D12** storage optimizer depth — ship basic flags, drop advanced heuristics (P1)
3. **W4-D24-04** dashboard wallet-connect + "extend now" (P1) — decided early by the `W2-D13-02` spike rather than late under pressure; SOW 2 is a strong home for it
4. **W4-D24-03** dashboard rent cost view — scan, status and history are the P0 parts
5. **W4-D26-03** troubleshooting depth
6. *Never cut:* evidence capture, the demo video, the unattended bump proof (`W3-D18-02a`/`b`), or the fresh-machine test. These are what the grant is judged on.

**Not on this list, and not cuttable by improvisation:** the Stage 2 policy signer is SOW-named in both Deliverable 2's description and its evidence list. If it cannot ship, it ships *documented as partial* with scoping deferred to SOW 2 — and Fatih raises that with the Ambassador Chapter Lead when it becomes likely, not at review.
