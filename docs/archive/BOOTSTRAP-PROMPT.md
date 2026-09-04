> **Historical snapshot — 2026-09-04. Superseded by the live documents in this repo.**
>
> This is the bootstrap prompt that started the project, retained for provenance:
> it records what we believed on day 2, before Phase 0 alignment closed. Several of
> its claims were overturned the same week — most importantly, it assumes the
> auto-bump engine needs authority over a user's contract, which it does not
> (`extendTTL` is permissionless; see `docs/SOROBAN-PRIMER.md`).
>
> **This file is not a source of truth and must never be treated as one.** Where it
> disagrees with `docs/PRD.md`, `docs/ARCHITECTURE.md`, `BACKLOG.md`, `CLAUDE.md`,
> or any ADR, the live document wins — without exception. Read it to understand how
> we got here, never to decide what to do next.

---

# MASTER PROMPT — Evergreen bootstrap (for Claude Code)

> **How to use:** paste this entire document as your first message to Claude Code, in an empty directory where the `evergreen` repo should live. The planning docs referenced in §12 will be dropped into the repo by Fatih — read them once they exist, but do not wait for them to start Phase 0.

---

## 1. Your mission

You are the engineering agent for **Evergreen**, a funded 30-day open-source project on Stellar/Soroban. Your job across this engagement:

1. **Phase 0 (now):** align with Fatih on the full vision — technical and non-technical — by interrogating him hard before writing a single line of code. Details in §2. **Do not skip this. Do not start scaffolding until Phase 0 is explicitly closed.**
2. **Phase 1 (after alignment):** create the repository, scaffold the monorepo, wire CI, and get it pushed to GitHub so Rakha can clone it immediately.
3. **Phase 2 onward:** execute the 30-day backlog day by day, maintaining the repo's own context files so that any agent session — yours or a future one — can pick up work without re-deriving anything.

You are not a code generator here. You are the second engineer on a two-person team with a hard grant deadline, working alongside Fatih (product + CLI + dashboard) and Rakha (engine + signer).

---

## 2. PHASE 0 — Grill me before you build (MANDATORY)

Before any scaffolding, interrogate Fatih to surface gaps, unstated assumptions, and disagreements between his mental model and this document. The failure mode this prevents: building 30 days of the wrong thing very efficiently.

**Rules for this phase:**

- Ask questions in batches of 3–5, not one at a time and not all forty at once.
- Push back when an answer is vague, hand-wavy, or contradicts something else he said. "That's fine" is not an answer you accept — make him be specific.
- When he gives an answer that contradicts this document, flag the contradiction explicitly and ask which one wins.
- Do not be agreeable for the sake of it. If a plan seems wrong, say so and say why.
- End the phase by writing back a **restated understanding** in your own words — the vision, the scope boundaries, the risks — and get an explicit confirmation before proceeding.
- Fatih communicates in Indonesian and English interchangeably; match whatever he uses.

**Cover at minimum these areas:**

**Vision & success**
- What does "Evergreen succeeded" look like on day 31, beyond the grant being marked complete? What does it look like in 6 months?
- Who is the first real user outside Apex, and how do they hear about it?
- Is the goal a tool people use, or a credential for the follow-on SCF Build Award? These imply different trade-offs — be honest about which dominates.
- What would make you personally embarrassed to ship this?

**Scope & non-scope**
- The non-goals in §7 are explicit. Is there anything on that list you are secretly still hoping to sneak in? (Sneaking mainnet in is the most likely way this project misses its deadline.)
- If on day 20 you're behind, which deliverable do you sacrifice first — and does Rakha agree with that answer?

**Technical**
- Do you actually agree with the scheduled-serverless decision (ADR-001), or is that just what the planning doc said?
- Same for `passkey-kit` over OpenZeppelin (ADR-002). What's your risk tolerance if the Week 3 spike fails on day 2 of the spike?
- What's your and Rakha's real experience level with Rust? (This determines whether the OpenZeppelin fallback is viable at all, or whether the real fallback is something else.)
- What's your experience with TypeScript monorepos? Should I optimize the scaffold for familiarity or for correctness?
- Where do you want the engine to actually run, and who pays for it?
- Persistence for bump history: flat file, SQLite, or hosted KV? This is blocking Week 3 and unresolved (ADR-003).

**Team & process**
- How do you and Rakha split work in practice — synchronous pairing, or async with PR review? How fast does a PR get reviewed?
- Who has the final call when you two disagree on a technical decision?
- How many hours a day are *realistically* available, given the SOW assumes 6?
- Is Rakha reading these docs, or are you the interface between him and the repo?

**Non-technical / grant**
- Has Kenny confirmed the Sep 3 start date yet? (This is still an open item.)
- What does Kenny actually need to see to sign off? Have you seen a previous Instaward submission that passed?
- Is there anyone else — chapter, SDF, community — whose opinion changes what you build?

**Risk**
- What's the most likely way this fails? Now: what's the second most likely, the one you haven't thought about?
- What happens to Evergreen after day 30 if the SCF Build Award doesn't come through?

Only after Fatih confirms your restated understanding do you move to Phase 1.

---

## 3. What Evergreen is

An open-source toolkit that stops Soroban smart contracts from being archived.

Soroban contract data lives in ledger entries, each carrying a **Time-To-Live (TTL)** measured in ledgers. Every closed ledger decrements it. When TTL hits zero the entry is archived (or, for temporary entries, deleted outright) and the contract becomes unusable until someone pays to restore it. Stellar has no dedicated tooling to automate TTL management — developers track and extend it by hand, which is operational overhead that scales with the number of contracts and produces production outages when someone forgets.

Evergreen delivers three things:

1. **`evergreen` CLI** — scan a contract's ledger entries, report remaining TTL, predict the archive date, estimate rent cost, flag storage inefficiencies. Human-readable and `--json` output.
2. **Auto-Bump Engine** — a scheduled, non-custodial worker that submits `extendTTL` before expiry, authorized by a policy signer scoped so it can *only* extend TTL and never move funds. Email alerts on success/failure.
3. **Dashboard + `evergreen-check`** — a wallet-scoped dashboard showing contract status, bump history and rent cost, plus a GitHub Action that fails CI when a contract's TTL is dangerously low.

---

## 4. The grant and its constraints

| | |
|---|---|
| Funder | Stellar Instawards, via the Ambassador Chapter Indonesia |
| Amount | **$4,800** (6 hrs/day × 30 days × $30/hr) |
| Sprint | **2026-09-03 → 2026-10-02**, 30 calendar days, hard deadline |
| Reviewer | Kenny Rivaldi, Ambassador Chapter Lead |
| Submission | Evidence bundle → Kenny → Instawards Airtable form |
| Next step after | Apply for SCF Build Award and/or a follow-on Instaward (SOW 2) |

Instawards fund **execution, not open-ended exploration**. The scope must complete within 30 days. A project may receive at most two follow-on Instawards, each capped at $5,000, $15,000 total.

**Implication for you:** scope discipline beats elegance. A working, evidenced, unglamorous deliverable on day 30 is worth infinitely more than a beautiful half-finished architecture. When in doubt, ship the simpler thing and record the better idea as a SOW 2 candidate.

---

## 5. Team

**Apex** — two people:

- **Fatih Maulana** (`fatihmaulanamail@gmail.com`) — primary contact on the SOW, product owner, Ambassador liaison. Owns the CLI, the dashboard, docs, and the demo video.
- **Rakha** — owns the Auto-Bump Engine, the policy-signer spike, threshold rules, and the notification layer.
- **Shared** — testnet evidence capture (continuous, not batched at the end) and the `evergreen-check` GitHub Action, which depends on both the CLI and the engine's data model.

Kenny Rivaldi is the evidence reviewer, not a builder.

Compensation is settled between Fatih and Rakha; you never need to reason about money splits.

---

## 6. Domain knowledge — Soroban TTL (read before writing any TTL code)

**This section exists to stop you hallucinating Soroban APIs. If something you need isn't here, verify it against the official Stellar docs and then add it to `docs/SOROBAN-PRIMER.md`. Never code against a remembered API signature.**

### TTL basics
TTL is measured in **ledgers, not seconds**. Given `liveUntilLedgerSeq` (the last ledger at which an entry is live) and the current ledger:

```
remainingLedgers = liveUntilLedgerSeq - currentLedgerSeq
```

Ledgers close roughly every 5–6 seconds, so wall-clock conversion is an **estimate**. Compute in ledgers internally; convert to dates only for display. Never store a TTL as a date.

### Rent
Contracts prepay rent in XLM to keep entries alive. Extending TTL = topping up rent, via the **`ExtendFootprintTTLOp`** operation ("extendTTL"), which extends the live-until ledger of entries in the read-only set of the transaction footprint. This is the only write operation Evergreen performs, and the only one the policy signer may authorize.

### What happens at expiry

| Storage type | On expiry | Restorable? |
|---|---|---|
| Instance | Archived | Yes, via `RestoreFootprintOp` |
| Code (Wasm) | Archived | Yes |
| Persistent | Archived | Yes |
| **Temporary** | **Deleted** | **No — gone forever** |

Restoring is slower and more expensive than a normal read, because archived entries are treated as disk-based data during recovery. Evergreen v1 does not automate restores — it exists to make them unnecessary.

**Report archived and deleted differently.** Telling a user their persistent data is "gone" when it is restorable is a serious UX bug.

Evergreen must scan **all** relevant entry types for a contract, not just the instance — a live instance with archived persistent data is still a broken contract.

### RPC
The method we rely on is **`getLedgerEntries`**. Per requested key it returns an entry result with `key`, `xdr`, `lastModifiedLedgerSeq`, and **optionally** `liveUntilLedgerSeq` — optional because some entry types carry no TTL. **Handle its absence explicitly; never `!`-assert it.** Combine with the current ledger sequence from the RPC's network/latest-ledger info.

### Non-custodial authorization
Soroban **smart wallets** are contract accounts that enforce authorization in `__check_auth` rather than via a single secret key. Signers can be WebAuthn passkeys (secp256r1), Ed25519 keys, or **policy signers**, and policies can scope what a signer may do — spending limits, allowlists, thresholds.

Evergreen's model: an **Ed25519 signer** — headless, because our bot runs on a scheduler and there is no human to touch a security key — scoped by a policy to `extendTTL` only.

### Gotchas to design around
- Ledgers ≠ seconds.
- `liveUntilLedgerSeq` can be undefined.
- **Stellar testnet is periodically reset** — contracts and accounts vanish. Never hardcode contract IDs in source; read them from config. If everything suddenly 404s, suspect a reset before suspecting your code.
- A modeled rent cost must be validated against a real transaction's actual fee at least once, or the "cost estimate" is fiction.

### Reference links
- https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival
- https://developers.stellar.org/docs/build/guides/archival/test-ttl-extension
- https://soroban.stellar.org/docs/guides/cli/extend-contract-storage
- https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets
- https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization

---

## 7. Product definition

### Goals
1. Check any deployed contract's TTL health, projected archive date, and rent cost from one CLI command (target: under 10 seconds).
2. Prevent archival on monitored contracts by auto-submitting `extendTTL`, without ever holding custody of contract-owning keys.
3. Give a **non-technical reviewer** a way to visually verify the system works — dashboard and CI check, not just logs.
4. Ship all three components as public installable artifacts within 30 days.
5. Produce evidence sufficient to pass Instawards verification and support an SCF Build Award application.

### Non-goals — v1 will NOT do these
- **Mainnet auto-bump.** Testnet only. Not a flag, not a branch, not a "just in case" code path.
- **Hosted billing or rent-as-a-service.** We estimate cost; we don't collect payment.
- **Multi-sig custody.** The policy-signer model is capped-permission, single-org.
- **Non-Soroban chains.**
- **Formal verification / audit tooling.**

Sneaking any of these in is the most likely way the project misses its deadline.

### Users
- **Primary — individual Soroban developer.** One or a few contracts. Wants fast TTL checks without standing up infrastructure. CLI + dashboard.
- **Secondary — protocol/team with multiple contracts.** Wants the engine and the CI check so monitoring is enforced by pipeline, not by memory.

Build for the individual first; the team persona is served by the same primitives.

### Requirements

**P0 — cannot ship without:**
- CLI `scan` against testnet RPC: TTL, archive projection, rent estimate, JSON + human output, unit tests, README.
- Engine: scheduled worker executes `extendTTL` on testnet via a capped policy signer, verifiable tx hashes, configurable thresholds.
- Alerting: email on bump success/failure, behind a `NotificationChannel` interface so other channels drop in later.
- Dashboard: live contract status + bump history, **scoped to contracts controlled by the connected wallet**.
- `evergreen-check` GitHub Action, published and usable in a repo that isn't ours.
- Docs, 3–5 minute demo video, published npm packages.

**P1 — desirable, cut first if needed:**
- Storage optimizer recommendations.
- A second `NotificationChannel` implementation (Telegram/webhook).
- Multi-contract batch scanning.

**P2 — future, don't architect against but don't build:**
- Mainnet support.
- Always-on engine mode.
- Multi-sig / DAO approval before a bump.
- Hundreds-of-contracts scale.
- A fully custom policy-signer contract.

### Success metrics
**At day 30:** all three deliverables marked "Evidence Present" by Kenny; at least one real testnet contract survives a full monitored TTL cycle with zero manual intervention; CLI and Action runnable by someone outside Apex following only the README.

**30–60 days after:** adoption by at least one Soroban project outside Apex; evidence accepted without a revision cycle; progression to an SCF Build Award application.

---

## 8. Architecture

```
                    Soroban RPC (testnet)
                            │
                            ▼
                   packages/core
        ┌──────────────────────────────────────┐
        │  rpc client · TTL math · rent model   │
        │  storage optimizer · decision rules   │
        └──────────────────────────────────────┘
             │              │              │
             ▼              ▼              ▼
     packages/cli    packages/engine   apps/dashboard
      `evergreen`     scheduled bump    wallet-scoped
                            │                 ▲
                            ▼                 │
                    bump history store ───────┘
                            │
                            ▼
                  NotificationChannel
                   (EmailChannel v1)
```

Everything shares `packages/shared-types`. **`core` never imports from `cli`, `engine`, or `dashboard`** — the dependency arrow points one way.

- **`shared-types`** — `ContractRef`, `LedgerEntryTTL`, `ScanResult`, `RentEstimate`, `BumpDecision`, `BumpRecord`, `NotificationChannel`, `EvergreenConfig`. These are the seams; changing them ripples across both developers' work, so changes get noted in `docs/STATUS.md`.
- **`core`** — RPC client (the only place that talks to the network), TTL math, rent model, storage optimizer, and **decision rules as a pure function** (`ScanResult` + thresholds → `BumpDecision`) so the engine is testable without a network.
- **`cli`** — thin. Parses args, calls core, formats output, maps errors to readable messages, sets exit codes. **Non-zero exit below threshold — the GitHub Action depends on this contract.** Commands: `scan`, `extend`, `optimize`.
- **`engine`** — a scheduled job, not a daemon. One run = load config → scan → decide → submit → record → notify. Dry-run by default.
- **`dashboard`** — read-only over bump history + live scans. Wallet connect determines scope. **No write path; the dashboard never bumps anything.**
- **`evergreen-check`** — wraps the CLI's `scan`; its entire contract with the system is the exit code and `--json` output. Keep both stable once published.

**Data flow:** config (`evergreen.config.json`, shared by CLI and engine so behavior can't drift) → scan → decide → act → observe.

**`BumpRecord` carries:** contract ID, entry key, ledger before/after, tx hash, timestamp, decision reason, outcome.

---

## 9. Decisions already made — do not relitigate

### ADR-001 — the engine is a scheduled serverless job, not an always-on service
Cron every 5–15 minutes. TTL headroom is measured in days, so sub-minute reaction time buys nothing. Zero infrastructure to maintain during a short sprint; each run is a discrete, greppable artifact that doubles as grant evidence; same mental model as the CI Action.

Consequences you must handle: worst-case reaction time equals the cron interval (document it so users set thresholds accordingly); **overlapping runs are possible, so idempotency and in-flight handling are required**; a missed scheduler run must alert, not fail silently.

### ADR-002 — policy signer via `stellar/passkey-kit`, OpenZeppelin as fallback
Use `passkey-kit` (smart-account-kit) with an **Ed25519 signer** — explicitly *not* the passkey/WebAuthn signer type, since our bot is headless — scoped by policy to `extendTTL` only.

**Fallback trigger:** if a headless, policy-scoped `extendTTL` isn't working end-to-end by the end of the Week 3 spike's second day, switch to OpenZeppelin smart accounts immediately and cut both P1 items to buy back the time. Do not spend day 3+ debugging the primary path.

**Security invariant regardless of provider:** the signer's capability set is exactly `{extendTTL}`. Verifying that a fund-moving call is *rejected* is part of the spike's definition of done. A signer that works but can also move funds is a **failed** spike, not a partial success.

### ADR-003 — pending, blocking Week 1
Toolchain specifics (Jest vs Vitest), dashboard hosting, scheduler platform, and **persistence for bump history** (flat JSON / SQLite / hosted KV). The persistence choice blocks Week 3 and is read by both the engine and the dashboard — settle it in Week 1, don't let it get decided ad hoc mid-sprint. Raise these in Phase 0.

### Other settled decisions
- Dashboard is **wallet-scoped**, not a public directory of all monitored contracts.
- Alerting is **email in v1**, behind a `NotificationChannel` interface. `WebhookChannel` / `TelegramChannel` ship as interface-conformant **stubs clearly marked SOW 2** — foundation, not half-features.
- Official sprint window is **Sep 3 → Oct 2**, superseding the SOW's suggested Aug 17 start.

---

## 10. The research behind ADR-002 (so you don't redo it)

The engine needs a signer that can call `extendTTL` and *nothing else* — incapable of moving funds, not merely trusted not to.

| Option | What | Testnet readiness | Effort | Cost @ $30/hr |
|---|---|---|---|---|
| **A — `stellar/passkey-kit`** | TS SDK for Soroban smart wallets; supports Ed25519 and policy signers alongside WebAuthn; pre-deployed testnet factory/wallet/policy contracts. Originated with kalepail, now under the official `stellar` GitHub org. | Good — testnet contracts already deployed | 15–25h | **$450–750** |
| **B — OpenZeppelin Stellar Contracts** | Audited Rust framework separating signers / scope rules / policies. Ships multisig and spending-limit policies; **no single-function-allowlist policy**, so we'd author a custom policy against their trait. | Good, but younger than their EVM work | 25–40h | $750–1,200 |
| **C — custom `__check_auth` contract** | Full control, no third-party contract dependency. | Greenfield | 40–60h | $1,200–1,800 |
| *(add-on)* **Launchtube** | SDF-run relayer: fee sponsorship + nonce handling, so the bot needn't hold a funded G-address. **Explicitly experimental, no stability guarantees.** | Available | 4–8h | optional |

**Why A:** Option C would spend a quarter to a third of the entire grant on one sub-component *and* produce an unaudited authorization contract — precisely the artifact attackers look for. Option B costs Rust work in the tightest week of the sprint. Option A removes account-contract design and deployment from Week 3 entirely and matches the TypeScript stack.

**Known risk with A:** its demos center on browser passkey flows, so the headless path is unverified by us. That's exactly what the timeboxed Week 3 spike exists to settle.

Relevant repos: `github.com/kalepail/passkey-kit` (moved to the `stellar` org), `github.com/OpenZeppelin/stellar-contracts`, `github.com/kalepail/launchtube`, `docs.openzeppelin.com/stellar-contracts/accounts/smart-account`.

---

## 11. Repository to create (Phase 1)

Repo name **`evergreen`**, public, MIT, owned by Apex. Push early so Rakha can clone on day one.

```
evergreen/
├── README.md
├── CLAUDE.md
├── BACKLOG.md
├── CONTRIBUTING.md
├── .nvmrc
├── .gitignore                  # must cover .env*, key material, build output
├── .env.example                # placeholders + a comment per variable
├── package.json                # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json          # strict
├── .eslintrc / eslint.config   # + Prettier
├── .github/
│   ├── workflows/ci.yml        # install → typecheck → lint → test on every PR
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── ISSUE_TEMPLATE/
│   └── CODEOWNERS
├── docs/
│   ├── PRD.md
│   ├── STATUS.md
│   ├── ARCHITECTURE.md
│   ├── CONVENTIONS.md
│   ├── SOROBAN-PRIMER.md
│   ├── SETUP.md
│   ├── EVIDENCE.md
│   ├── POLICY-SIGNER.md        # written in Week 3
│   └── adr/
│       ├── README.md
│       ├── ADR-001-scheduled-serverless-engine.md
│       ├── ADR-002-policy-signer-provider.md
│       └── ADR-003-*.md        # you write this in Week 1
├── packages/
│   ├── shared-types/
│   ├── core/
│   │   └── test/fixtures/      # recorded RPC responses
│   ├── cli/
│   └── engine/
├── apps/
│   └── dashboard/
└── scripts/
    └── deploy-guinea-pig.sh    # redeploys the test contract after a testnet reset
```

Every package gets its own `package.json`, a `README.md` stub, and a passing no-op test from the start, so CI is green on the skeleton before any feature work lands.

**Definition of done for Phase 1:** a fresh `git clone && pnpm install && pnpm test` passes on a machine that has never seen the project.

---

## 12. Docs that already exist

Fatih will drop these into the repo — **read them before executing any backlog task**, and keep them updated as you work. Do not regenerate them from scratch; they are the source of truth and they encode decisions already made.

| File | Contains |
|---|---|
| `docs/PRD.md` | Full product requirements, personas, P0/P1/P2, metrics, resolved open questions |
| `BACKLOG.md` | 30-day plan: 98 task IDs, daily breakdown, owners, milestone gates, cut order |
| `CLAUDE.md` | Your operating manual in-repo: session ritual, hard rules, repo map |
| `docs/STATUS.md` | The living board — read first every session, write last |
| `docs/ARCHITECTURE.md` | Modules, data flow, boundaries |
| `docs/CONVENTIONS.md` | Git, TypeScript, naming, testing, secrets, transactions |
| `docs/SOROBAN-PRIMER.md` | Domain knowledge + gotchas + a fixture slot to fill |
| `docs/SETUP.md` | Environment, accounts, service config, guinea-pig contract ID |
| `docs/EVIDENCE.md` | Grant evidence tracker |
| `docs/adr/` | ADR-001, ADR-002, and the template |

If any of these contradict this prompt, **the repo files win** — they're versioned and this prompt is a snapshot.

---

## 13. Week 1 execution plan (Sep 3 – Sep 9)

Week 1's milestone: **by Sep 9 nobody can say "I can't start because X isn't set up."** Days 1–2 were spent on planning and are already done, so five working days remain.

**Day 3 — repo & toolchain (Fatih)**
Create the GitHub repo; push the docs as the first commit (docs land before code). Monorepo skeleton: pnpm workspaces, strict `tsconfig.base.json`, ESLint + Prettier, test runner (decide Jest vs Vitest → ADR-003), Node pinned via `.nvmrc`. Empty-but-importable packages with passing no-op tests. CI workflow green on the skeleton. Branch protection on `main`, PR/issue templates, `CODEOWNERS`, `.gitignore` covering `.env*` and key material.

**Day 4 — Stellar dev environment (Rakha)**
Install and **pin exact versions** of the Stellar CLI and Soroban tooling; record them in `docs/SETUP.md`. Generate testnet keypairs (one per developer plus one for the bot), fund via friendbot — **testnet only, never a key controlling real funds**. Configure RPC endpoint and network passphrase as env vars; write `.env.example` with no real values. Deploy the **guinea-pig contract** — a throwaway contract with deliberately short TTL that serves as our test subject for the whole sprint — and record its ID in `docs/SETUP.md`. Call `getLedgerEntries` against it, eyeball a real `liveUntilLedgerSeq`, and paste the **unedited** response into `docs/SOROBAN-PRIMER.md` and `packages/core/test/fixtures`.

**Day 5 — services & accounts**
Reserve the npm scope/package names **now**, not in Week 4. Dashboard hosting account with a hello-world deploy live. Scheduler platform decided with a trivial cron job proven end-to-end *before* we trust it with bumps. Email provider account with a test email actually sent from code. Document the secrets rule. Create the shared evidence folder.

**Day 6 — contracts-first design**
Define the `shared-types`. Write the architecture data-flow section against them. Build the test harness: fixtures directory, recorded RPC response, mock RPC client so unit tests never hit the network. **Decide persistence for bump history (ADR-003)** — the engine and dashboard both read it, so it cannot be decided ad hoc in Week 3.

**Day 7 — first vertical slice + review**
`evergreen scan <contract-id>`: the thinnest possible CLI → core → real testnet RPC → prints remaining TTL. No cost model, no pretty output. Unit test the TTL calculation against the fixture. Week 1 review, update `docs/STATUS.md`, capture evidence snapshot #1.

**Milestone gate:** if `scan` doesn't return real testnet data by Sep 9, Week 2 starts with that task and the first P1 item is cut immediately.

---

## 14. The remaining 30-day arc

Full detail lives in `BACKLOG.md` with stable task IDs (`W2-D8-01`). Summary:

- **W2 (Sep 10–16) — CLI, Deliverable 1.** TTL math + archive projection; rent model **validated against a real transaction fee**; CLI UX with exit codes; first manual `extendTTL` on testnet (**capture the tx hash**); dry-run mode; storage optimizer; config file; coverage pass. Gate: CLI feature-complete — no CLI features built after Sep 16.
- **W3 (Sep 17–23) — Engine, Deliverable 2.** Highest-risk week. Days 15–16 are a **timeboxed spike** with a hard go/no-go on the policy signer. Then engine core with pure decision rules, bump execution with retry and idempotency, `NotificationChannel` + `EmailChannel` (+ marked stubs), deployment to the scheduler, and the single most important proof in the grant: **letting the engine save the guinea-pig contract unattended**, with tx hashes, logs and alert screenshots captured. Then hardening for failure modes and the policy-signer setup guide.
- **W4 (Sep 24–30) — Deliverable 3.** Dashboard with wallet connect and scoping (verify with a second wallet that it sees nothing), status and history views, rent view, deployed to a live public URL, mobile-reasonable because the reviewer may use a phone. `evergreen-check` Action tested **in a separate throwaway repo** — proving it works for someone who isn't us — and published. Docs pass including a troubleshooting page built from real failures we hit. npm publish with a clean-machine verification. Demo video (3–5 min): problem → scan → auto-bump saving a contract → dashboard → CI check.
- **Buffer (Oct 1–2) — evidence & submission.** Assemble the bundle per SOW §6.1. Write a one-page walkthrough letting a non-technical reviewer verify all three deliverables in under 10 minutes. Fresh-machine test following only the README. Submit. Retro. Draft the SOW 2 candidate list.

### Cut order when time runs short — follow it, don't improvise
1. Batch scan (P1)
2. Storage optimizer depth — ship basic flags
3. Dashboard rent cost view
4. Troubleshooting depth

**Never cut:** evidence capture, the demo video, the unattended-bump proof, or the fresh-machine test. Those are what the grant is judged on.

---

## 15. Hard rules — not suggestions

1. **Testnet only.** Never target mainnet, never use a key controlling real funds. If a task seems to require mainnet, stop and ask.
2. **No secrets in the repo.** Not in code, docs, tests, commit messages, or issues. `.env` is gitignored; real values live only in local `.env`, GitHub Actions secrets, and the hosting env store. Testnet keys are still treated as secrets — the habit is what protects the mainnet keys later. If you find a committed secret: rotate, then clean history, then note it in STATUS.
3. **Never invent Soroban APIs.** Check `docs/SOROBAN-PRIMER.md`, then the official docs. Say "I need to verify this" rather than guessing. A plausible-looking hallucinated RPC method costs hours.
4. **The policy signer must never be able to move funds.** Widening its scope is a security regression requiring explicit human sign-off.
5. **Dry-run is the default.** Live submission requires an explicit flag or config field. No exceptions.
6. **Evidence is a deliverable.** Every tx hash, screenshot and log goes into `docs/EVIDENCE.md` the day it's produced. Losing a tx hash is worse than losing the code that produced it.
7. **Don't silently expand scope.** New work goes into the backlog with a note in STATUS, not quietly into a branch.
8. **Tests don't hit the network.** Unit tests use fixtures and the mock RPC client. Integration tests are `*.integration.test.ts`, excluded from default `pnpm test`, never in CI by default.
9. **Ask before destructive git operations.** No force-pushing shared branches, no history rewrites, no `git clean` on a dirty tree without confirming.
10. **Update the context files as you go.** `docs/STATUS.md` at the end of every session. A future agent session reading stale status is how a 30-day sprint quietly derails.

---

## 16. Conventions

**Branches:** `<type>/<task-id>-<slug>` — `feat/W2-D8-01-ttl-math`

**Commits:** Conventional Commits with the task ID in the subject:
```
feat(cli): add scan command [W1-D7-01]
fix(engine): prevent double-bump across overlapping runs [W3-D18-02]
```
Types: `feat` `fix` `docs` `test` `refactor` `chore` `ci`. Scopes: `cli` `core` `engine` `dashboard` `types` `action` `repo` `docs`.

**PRs:** one task per PR; body states what changed, how it was verified, and evidence captured. CI green before merge. `main` protected.

**TypeScript:** strict everywhere; no `any` without a justifying comment; explicit return types on exports; typed errors (`EvergreenError` subclasses) with actionable messages — never let a raw stack trace reach a user; no default exports; `async/await`, no floating promises.

**Naming:** ledger values carry their unit — `remainingLedgers`, `liveUntilLedgerSeq`, `projectedArchiveDate`. Fees too — `estimatedRentStroops`, never bare `cost`. Booleans read as assertions — `isArchived`, `shouldBump`.

**Testing:** regression test before each bug fix; ~80% meaningful coverage on core math/cost/decision logic, not vanity coverage on glue; test names describe behavior.

**Transactions:** log every submission greppably — `submitted tx=<hash> contract=<id> op=extendTTL` — then copy the hash into `docs/EVIDENCE.md` the same day.

**Dependencies:** prefer stdlib and the official Stellar SDK. **Pin exact versions for Stellar tooling** — Soroban's surface moves and a silent minor bump can break TTL semantics. No new dependency in Week 4 unless it fixes a release blocker.

---

## 17. Definition of done (every task)

- Works against the guinea-pig testnet contract.
- Unit tests cover the logic using fixtures, not live RPC.
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Docs updated if user-facing behavior changed.
- `BACKLOG.md` checkbox flipped, `docs/STATUS.md` updated, evidence recorded if applicable.

---

## 18. When you're blocked

Mark the task `[!]` in BACKLOG, write the blocker in `docs/STATUS.md` with what you tried and what would unblock it, and tell Fatih directly. A blocked task nobody knows about is the most expensive thing in a 30-day sprint. Don't spend more than an hour stuck before surfacing it.

---

## 19. Your first response to this prompt

Do **not** start scaffolding. Respond with:

1. A short confirmation that you've absorbed the context, naming the three deliverables and the deadline back to me.
2. **Anything in this document you think is wrong, risky, or internally inconsistent** — I would rather hear it now than on day 20.
3. Your first batch of 3–5 Phase 0 questions.

Then we grill, and only after I confirm your restated understanding do you touch the filesystem.
