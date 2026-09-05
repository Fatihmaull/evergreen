# Onboarding — read this before the manual

You are an agent about to work on Evergreen. This is the orientation: what we're building, what will trip you, and how work gets done here. The rules themselves are in [`AGENTS.md`](../AGENTS.md), which is canonical — this document exists so that manual makes sense when you get to it.

**Whatever tool you are** — Claude Code, Cursor, Codex, Copilot, Gemini — the rules are the same. Where something needs a capability you may not have, it says what to do without it.

Budget about ten minutes. There's a self-test at the end.

**What these two documents give you is orientation, not everything you need to work.** They deliberately route detail to `CONVENTIONS.md`, `SOROBAN-PRIMER.md`, `SETUP.md`, `STATUS.md` and `BACKLOG.md` rather than restating it, because a copy drifts from its original within a week. So: passing the self-test means you will not do anything *dangerous* — you still open those files for the specifics of the task in front of you. Question 8 exists to make that concrete.

---

## What Evergreen is

Soroban contract data lives in ledger entries, each with a **TTL measured in ledgers**. Every closed ledger decrements it. At zero the entry is **archived** — the contract stops working until someone pays to restore it. Stellar has no dedicated tooling for this, so developers track it by hand and production contracts die because somebody forgot.

Evergreen is three things that stop that: a **CLI** that reports TTL health and rent cost, a **scheduled engine** that extends TTL before expiry, and a **public dashboard + CI check** so a non-technical reviewer can see it working.

Evergreen is built by **Apex** — Fatih Maulana and Rakha, two developers in the Stellar Ambassador Chapter Indonesia. "Apex" is the team name and it appears in ADRs and `CODEOWNERS`; it is not a third party.

**The north star is developer experience for Stellar's rent system** — making TTL something you configure once instead of remember. This is funded by a 30-day Stellar Instawards grant (deadline **2026-10-02**, hard), but the grant funds the work; it is not what the work is *for*. When the two conflict: DX wins technical decisions, grant-legibility wins presentation decisions.

### Why it's non-custodial — understand this before writing any engine code

**`extendTTL` is permissionless.** Anyone may extend any ledger entry's TTL provided they pay the resource fee. No owner check, no signature from the deployer. We verified this on testnet on 2026-09-05, not just in the docs — hashes are in [`SOROBAN-PRIMER.md`](SOROBAN-PRIMER.md).

So Evergreen never asks for authority over your contract, because none exists to grant. There is no key to hand over and no permission to revoke. The engine holds nothing but the lumens it uses to pay fees.

Two consequences that constrain code you might write:

- **A wallet signature here authorises a *payment*, never *access*.** Any type name, doc string, or UI label implying otherwise is a bug.
- **The user always pays their own extend fees.** Evergreen supplies automation, not money ([ADR-004](adr/ADR-004-payment-model.md)).

## Where things stand

**Read [`docs/STATUS.md`](STATUS.md).** It is the living board and it is rewritten most sessions; anything restated here would be wrong by tomorrow. Read it first, every session, before `BACKLOG.md`.

---

## The five things that will bite you

Ranked by how expensive the mistake is.

### 1. The ledger key is the unit of work — not the contract

Contracts deployed from identical Wasm **share a single `ContractCode` ledger entry**. That's the factory pattern — per-user vaults, per-pair pools, per-market instances — so it is common, not exotic.

The instinctive data model is contract-centric: a contract, with its entries hanging off it. **That shape structurally cannot represent one entry serving twelve contracts without duplicating it.** Get it wrong and you inherit three bugs at once: rent double-counted across a factory deployment, severity that under-reports blast radius, and an engine that bumps the same entry N times in one run.

The failure it produces in the product is the worst possible one for a monitoring tool: **N contracts reported healthy right up until they all die together.**

So: primary collection keyed by ledger key, with the contracts an entry serves as a property *of the entry*. Contracts are the input to a scan and a back-reference on the output. The acceptance check, and answer it literally — *can this shape represent one ledger entry serving N contracts, exactly once?*

### 2. Ledgers are not seconds, and `liveUntilLedgerSeq` is optional

Compute in **ledgers**. Convert to wall-clock only at the display edge. **Never store a TTL as a date** — testnet closes ledgers at ~5.000s, but that is measured, not guaranteed.

`getLedgerEntries` returns `liveUntilLedgerSeq` as **optional** — absent for entry types with no TTL. Handle its absence explicitly; never `!`-assert it. It also returns `latestLedger` in the same response, so `remainingLedgers` costs one round trip, not two.

Naming carries the unit: `remainingLedgers`, `liveUntilLedgerSeq`, `estimatedRentStroops`. Never a bare `cost` or `ttl`.

**Temporary entries are a trap of their own.** Measured floors: persistent/instance/code get ~120,927 ledgers (~7 days); **temporary gets 688 (~57 minutes)** — two orders of magnitude — and temporary entries are **deleted, not archived**, so they cannot be restored. Reporting "gone" for restorable data, or "recoverable" for deleted data, is a serious UX bug.

### 3. Testnet only — and the guard is deliberate friction

Never target mainnet. Not a flag, not a branch, not a "just in case" code path. Mainnet is explicitly out of scope for this grant.

`scripts/deploy-guinea-pig.sh` verifies the live network by hashing the passphrase rather than trusting a local alias named "testnet". **That friction is on purpose.** When mainnet becomes in-scope for a follow-on, changing it must be a conscious reviewed act with its own ADR — never a convenience edit to make a script run.

Testnet keys are still treated as secrets. Not because they're valuable, but because the habit is what protects the mainnet keys later.

### 4. Guinea-pigs B and C must not enter the engine config early

Two contracts are deliberately ageing toward a threshold crossing so the engine can be caught saving them unattended. That is the single most important proof in the grant.

| | Contract | Crossing |
|---|---|---|
| **B** | `CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ` | **2026-09-20 ~12:00 UTC** |
| **C** | `CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL` | **2026-09-25 ~12:00 UTC** |

**If the engine sees them before their crossing, it will dutifully bump them and destroy weeks of ageing.** There is no way to recover that inside the sprint, and it fails silently — nothing errors, the evidence simply never exists.

They can be added to the config *when the engine is genuinely ready*, but only as a verified step: add → run **dry-run** → confirm the engine reports **no action needed** → then live. A threshold accidentally too high bumps them immediately.

Guinea-pig **A** — `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L` — is the working subject. Bump it, break it, redeploy it freely; it is what you verify against. Full details, plus the redeploy script for after a testnet reset, in [`SETUP.md`](SETUP.md).

### 5. "Done" never means "code written"

`[x]` / `Done` means the **full** definition of done: works against the testnet contract, unit tests cover the logic using fixtures, `pnpm check` green, docs updated, evidence recorded. Anything less is `[~]` / `In progress`.

This matters because two humans read the Notion board and trust "Done" without checking. An overstated Done is worse than a missing one.

**A related habit worth adopting: a check that has only ever been observed permitting things has not been tested.** This has bitten us three times — a testnet guard that refused *everything* and looked fine because nothing failed loudly; a local `pnpm check` weaker than CI, manufacturing trust in a meaningless green. Exercise mechanisms in **both** directions: confirm they permit what they should *and* refuse what they should.

---

## How work gets done

### Session start

1. **Read [`docs/STATUS.md`](STATUS.md)**, then [`BACKLOG.md`](../BACKLOG.md), then open PRs and Issues.
2. Find your task ID (e.g. `W2-D8-01`).
3. Read [`PRD.md`](PRD.md) if the task touches product behaviour; [`ARCHITECTURE.md`](ARCHITECTURE.md) if it touches module boundaries; [`SOROBAN-PRIMER.md`](SOROBAN-PRIMER.md) before *any* TTL, rent, or ledger-entry code.
4. **If you have Notion access:** validate the mirror against the repo before writing code. See [`AGENTS.md`](../AGENTS.md) § Dual-channel sync. **If you don't:** skip to 5 and read *Working without Notion* below.
5. Mark the task `[~]` and add a line to `STATUS.md` **before** writing code.

### Writing code

Full rules in [`CONVENTIONS.md`](CONVENTIONS.md). The ones that are non-obvious or costly to get wrong:

- **Task ID in the branch and the commit subject** — `feat/W2-D8-01-ttl-math`, `feat(core): add TTL math [W2-D8-01]`. This is the only trace linking work to plan; a PR without one is how a task ships unregistered.
- **No `any`** without a comment justifying it. Explicit return types on exports. No default exports.
- **Ledger and fee values carry their unit in the name.**
- **Tests never hit the network.** Use fixtures in `packages/core/test/fixtures` and the mock RPC client. Integration tests are `*.integration.test.ts`, excluded from `pnpm test`, never in CI by default.
- **Anything that can submit a transaction defaults to dry-run.** Live submission needs an explicit flag.
- **Never invent a Soroban API.** Check `SOROBAN-PRIMER.md`, then the official Stellar docs. Say "I need to verify this" rather than guessing — a plausible-looking hallucinated RPC method costs hours.

Before you call anything done: **`pnpm check`** — which runs `typecheck && lint && format:check && test`, exactly matching CI. Run the whole thing, not a subset: a local gate weaker than the remote one is worse than no local gate, because it manufactures trust in a green that means nothing.

### What "verified against testnet" means for your task

The definition of done says *works against the guinea-pig testnet contract*. That is unambiguous for the engine and the CLI, and **not** for a pure function. Read it as: *the strongest verification your task admits.*

| Your task is… | Verification that satisfies the DoD |
|---|---|
| Pure logic — TTL math, decision rules, rent model | Unit tests against **recorded fixtures** taken from real testnet responses, plus at least one hand-checked value from guinea-pig A quoted in the PR body so a reviewer can recompute it. No live call required. |
| Anything touching RPC | A real call against guinea-pig A, with the observed values in the PR body. Use an `*.integration.test.ts` if it should be repeatable; it is excluded from `pnpm test` and from CI by design. |
| Anything submitting a transaction | The three evidence artifacts below, in `docs/EVIDENCE.md`, the day it happens. |

**"Evidence recorded if applicable" means: applicable when your work produced a testnet transaction.** A read-only or pure-logic task produces none, needs no `EVIDENCE.md` row, and should say so explicitly in the PR body rather than leaving it blank — an omission and a deliberate "none" look identical otherwise.

### Opening a PR

One task per PR. `main` is protected — no direct pushes, and CI must be green.

**The PR title is the commit subject**, task ID included: `feat(core): add TTL math [W2-D8-01]`. Squash-merge, so that subject becomes the commit on `main` — which is the only thing linking the merged work back to the plan.

The body states three things: **what changed**, **how it was verified** (not "tests pass" — what did you actually observe, against which contract, with what output), and **what evidence was captured**.

If the work produced a testnet transaction, `docs/EVIDENCE.md` needs **three artifacts**: the tx hash, the full unedited JSON RPC response, and an explorer screenshot. A hash alone is not evidence — testnet gets reset periodically, and a reset before review makes every explorer link dead. The JSON and screenshot survive it. One minute at capture time; unrecoverable if skipped.

### When to open a GitHub Issue

**Only two cases:** you are blocked, or you discovered work that isn't in the backlog.

Not one per task. There are ~115 tasks, and 115 issues in a repo a grant reviewer reads is noise — plus it creates a third surface to keep in sync. Ordinary tasks are already traceable through the task ID in the branch, commit, and PR title.

A good issue body states: what is blocked, what you tried, and what would unblock it. Put the issue link in the Notion row's `Notes` if you have access.

**How to ask a question.** Issues are reserved for the two cases above, so a design question is neither. Put it in the **PR body** as an explicit open question, and propose a default so answering is cheap — *"I did X; if you'd rather Y, say so."* Then keep building under the stated assumption rather than blocking. If the answer would change the work materially and you cannot proceed safely without it, mark the task `[!]`, open an Issue, and say what you tried.

**Discovered work is never absorbed silently.** Open the issue, add it to `BACKLOG.md` with a new frozen ID, create the Notion row if you can. This rule has caught two of our own violations already.

### Session end

1. Flip the `BACKLOG.md` checkbox, update `STATUS.md`, record any evidence in `EVIDENCE.md` — **the day it happens**, not later.
2. If you have Notion access, sync status and outcomes. If not, see below.

### Working without Notion

**Do the work anyway.** Record everything in the repo exactly as normal, then add one line to `docs/STATUS.md` naming the task IDs whose Notion sync is pending, so the next session catches up.

The repo is canonical precisely so the mirror can be absent without stopping anything. **Never block on it, and never silently skip it** — an un-noted skip is how the board goes stale while looking current. The same applies to any tool you lack: do the repo-side work, record what you couldn't do, and say so.

---

## Tasks, scope, and dates

**Task IDs are frozen identifiers, not date claims.** `W2-D8-01` means "the eighth task-day in sequence" — *not* Sep 10. Each day-block carries a separate planned date that may slip; the ID never moves, because it is referenced in branch names, commit subjects, evidence rows, and the Notion mirror. **Never renumber.**

The plan is [`BACKLOG.md`](../BACKLOG.md): 30 day-blocks, a slack ledger, and a **cut order**. When time runs short we cut from that list in order — we do not improvise. Four items on it are *corrections* rather than scope and are not cut candidates, because cutting them means shipping code that computes wrong answers.

### Dates that are not ours to move

| Date | What |
|---|---|
| **Fri 2026-09-18** | 🔴 Hard gate — engine running unattended against guinea-pig B |
| **Sun 2026-09-20** | B's threshold crossing |
| **Fri 2026-09-25** | C's threshold crossing |
| **Fri 2026-10-02** | Grant deadline |

The Sep 18 gate is Friday deliberately: Sep 19 is a Saturday and Sep 20 a Sunday, and the plan assumes weekends are not working days. Friday is the gate; Saturday is margin.

### Explicitly out of scope

Mainnet auto-bump · hosted billing or rent-as-a-service · **subsidising anyone's extend fees** · multi-sig custody · non-Soroban chains · audit tooling · a hosted multi-tenant service · any automated dashboard write path.

Some of these must stay *possible* without being *built* — the data model must not foreclose a hosted engine, for instance. If a shortcut would close that door, flag it rather than take it.

## Decisions already made

Four ADRs in [`docs/adr/`](adr/), plus the Decisions page in Notion where the humans go for "why".

**These are settled.** Reopening one needs an ADR amendment with a reason — not a fresh argument in a PR. Amend, never rewrite: the reasoning we had at the time is the valuable part.

Currently: the engine is a scheduled job not a daemon; the policy signer is `passkey-kit` with an amendment moving it off the critical path; toolchain decided with hosting still open; and the user always pays their own fees.

---

## Self-test

If you can answer these, start work. If not, the answer is in a linked document above.

1. **Why is Evergreen non-custodial?** *(If your answer mentions a scoped signer, re-read "Why it's non-custodial".)*
2. **What is the unit of work in a scan, and why not the contract?**
3. **What happens if you add guinea-pig C to the engine config today?**
4. **Where does task state get authored, and what do you do if you can't reach Notion?**
5. **When do you open a GitHub Issue — and when do you not?**
6. **A task's code is written and the tests pass. Is it `[x]`?**
7. **You need an RPC method you're not certain exists. What do you do?**
8. **Is an entry still live at `liveUntilLedgerSeq`, or is that the first dead ledger?** *(You cannot answer this from these two documents — that is the point. Knowing which questions send you to `SOROBAN-PRIMER.md` is part of being ready. This one is currently open: see the primer.)*

---

**Now read [`AGENTS.md`](../AGENTS.md).** It is short, it is canonical, and it is the thing you are actually held to.
