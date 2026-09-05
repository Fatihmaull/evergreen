# CLAUDE.md — agent operating manual for Evergreen

Read this file first, every session. It tells you what this project is, how to pick up work, and what you must never do.

## What Evergreen is

An open-source toolkit that stops Soroban smart contracts from being archived. Soroban ledger entries have a TTL measured in ledgers; if it hits zero the entry is archived and the contract is unusable until someone pays to restore it. Evergreen monitors TTL, predicts archival, estimates rent cost, and automatically extends TTL before expiry — non-custodially.

Three components: a CLI, a scheduled auto-bump engine, and a public read-only dashboard + CI check.

This is a funded 30-day grant engagement (Stellar Instawards, $4,800). **Deadline 2026-10-02 is hard.** Scope discipline matters more than elegance.

## Start-of-session ritual (do this in order)

> **Phase 0 alignment happened once, at project start, and closed on 2026-09-04.** Do not re-run it. Every session from here follows the STATUS-first ritual below. (The bootstrap prompt that ran it is archived at `docs/archive/BOOTSTRAP-PROMPT.md` as provenance only — it predates the permissionless finding and is **not** a source of truth. Where it disagrees with a live document, the live document wins.)

1. Read `docs/STATUS.md` — what's done, in progress, and blocked *right now*.
2. Read the current day's section in `BACKLOG.md` — find your task ID (e.g. `W2-D8-01`).
3. Read `docs/PRD.md` if the task touches product behavior; `docs/ARCHITECTURE.md` if it touches module boundaries.
4. Mark your task `[~]` in BACKLOG.md and add a line to STATUS.md before writing code.
5. Do the work.
6. End of session: mark `[x]`, update STATUS.md, and if you produced a testnet transaction, record the hash in `docs/EVIDENCE.md` **immediately** — not later.

If STATUS.md and BACKLOG.md disagree, STATUS.md is the more recent truth. Fix the disagreement before starting work.

## Dual-channel sync — repo canonical, Notion mirrored

Evergreen is tracked in two places. **The repo is canonical. Notion is a mirror.** Truth flows repo → Notion, never the reverse. Only agents write to Notion; Fatih and Rakha read it.

**Notion objects:**
- Project Brain (hub): `3d2e2030-b2ce-815d-ad98-cc01cf6109df`
- Evergreen Tasks database: `9aa56f2512b648fca04a8a0e21c727fa`
- Tasks data source (writes): `collection://3e078dc6-0805-4b11-b970-6d544fa4a98c`
- Knowledge Base: `3d2e2030-b2ce-811c-bdeb-c6ca652a0d6c`
- Decisions: `3d2e2030-b2ce-813e-8976-c11ea5dc6c29`

Match task rows by the `ID` property (`userDefined:ID`), never by title.

### A. Session start — read, then validate, then work

1. Read the repo first, always: `docs/STATUS.md`, then `BACKLOG.md`, then open PRs, open Issues, and any comments or mentions addressed to you.
2. **Then validate Notion against it.** Compare the task rows you are about to touch against their repo state.
   **Diff on presence, not only on status.** Report rows present in one channel and absent in the other, as well as rows whose status disagrees. A divergent ID looks exactly like that — a phantom on one side, a missing row on the other — and a status-only diff will read green while the row it should have caught has silently fallen out of scope.
3. Resolve any discrepancy **before writing code**:
   - **Notion asserts something the repo does not support** → escalate. This covers a wrong status, a phantom row, and a divergent ID alike; do not narrow it to "claimed a completion." Correct Notion to match the repo, and log it in `docs/STATUS.md` as a sync anomaly with the date and task ID. If this happens twice, say the workflow itself is suspect.
   - **Repo ahead of Notion** → a missed write. Correct Notion. No escalation needed.

   > **Repo-canonical means the repo is where truth is *authored*, not that it is always right. When the mirror reveals a repo error, the fix is repo-first-then-sync — not mirror-ward.**
   >
   > This exception is load-bearing. A recurring task left `[ ]` in the repo while Notion correctly says `In progress` is a *repo* error: mechanically "correcting" Notion would degrade the mirror while feeling like enforcement. Rules that are wrong in a narrow case are more dangerous than rules that are obviously wrong, because they get followed. Ask which channel is *right* before asking which is canonical.
4. Only after the two agree, mark your task `[~]` / `In progress` in both, and start.

Never skip step 2 because the task looks obvious. The validation exists to catch the case where a previous session recorded work it did not do.

### B. During work

- Commit and PR as normal, with the task ID in the branch and commit subject.
- **Do not sync Notion on every commit.** The mirror updates at boundaries only.
- If you hit a blocker: mark `[!]` / `Blocked` in both, and **open a GitHub Issue** — title carries the task ID, body states what is blocked, what was tried, and what would unblock it. Put the issue link in the Notion row's `Notes`.
- If you discover work that is not in the backlog: **open a GitHub Issue**, add it to `BACKLOG.md` with a new frozen ID, and create the matching Notion row. Never absorb undocumented work silently — that is hard rule 8.

### C. On PR merge

Update the Notion row(s) for every task ID in that PR: `Status`, plus a one-line outcome in `Notes`. If the PR closed an Issue, note that too.

### D. Session end — write both channels

1. Repo: flip the `BACKLOG.md` checkbox, update `docs/STATUS.md`, record any evidence in `docs/EVIDENCE.md`.
2. Notion: set `Status` on every task touched, and write the outcome into `Notes` — what happened, not just that something happened. Link the PR or Issue.

   > **When creating a Notion row, take the ID from `BACKLOG.md`. Never infer it from a naming pattern.** Guessing `W1-D4-04d` because `04b` and `04c` exist is how the join key diverges — and a divergent ID does not fail, it silently stops matching. The row falls out of every future diff while the diff still reads green. The repo registers the ID first; Notion copies it.
3. If a new finding, decision, or ADR landed, add it to the **Knowledge Base** or **Decisions** page. These are where the humans go for "why", so a decision that exists only in a commit message is effectively invisible.
4. At a **week gate**, also refresh the Project Brain page: per-week counts, today's tasks and owners, days to deadline, health.

### E. Status vocabulary — identical meaning in both channels

| `BACKLOG.md` | Notion `Status` | Means |
| --- | --- | --- |
| `[ ]` | Pending | Not started |
| `[~]` | In progress | Started, not finished |
| `[x]` | Done | Full definition of done: works against testnet, unit tests with fixtures, `pnpm check` green, docs updated, evidence recorded |
| `[!]` | Blocked | Cannot proceed. Requires an open Issue |
| `[-]` | Dropped | Cut. Reason required in `Notes` and `STATUS.md` |

**"Done" never means "code written."** If the definition of done is not fully met, it is `In progress`. Fatih and Rakha trust Notion's "Done" without checking, so it must never overstate.

### F. When Notion is unreachable

Do the work anyway. Record everything in the repo, and note the pending sync in `docs/STATUS.md` so the next session catches up. The repo is canonical precisely so the mirror can fail without stopping anything. Never block work on the mirror.

### G. Cost guard

If keeping the mirror current starts costing meaningful time in a 24-effective-day sprint, that is a design failure, not a cost to absorb. Say so rather than quietly working around it.


## Hard rules — these are not suggestions

1. **Testnet only.** Never target mainnet, never use a key that controls real funds. Mainnet is explicitly out of scope for this grant (PRD §3). If a task seems to require mainnet, stop and ask.
2. **No secrets in the repo.** Not in code, not in docs, not in tests, not in commit messages, not in this file. Keys and API tokens live in `.env` (gitignored) and platform secret stores only. If you find a committed secret, stop everything and say so.
3. **Never invent Soroban APIs.** If you are unsure whether a method, XDR type, or SDK signature exists, check `docs/SOROBAN-PRIMER.md` first, then the official Stellar docs. A plausible-looking hallucinated RPC method will cost hours. Say "I need to verify this" rather than guessing.

   The primer's most load-bearing fact: **`extendTTL` is permissionless.** Evergreen never needs authority over a user's contract, so a wallet signature here authorizes a *payment*, never *access*. Any code, type, doc string, or UI label implying otherwise is a bug.
4. **The bot must never have authority over a user's contract or a user's funds.** Its own operational balance exists solely to pay `extendTTL` fees, is funded to a capped amount, and is treated as a hot, expendable key. Any change that gives the bot capability beyond paying fees and submitting `extendTTL` is a security regression requiring explicit human sign-off.

   *(The absolutist "cannot move any XLM at all" version was considered and rejected: an account that must pay its own fees can always move its own lumens, and a rule that cannot be followed is worse than no rule.)*

5. **Evergreen never pays another party's extend fees.** The user always pays their own — self-hosted engine, dashboard signature, or the future hosted model alike (ADR-004). Subsidy is unbounded cost and it is the SOW's hosted-billing non-goal wearing a DX costume. If a DX improvement seems to require it, stop and flag it.
6. **Dry-run is the default.** Anything that submits a transaction defaults to simulation; submitting requires an explicit flag or config. Never make live submission the default path.
7. **Evidence is a deliverable, and a hash alone is not evidence.** Every testnet transaction goes into `docs/EVIDENCE.md` the day it happens with **three** artifacts: the tx hash, the full unedited JSON RPC response, and an explorer screenshot. Testnet is periodically reset — a reset before review makes every explorer link dead, and a hash pointing at a chain that no longer exists proves nothing. The JSON and the screenshot survive it. One minute per transaction at capture time; unrecoverable if skipped.
8. **Don't silently expand scope.** If a task needs something not in the backlog, add it to the backlog and note it in STATUS.md rather than quietly building it. See the cut order at the bottom of BACKLOG.md.
9. **Tests don't hit the network.** Unit tests use fixtures and the mock RPC client in `packages/core/test/fixtures`. Integration tests that touch testnet are separate, explicitly marked, and never run in CI by default.

## Repo map

```
BACKLOG.md              30-day plan, task IDs, milestone gates, cut order
CLAUDE.md               this file
docs/
  PRD.md                what we're building and why; scope boundaries
  STATUS.md             living board — current state of every workstream
  ARCHITECTURE.md       modules, data flow, shared types
  CONVENTIONS.md        code style, commits, branches, PRs, testing rules
  SOROBAN-PRIMER.md     domain knowledge: TTL, rent, archival, RPC shapes
  SETUP.md              environment, accounts, service config, contract IDs
  EVIDENCE.md           grant evidence tracker (tx hashes, screenshots, links)
  POLICY-SIGNER.md      (W3) the hardened signer path for self-hosters
  adr/                  architecture decision records (001–004)
  archive/              historical snapshots; provenance only, never authoritative
packages/
  shared-types/         the types every module speaks
  core/                 TTL math, rent model, RPC client, optimizer
  cli/                  the `evergreen` command
  engine/               scheduled auto-bump worker
apps/
  dashboard/            public read-only web dashboard (+ P1 user-signed extend)
```

## Where decisions live

Already decided — do not relitigate without a reason and an ADR amendment:

- **ADR-001:** the auto-bump engine is a *scheduled serverless job* (5–15 min cadence), not an always-on service.
- **ADR-002:** policy-signer path is `stellar/passkey-kit` (Ed25519 signer + policy scoping), with OpenZeppelin smart accounts as the fallback if the Week 3 spike fails. Building a custom signer contract is out of scope for this grant.
- **ADR-002 amendment (2026-09-04):** `extendTTL` is permissionless, so the policy signer is *not* what makes Evergreen non-custodial. Week 3 splits into Stage 1 (plain funded account, critical path) and Stage 2 (policy signer, off the critical path, still SOW-committed).
- **ADR-003:** toolchain decided (Node 24, pnpm, Vitest); hosting, scheduler, and persistence pending W1-D5-03. Frame persistence as *atomicity*, not storage — the no-double-bump guarantee needs a real lock.
- **ADR-004:** the user always pays their own extend fees. Apex never subsidises rent. `BumpRecord` carries payer distinct from contract; config is N contracts × M payers; `Signer` is an interface resolved per payer — v1 implements no multi-tenancy but must not foreclose it.

New non-trivial decision? Write an ADR (`docs/adr/README.md` has the template) and link it from STATUS.md.

## Working style expected here

- Small, reviewable commits tied to task IDs. See `docs/CONVENTIONS.md`.
- Prefer boring, obvious code. This repo will be read by an Ambassador reviewer and by future contributors, not just by us.
- When something is ambiguous in the PRD, ask rather than assume — but propose a default so the question is cheap to answer.
- If you're blocked, mark the task `[!]` and write the blocker in STATUS.md with what you tried. A blocked task nobody knows about is the most expensive thing in a 30-day sprint.
- Don't refactor across module boundaries mid-week. `packages/shared-types` is the contract; changing it ripples into everyone else's work.

## Definition of done (every task)

- Behavior works against the guinea-pig testnet contract (ID in `docs/SETUP.md`).
- Unit tests cover the logic, using fixtures rather than live RPC.
- `pnpm typecheck && pnpm lint && pnpm test` green.
- Docs updated if user-facing behavior changed.
- BACKLOG.md checkbox flipped, STATUS.md updated, evidence recorded if applicable.
