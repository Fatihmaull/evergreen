# Gate inventory — `PH2-E0-04`

**Approved by Fatih on 2026-10-15, as proposed, plus one addition:** `scheduler-smoke.yml` is retired with cluster 2 (see the end of this page). Nothing has been removed yet; each retirement lands as its own PR, in the order below.

**Scope:** the 19 commands `pnpm check` chains in `package.json`, which is exactly what CI's one required status runs (`.github/workflows/ci.yml`). Scheduled workflows are not gates; they are listed at the end.

**The test applied to each gate:** does it guard something phase 2 still ships, or did it exist to grade SOW 1 or to protect the sprint's crossing evidence? Q6 keeps mutation proof on write paths and verification against `origin/main`. Everything else has to earn its place.

## Summary

- **Keep 12:** `check:locale`, `check:conflicts`, `check:task-ids`, `typecheck`, `check:bundle`, `check:publish`, `check:backlog`, `check:evidence`, `check:evidence-integrity`, `check:workflows`, `lint`, `format:check`.
- **Modify 2:** `check:policy`, `test`.
- **Retire 5:** `check:links`, `check:schedule`, `check:cadence`, `check:crossing`, `check:sow`.

## The 19

| # | Gate | Verdict | One reason |
|---|---|---|---|
| 1 | `check:locale` | **Keep** | Guards a live product bug class. A number formatted in the reader's locale prints different bytes per machine, which breaks `--json` consumers, the Action and the MCP server phase 2 adds. |
| 2 | `check:links` | **Retire** | Its four pages are sprint runbooks for crossings that have already happened: `SEP-20-PREFLIGHT`, `W3-D18-03-CAPTURE`, `W3-SEP18-READINESS`, `W3-D17-05-RUNBOOK`. Nobody opens them "on a day" any more, which was the gate's whole premise. |
| 3 | `check:schedule` | **Retire** | It generates the B/C crossing-watch tables from `ops/crossing-schedule.json`. C expired on 2026-09-26, so the tables are history and cannot drift into being wrong about the future. |
| 4 | `check:cadence` | **Retire** | It stops prose restating one sprint measurement: GitHub cron delivery. The hosted scheduler moves to Workers (ADR-003 amendment). `B-D31-02` records that it cannot see `.ts`, where 12 live quotes sit. The constant it protects stays pinned by `check:policy`. |
| 5 | `check:conflicts` | **Keep** | Generic and cheap. It guards a real silent pass: a conflict marker in `.prettierignore` once made Prettier match nothing and stay green. |
| 6 | `check:task-ids` | **Keep** | Phase 2 has 43 new IDs and now four agents writing them. Recommissioned for `PH2-` in #300. |
| 7 | `check:policy` | **Modify** | **Keep** the pins across `config.example`, `core/ttl.ts`, `core/health.ts` and `cli/scan.ts`; those are live product constants. **Drop** the two pins into `scripts/check-decay-drift.py`, a sprint B/C watcher **that no workflow runs** (checked: no file under `.github/workflows/` names it). It is pinning constants into a script nobody executes. |
| 8 | `typecheck` | **Keep** | It is also what builds `core/dist` before the tests run. |
| 9 | `check:bundle` | **Keep** | The npm tarball ships again as `0.2.0` (`PH2-E1-06`), and strangers download it. |
| 10 | `check:publish` | **Keep** | Same reason: it guards the bundle-and-publish-one-package decision that ended three publishing defects. |
| 11 | `check:backlog` | **Keep** | It is the parse half of the Notion mirror, and the only thing that proves every `BACKLOG.md` row reached the parser. It ran on #300 and parsed 216 rows. |
| 12 | `check:evidence` | **Keep** | Phase-2 spikes still produce testnet transaction hashes (`PH2-E4-07`, `PH2-E3-06`). A hash in a bundle but missing from `EVIDENCE.md` is still unfindable after a testnet reset. Cheap. |
| 13 | `check:evidence-integrity` | **Keep** | It protects the submitted record, and it is the only tamper check on sealed bundles. **It never constrained `core`** (`PH2-E0-02`). Retiring it removes no friction. |
| 14 | `check:crossing` | **Retire** — ✅ **retired 2026-10-15** | It is date-triggered on B and C crossings that are past. It also parses the `PROTECTED_ENTRIES` source shape in `packages/core/src/write-guard.ts`, and **fails if A/B/C are removed** (*"could not read protected subjects from write-guard.ts"*). **This is the one real coupling between a gate and `core`, and it blocks `PH2-E0-06` (CER).** |
| 15 | `check:sow` | **Retire** | It grades SOW 1 §6.1 completeness. That was submitted on 2026-10-01, its `HARD_FAIL_FROM` date has passed, and `sow1-final` records the state. Kept, its only remaining effect is to fail a phase-2 doc change that moves or rewrites a SOW 1 artifact such as `POLICY-SIGNER.md`. |
| 16 | `check:workflows` | **Keep** | A scheduled transaction-submitting workflow whose timeout exceeds its interval becomes an unbounded queue. `engine-cron.yml` and every self-hoster's copy still run on GitHub cron. |
| 17 | `lint` | **Keep** | It enforces the TTL-comparison rule (`eslint.config.js`): the threshold comparison is unwritable outside `core/ttl.ts`. |
| 18 | `format:check` | **Keep** | Standard. CI and local stay identical. |
| 19 | `test` | **Modify** | Keep it, and in a follow-up move the **sprint-instrument suites** out of the chain together with their scripts: `test:crossing-capture`, `test:save-proof`, `test:proof-runtime`, `test:expiry-assessment`, `test:scheduler-watch`, `test:failure-rehearsal`. They test tools whose only consumers are sealed B/C captures. Those replay at their own `sourceCommit` (`docs/W3-D18-03-CAPTURE.md`), so `main`'s copies verify nothing. **Mutation-proof suites on write paths stay**, per Q6. |

## Order, if approved

Retirements touch `package.json`, a shared file, so they go in **one PR per cluster**:

1. **First: `check:crossing`, then `check:sow`.** `check:crossing` unblocks `PH2-E0-06`. Outside the `test` suites, `check:crossing` is the only gate that calls `verify-crossing-capture.mjs`.
2. **Then `check:links`, `check:schedule`, `check:cadence`, the `check:policy` modification, and `.github/workflows/scheduler-smoke.yml`.** These are doc-only gates and a sprint instrument, with no product effect.
3. **Last, the `test` split**, after (1), because the crossing suites import the same capture modules.

**Each retirement deletes the script, its tests and its `package.json` entry**, and updates every place that states the gate count. Two sources currently disagree:
- `scripts/check-sow-completeness.mjs` says *"nineteen commands"*;
- `B-D31-02` records "five prose copies, three different wrong numbers".

Fixing that count is `B-D31-02`'s gate-list generator, which this inventory makes mostly moot.

**Retired is not erased.** The scripts stay readable at `sow1-final`, alongside the evidence they guarded.

## Not gates, listed so nothing is missed

| Workflow | What it does | Owner and disposition |
|---|---|---|
| `engine-cron.yml` | "Engine (fallback runner)": dry-run decisions every 15 minutes on GitHub cron | CER (`PH2-E0-06` / `PH2-E4-04`): out of scope here |
| `scheduler-smoke.yml` | reads guinea-pig A's instance TTL every 15 minutes on GitHub cron | **Retire with cluster 2** (approved 2026-10-15). Its measurement is recorded, and the hosted scheduler moves to Workers (ADR-003 amendment) |
| `evergreen-check-demo.yml` | the Action's green/red demo pair, manual dispatch only | SOW 1 evidence. Its runs are the record; disabling it changes nothing on file |
| `flake-hunt.yml` | manual dispatch, reruns a test N times | Keep, because it is a tool rather than a gate |

**Not in the chain yet, but proposed:** WEBF's `check-published.mjs` (#306). Wiring it waits on #305 merging, and it would be the 20th command.
