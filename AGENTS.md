# AGENTS.md — agent operating manual for Evergreen

**This file is canonical for every coding agent, whatever tool you are.** Claude Code, Cursor, Codex, Copilot, Gemini, or anything else — the rules here apply unchanged. `CLAUDE.md` is a pointer to this file, not a second manual.

> **`CLAUDE.md` is deliberately thin — do not "helpfully" copy this manual back into it.** Beyond the ordinary drift argument, some harnesses **inject `CLAUDE.md` into an agent's context at session start**, which means it can be stale there while correct on disk. A stale pointer is inert; a stale manual actively misleads, and it misleads the highest-traffic agent on the project. Observed 2026-09-05 when a test agent read an outdated cached copy and reported rules the canonical file had already retracted.

**New here? Read [`docs/ONBOARDING.md`](docs/ONBOARDING.md) first.** It is the orientation: what Evergreen is, what will bite you, and the workflows. This file is the manual — what you must obey — and it makes more sense once you have the orientation.

Read this file every session. It tells you what this project is, how to pick up work, and what you must never do.

**On tooling.** Nothing here assumes a particular agent harness. Where a rule needs a capability you may not have — Notion access, a specific command runner — it says what to do if you lack it. If a rule seems to require a tool you do not have, that is a bug in this document: do the repo-side work, record it, and say so.

## What Evergreen is

An open-source toolkit that stops Soroban smart contracts from being archived. Soroban ledger entries have a TTL measured in ledgers; remaining TTL zero is the final live ledger. After it, persistent entries are archived and temporary entries are deleted. Archived state must be restored before use. Evergreen monitors TTL, predicts archival, estimates rent cost, and automatically extends TTL before expiry — non-custodially.

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

> **If your tool has no Notion access, this whole section is optional.** Do the repo-side work exactly as normal and add one line to `docs/STATUS.md` saying a Notion sync is pending, with the task IDs. Then carry on. The repo is canonical precisely so the mirror can be absent without stopping anything — see § F. **Never block on the mirror, and never silently skip it**: an un-noted skip is how the board goes stale without anyone knowing.

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
   **Diff on presence, not only on status.** Report rows present in one channel and absent in the other, as well as rows whose status disagrees. A divergent ID looks exactly like that — a phantom on one side, a missing row on the other — and a status-only diff will read green while the row it should have caught has silently fallen out of scope. *(Caught `W1-D7-08` on 2026-09-10: the repo had 51 W1 rows, Notion 50, and every row present in both agreed on status **and** owner — a status-only check would have read green. See the anomaly log in `docs/STATUS.md`.)*
3. Resolve any discrepancy **before writing code**:
   - **Notion asserts something the repo does not support** → escalate. This covers a wrong status, a phantom row, and a divergent ID alike; do not narrow it to "claimed a completion." Correct Notion to match the repo, and log it in `docs/STATUS.md` as a sync anomaly with the date and task ID. If this happens twice, say the workflow itself is suspect.
   - **Repo ahead of Notion** → a missed write. Correct Notion. No escalation needed.

   > **Repo-canonical means the repo is where truth is *authored*, not that it is always right. When the mirror reveals a repo error, the fix is repo-first-then-sync — not mirror-ward.**
   >
   > This exception is load-bearing. A recurring task left `[ ]` in the repo while Notion correctly says `In progress` is a *repo* error: mechanically "correcting" Notion would degrade the mirror while feeling like enforcement. Rules that are wrong in a narrow case are more dangerous than rules that are obviously wrong, because they get followed. Ask which channel is *right* before asking which is canonical.
4. Only after the two agree, mark your task `[~]` / `In progress` in both, and start.

Never skip step 2 because the task looks obvious. The validation exists to catch the case where a previous session recorded work it did not do.

### B. During work

- **Push the branch as soon as work starts — unfinished, failing, WIP, whatever it is.** A branch name on the remote is enough; nobody has to read it. Do not wait until the work is presentable.

  *Why this is a rule and not a preference:* on 2026-09-07 the same email task was built twice, because one version sat on a local branch for a day. The repo is canonical, but **only the pushed repo is visible** — the dual-channel sync cannot catch what was never pushed, and neither can a person. A day of duplicated work cost more than an ugly branch name ever will.

  Stacking branches is fine and encouraged. Reconciling three open PRs takes minutes; rebuilding someone's work takes a day.
- Commit and PR as normal, with the task ID in the branch and commit subject.
- **Do not sync Notion on every commit.** The mirror updates at boundaries only.
- If you hit a blocker: mark `[!]` / `Blocked` in both, and **open a GitHub Issue** — title carries the task ID, body states what is blocked, what was tried, and what would unblock it. Put the issue link in the Notion row's `Notes`.
- If you discover work that is not in the backlog: **open a GitHub Issue**, add it to `BACKLOG.md` with a new frozen ID, and create the matching Notion row. Never absorb undocumented work silently — that is hard rule 8.

### C. On PR merge

Update the Notion row(s) for every task ID in that PR: `Status`, plus a one-line outcome in `Notes`. If the PR closed an Issue, note that too.

### D. Session end — write both channels

1. Repo: flip the `BACKLOG.md` checkbox, update `docs/STATUS.md`, record any evidence in `docs/EVIDENCE.md`.
2. Notion: set `Status` on every task touched, and write the outcome into `Notes` — what happened, not just that something happened. Link the PR or Issue.

   > **When creating a Notion row, take the ID from `BACKLOG.md`. Never infer it from a naming pattern.** Guessing ~~W1-D4-04d~~ because `04b` and `04c` exist is how the join key diverges — and a divergent ID does not fail, it silently stops matching. The row falls out of every future diff while the diff still reads green. The repo registers the ID first; Notion copies it.
3. **Create a Notion row for every task ID you ADDED to `BACKLOG.md` this session — worked on or not.** Creating a task and touching a task are different events, and only the second used to trigger a write. A task added on a day nobody works it never reached the mirror.
4. **Run the presence diff across ALL rows, every session end.** Not on demand, not scoped to the current week. Compare every registered ID in `BACKLOG.md` against every Notion row, both directions.

   > **This is the only check that catches absence, and absence is the failure mode that hides.** Status, owner and title comparisons can only compare rows that exist on both sides — a missing row passes all three, forever. The same blind spot appeared in the title sweep, where a similarity score could not see that `W4-D24-04` had no row at all.
   >
   > *Three separate discoveries, one mechanism, 2026-09-09/10:* `W1-D7-08`, then `W4-D24-04`, then **thirteen more** — every one a task created and then not touched again. Had this run at session end from Sep 5, none would have survived a day.

   > **Reasoning goes in the repo first, then mirrors. Never only into a Notion `Notes` field.** A note living only in the mirror has no canonical home, and the next repo→Notion sync can overwrite it — the exact inverse of a missing row, and just as invisible. If it is worth writing into a row, it is worth a line in `BACKLOG.md`, `docs/STATUS.md` or `docs/CONVENTIONS.md` first. *(Caught 2026-09-10 on three items written to Notion only: a Sep 16 slack recheck, the provenance test for phantom rows, and the rule that a retired ID stays visible in the mirror. All three now live in the repo — see `docs/CONVENTIONS.md` § the provenance test.)*

5. If a new finding, decision, or ADR landed, add it to the **Knowledge Base** or **Decisions** page. These are where the humans go for "why", so a decision that exists only in a commit message is effectively invisible.
6. At a **week gate**, also refresh the Project Brain page: per-week counts, today's tasks and owners, days to deadline, health.

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
AGENTS.md               this file — canonical operating manual for any agent
CLAUDE.md               thin pointer to AGENTS.md (Claude Code reads it by name)
docs/ONBOARDING.md      orientation for an agent arriving cold
docs/
  READY.md              ⭐ the product's definition of done — four things a stranger must be able to do
  PRD.md                what we're building and why; scope boundaries
  STATUS.md             living board — current state of every workstream
  ARCHITECTURE.md       modules, data flow, shared types
  CONVENTIONS.md        code style, commits, branches, PRs, testing rules
  SOROBAN-PRIMER.md     domain knowledge: TTL, rent, archival, RPC shapes
  SETUP.md              environment, accounts, service config, contract IDs
  EVIDENCE.md           grant evidence tracker (tx hashes, screenshots, links)
  POLICY-SIGNER.md      (W3) the hardened signer path for self-hosters
  adr/                  architecture decision records (001–006; 006 is Proposed)
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
- **ADR-003:** all three parts decided. Toolchain Node 24 / pnpm / Vitest; scheduler **GitHub Actions cron**; hosting **Cloudflare Pages** (live); persistence **PostgreSQL on Neon, deferred to W4** behind the Sep 20 proof. Frame persistence as *atomicity*, not storage — the no-double-bump guarantee needs a real lock, and repo-committed JSON is adequate history but useless as one. Only one of its three arguments is load-bearing; the ADR labels which.
- **ADR-004:** the user always pays their own extend fees. Apex never subsidises rent. `BumpRecord` carries payer distinct from contract; config is N contracts × M payers; `Signer` is an interface resolved per payer — v1 implements no multi-tenancy but must not foreclose it.
- **ADR-005 (accepted 2026-09-08):** shared domain types are JSON-compatible. Money is decimal text, not `number` — stroops above `MAX_SAFE_INTEGER` round silently. Explicit variants over sentinels, so "no TTL known" stays distinct from "expiring now". The `Signer` seam is **not** a security boundary.
- **ADR-006 (Proposed, in PR #60):** `evergreen scan` exit codes separate *incomplete information* (3) from *observed low TTL* (1), precedence 2 > 3 > 1 > 0. Exit status summarises health and **never authorises a transaction.** Awaiting Fatih's acceptance.

New non-trivial decision? Write an ADR (`docs/adr/README.md` has the template) and link it from STATUS.md.

## Token efficiency

Default to sequential work in a single thread. Sub-agents are a deliberate
tool for defined moments, not a reflex.

### The test, before the rules

**Would this have caught something a targeted check could not?**

That is the primary test and it decides most cases on its own. A fan-out over the whole doc tree at a week gate, yes — no grep finds "these two files contradict each other about a contract we cannot replace." A fan-out to answer what one grep answers, no.

It is deliberately about the *finding*, not the procedure: the caps below are a proxy for proportionality, and a proxy is worth less than the thing it stands for. **When the test gives a clear answer, follow it. Use the caps as the fallback for when it is genuinely ambiguous** — and when you invoke a cap instead of the test, say which, because that is a signal the test needs sharpening.

**Sub-agents**

- Do not spawn sub-agents for routine work, or automatically for
  "comprehensive" audits.
- Spawn them only at week gates, before merging a high-risk change, or when
  explicitly asked.
- Cap at 3 per invocation. Five lenses plus three refuters is an audit
  someone asked for, not a default.
- State up front what each one is for and roughly what it will cost.

**Models**

- Sonnet or lower for reading, context-gathering, delegation, and routine
  implementation.
- Opus only for a named high-stakes decision — an architectural trade-off, a
  security-relevant review, a finding that would change the plan. Say why
  before using it.

**Scope**

- Audit only what the current task or branch touches. No global sweeps
  unless asked.
- Read targeted line ranges, not whole files, unless the whole file is the
  subject.
- Prefer one well-aimed grep over loading a directory.

**Reporting**

- Report roughly what a session cost when it was unusually large, and why.
  Cost that stays invisible cannot be managed.

### What this rule deliberately does not cut

**Not a ban, and the distinction matters.** Two Sep 8–9 audits cost ~9.3M and ~7.1M sub-agent tokens between them, which is what prompted this section — but they are also what found the packaging defect that would have 404'd for every user, the public README error about our own domain, a `CODEOWNERS` that had never routed a review, and two contradictory `SETUP.md` rules about the contract we cannot replace. **A rule that would have prevented the npm fix is a bad rule.** Cut the breadth; keep the rigor.

Two things survive this section unchanged, and are not "audits" for the purposes of the caps above:

- **Fresh-machine and stranger-facing checks stay.** They are cheap — a pack, an install, a scan — and they catch what internal gates structurally cannot. Six green gates said nothing about whether a stranger could install the package, because *a check that never leaves the monorepo cannot answer a question about strangers.*
- **Verifying a finding before acting on it stays.** Running the reproduction costs a few hundred tokens and has corrected three claims this week, including two of Fatih's own and one of mine. Reading code to decide whether a claim is true is the expensive path *and* the unreliable one.

### Baseline, so the numbers mean something

A cost with nothing to compare against cannot be judged. Measured on this repo, main-thread tokens from the session counter and sub-agent tokens as the workflow tool reports them:

| Turn | Main thread | Sub-agents | Total |
|---|---|---|---|
| Ordinary sequential turn (multi-file edits, checks, commit, PR) | **~30k** | 0 | **~30k** |
| Week-gate doc audit (5 lenses × 2 refuters, 123 agents) | ~125k | 9.26M | **~9.4M** |
| Readiness audit (5 lenses × 2 refuters, 73 agents) | ~94k | 7.11M | **~7.2M** |

**An audit turn costs roughly 250–300× an ordinary one.** Both figures are ±10% and exclude cache effects.

Read that as a price, not as waste. The two audits bought the packaging defect, the public README domain error, the inert `CODEOWNERS` and the contradictory `SETUP` rules — the first of which would otherwise have shipped. **The point of the baseline is that "was this finding worth 7M tokens?" becomes a question with an answer**, instead of a cost nobody can see.

## Log the doc gaps as you hit them — standing, both sessions

**When you do something the docs describe, follow the docs rather than your memory of the repo.** Then log every point where you had to guess, look somewhere else, or already knew something the doc did not say. Append it to the gap list in [`docs/W1-REVIEW.md`](docs/W1-REVIEW.md) § Doc gap log — one line, at the moment it happens, before you resolve it. *A question answered is a question forgotten.*

**Why this is standing behaviour and not a scheduled task.** Two independent observations say the same thing about our docs, and nobody had connected them until the W1 closeout: `W1-D4-12`'s fresh-eyes agent scored **7/7 on the self-test and still could not start `W2-D8-01`**, and `W1-D7-06`'s ramp report recorded seven questions Rakha had to ask — while stating plainly that *what he understood unaided was not measured*. Both point at docs that **transmit facts without enabling action**. Both sets of gaps were then fixed. **Whether the fixes worked has never been tested.**

`W3-D21-01e` on Sep 23 is the formal test — but **the docs get used before they get tested**: the engine is built solo from about Sep 17, so if the fixes did not work we would find out in the week least able to absorb it. This costs nothing, runs continuously, and turns a single measurement thirteen days out into a stream starting today. It does not replace `W3-D21-01e`; it stops it being the *first* signal.

You are the least qualified person to judge whether a doc is clear, because you already know what it is trying to say. The log is not an opinion about the writing — it is a record of the moments you did not get what you needed from it.

## Working style expected here

- Small, reviewable commits tied to task IDs. See `docs/CONVENTIONS.md`.
- Prefer boring, obvious code. This repo will be read by an Ambassador reviewer and by future contributors, not just by us.
- When something is ambiguous in the PRD, ask rather than assume — but propose a default so the question is cheap to answer.
- If you're blocked, mark the task `[!]` and write the blocker in STATUS.md with what you tried. A blocked task nobody knows about is the most expensive thing in a 30-day sprint.
- Don't refactor across module boundaries mid-week. `packages/shared-types` is the contract; changing it ripples into everyone else's work.

## Definition of done (every task)

- Behavior works against the guinea-pig testnet contract (ID in `docs/SETUP.md`).
- Unit tests cover the logic, using fixtures rather than live RPC.
- `pnpm check` green — it runs exactly what CI runs. Don't substitute a subset here: `pnpm typecheck && pnpm lint && pnpm test` skips three of the six gates, and a local gate weaker than the remote one is worse than no local gate. *(That exact gap shipped once already — `format:check` was in CI but not in `check`.)*

**This is when a *task* is done. [`docs/READY.md`](docs/READY.md) is when the *product* is done** — four things a stranger must be able to do by Oct 2. Every task above can pass and the product can still fail that, which is the failure this project is actually exposed to. *(Demonstrated 2026-09-09: every gate was green while `npx @evergreen-stellar/cli` would have 404'd for every user, because nothing in the plan installed the package from outside the monorepo until day 27.)*
- Docs updated if user-facing behavior changed.
- BACKLOG.md checkbox flipped, STATUS.md updated, evidence recorded if applicable.
