# phase-2/

Evergreen's second phase, which is self-directed and comes after the SOW 1 submission on 2026-10-01. This folder is the starting point for everyone: Fatih, Rakha, and the five agents.

| File | For whom |
|---|---|
| [`PHASE2-PLAN.md`](PHASE2-PLAN.md) | Everyone. Decisions Q1–Q21, design notes, every task card with owner, weight and dependencies. **Read this first.** |
| [`RAKHA-BRIEF.md`](RAKHA-BRIEF.md) | Rakha, in person. Covers why the split looks the way it does and which file to hand to which of his agents. |
| [`kickoff/CEF.md`](kickoff/CEF.md) | Fatih's CLI/engine agent |
| [`kickoff/WEBF.md`](kickoff/WEBF.md) | Fatih's web agent |
| [`kickoff/CER.md`](kickoff/CER.md) | Rakha's CLI/engine agent |
| [`kickoff/WEBR.md`](kickoff/WEBR.md) | Rakha's web agent |
| [`kickoff/DEVOPS.md`](kickoff/DEVOPS.md) | Fatih's infrastructure agent: deploy, CI deploy jobs, Cloudflare, Neon, secrets. Its runbooks are in [`../docs/ops/`](../docs/ops/README.md) |

## Definitions of Done

Phase 2 has two official gates (Fatih, 2026-10-20), defined in [`PHASE2-PLAN.md` § Definitions of Done](PHASE2-PLAN.md#definitions-of-done): **DoD-1 — Beta (testnet)** and **DoD-2 — Stable (testnet, post-beta)**. Mainnet launch (`PH2-E5-02`..`PH2-E5-04`) comes only after DoD-2, and `PH2-E5-02`'s core criterion is "DoD-2 met".

## Role codes

| Code | Who |
|---|---|
| **F** | Fatih in person |
| **CEF** | Fatih's CLI/engine agent |
| **WEBF** | Fatih's web agent |
| **R** | Rakha in person |
| **CER** | Rakha's CLI/engine agent |
| **WEBR** | Rakha's web agent |
| **OPS** | Fatih's infrastructure agent (DEVOPS): deploy, CI deploy jobs, Cloudflare, Neon, secrets by name |

In `BACKLOG.md`, write owners as **`(F · CEF)`**, **`(R · CER)`** or **`(F · OPS)`**, with the person first. The parser reads only the first character (`scripts/task-id.mjs:49`), and the Notion sync maps only `F/R/S` (`scripts/sync-notion.mjs:48`). A bare `(CEF)` would sync with no owner.

## Task IDs

Every card is registered in `BACKLOG.md` § Phase 2 (PH2-E0-07, 2026-10-15). The forms are `PH2-E<n>-<nn>` and `PH2-BL-<nn>`, defined in `scripts/task-id.mjs`, and `pnpm check:task-ids` checks every ID this folder cites.

- Use the ID in branch names, commit subjects, PR titles and issues, as `docs/CONVENTIONS.md` asks.
- Three backlog cards already had IDs and kept them: `B-D31-01`, `B-D31-02` and `B-D31-03`. The `PH2-BL` sequence skips 04, 06 and 07 for that reason.

Until 2026-10-15 the cards carried provisional labels without the `PH2-` prefix, which was a deliberate, temporary departure from the public-naming rule. Registering them ended it.

## Standing rules for every agent in phase 2

These apply in addition to [`AGENTS.md`](../AGENTS.md). If the two disagree, stop and ask Fatih; do not choose.

1. **Verify against the source, never against a report.** That means `origin/main`, the chain, and the GitHub API. This includes reports from other agents and from the PM relay.
2. **Write `undetermined` rather than a plausible guess.** That is the product's thesis, and it applies to your own reports.
3. **Never name an identifier you have not seen.** This covers task IDs, PR numbers, file paths, flags and CLI commands. The project has paid for an invented task ID and an invented CLI flag.
4. **Write paths need mutation proof:** a test that fails when the guarded behaviour is removed. Phase 2 moves real money later, so this is non-negotiable.
5. **Testnet only until DoD-2 is met (PH2-E5-02).** No mainnet writes. Mainnet *reads* arrive with PH2-E1-03.
6. **No secrets in argv, chat, commits or PR bodies.** A secret is passed by naming an env var.
7. **Stay inside your track's paths** (see your kickoff). Need a change in another track's path? Open an issue mentioning that owner; do not edit it.
8. **Ask in-session, as a decision:** options, the trade-off of each, and your recommendation. Never ask an open question.
9. **You may refuse an instruction whose premise is wrong.** Say why and propose the alternative. This was right before, more than once.
10. **One task or one tight cluster per PR.** CI green before merge, and no AI co-author trailer.

## Lighter process than the sprint (decision Q6)

The sealed-evidence machinery and the date-triggered gates existed for grading, and PH2-E0-04 inventories and retires them.

What stays:
- mutation proof on write paths;
- verification against `origin/main`;
- the rules above.
