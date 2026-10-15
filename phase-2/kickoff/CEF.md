# Kickoff — CEF (Fatih's CLI/engine agent)

You are the CLI/engine agent working for **Fatih**. Rakha has his own CLI/engine agent (CER), so this track is half of `packages/`, not all of it.

## Read first, in order

1. [`../README.md`](../README.md): role codes and the **standing rules**, which bind you.
2. [`../PHASE2-PLAN.md`](../PHASE2-PLAN.md): every decision and card. Your cards are the ones marked **CEF**.
3. `AGENTS.md`, then `docs/ONBOARDING.md` if this repo is new to you.

Then re-verify against `origin/main` anything in the plan you are about to build on. The plan was written on 2026-10-14 and the repo moves.

## Your paths

**Yours:**
- `packages/core`
- `packages/shared-types`
- `packages/cli` except `src/extend.ts` and its tests
- `scripts/` (gates)
- `docs/adr/`
- `docs/` generally
- the MCP server
- the auth module and API spec in the backend

**CER's — do not edit, open an issue mentioning Rakha instead:**
- `packages/engine`
- `packages/cli/src/extend.ts`
- `action.yml`
- the DB schema and migrations
- the scheduler
- the hosted-autopilot code

**Shared, coordinate by PR review:**
- `BACKLOG.md`
- `package.json`
- `pnpm-lock.yaml`
- `.github/workflows/`

The backend's location (folder, Worker name) is decided in **PH2-E2-02**, with WEBF.

## Your cards, in the order to take them

**Prerequisite (Fatih):** #296 and #297 are merged. Confirm on `origin/main` before starting; PH2-E0-07 depends on `B-D31-04` existing there.

1. **PH2-E0-07 — register every card in `BACKLOG.md`.** ✅ Done 2026-10-15; the IDs are in `BACKLOG.md` § Phase 2.
   - Create a phase-2 section and pick an ID scheme the checker accepts. Today that is `W\d-D\d+-\d+ | F-\d+ | B-D\d+-\d+` (`scripts/task-id.mjs`, as of 2026-10-14).
   - Either use `F-\d+`, or extend the regex with a phase-2 form. If you extend it, **commission the change**: show the checker rejecting a malformed ID and accepting a good one.
   - Owners are written `(F · CEF)`, `(R · CER)` and so on.
   - Then rewrite every label in `phase-2/` to its registered ID.
   - Report the label→ID mapping table.
2. **PH2-E0-02 — retire the evidence freeze.** ✅ Done 2026-10-15, **re-scoped: the premise was wrong.** No gate froze `core`. See the `PH2-E0-02` row in `BACKLOG.md`. The original steps are kept below as the record:
   - ~~Tag `sow1-final` at the commit that holds the sealed bundles.~~ Tagged at `fb93b66` as a record, not a gate input.
   - ~~Make `check:evidence-integrity` verify those bundles against the tag rather than the working tree.~~ It never read the working tree outside the bundles.
   - ~~Prove it in both directions.~~ A `core` change never failed the gate, and tampering with a sealed file still does.
   - ~~Only then is `core` editable.~~ It always was.
3. **PH2-E0-03 — docs hygiene.**
   - The gate-Present vs report-Partial D2 note.
   - The protocol blockquote in five docs (`SOROBAN-PRIMER.md:72`, `README.md:23`, `PRD.md:74`, `STATUS.md:1314`, `ADR-002:46` — re-check those line numbers) replaced with the W1 two-identity measurement.
   - `USAGE` in `cli/src/command.ts` lists `extend`.
   - Protocol 23 auto-restore in the primer.
4. **PH2-E0-05 — ADRs:**
   - a new ADR superseding ADR-004 (allowance funding plus fee);
   - amend ADR-002 (capped property via the token layer, #297);
   - amend ADR-003 (Cloudflare + Neon);
   - a new auth ADR (plan §3.1).

   Name each departure in the text. Do not rewrite history.
4b. **PH2-E0-06 — retire the sprint write guard for A/B/C** (moved from CER on 2026-10-15; Rakha reviews). `PROTECTED_ENTRIES` exists only to protect sprint evidence. Close `B-D31-04`: either give the CLI a reachable override, or remove the need for one. Mutation-prove whatever guard remains. **`check:crossing` fails without A/B/C, so it must be retired first** (PH2-E0-04).
5. **PH2-E0-04 — gate inventory.** All 19 gates: keep / retire / modify, one reason each. **Report it to Fatih and remove nothing until he approves.**
6. **PH2-E1-01 — `#235`.**
   - Archived entries get a truthful TTL status (no `known` with negative remaining).
   - `issues[]` names archival.
   - Document the `--json` schema change as breaking, for CLI `0.2.0`.
   - Mutation-prove the fix.
7. **PH2-E1-03 — network plumbing, plus the mainnet read-only scan path** (the latter moved from PH2-E1-04 on 2026-10-15; now weight L). Choose the network explicitly across CLI, engine, signer and dashboard config. Today the CLI hardcodes the testnet passphrase (`cli/src/bin.ts:52`), and every path checks the RPC's network.
   - **The dashboard is in scope.** `RPC_URL` is a literal at `apps/web/src/lib/evergreen.ts:36` and `apps/web/src/chrome-client.ts:6`. Agree the config shape with WEBF; WEBF edits `apps/`.
   - **CER's PH2-E1-04 builds on this.** It covers the mainnet `extend` refusal and `action.yml`.
   - Design the user-facing surface (flag name, config key) yourself.
   - Show it to Fatih before merging, because it is public API.
8. **PH2-E1-05** — archived-entry advice strings mention Protocol 23 auto-restore.
9. **PH2-E2-02 — API spec, with WEBF.** Write it before either side builds against it.
10. **PH2-E2-04 — auth** (plan §3.1):
    - passwordless email;
    - SEP-10-style wallet challenge linking;
    - server-side sessions.

    Email never authorises anything that moves XLM.
11. **PH2-E4-07 — router-contract spike.** Can one contract invocation take the platform fee and extend a target's TTL, with one user signature? Verdict: all entries / instance+code only / not viable, with testnet tx hashes. If instance+code only, measure what share of a typical rent bill that covers.
12. **PH2-E1-07** — MCP server (side track, after PH2-E1-01).
13. **PH2-E1-08** — CLI "Support Evergreen" tip, per plan §3.3. It is at most monthly, dismissible for the month, TTY/stderr only, and never appears in `--json` or CI.
14. **PH2-E4-06** — public custody statement. Draft it; Fatih approves.

## Report format

Each report covers:
- what landed (PR links);
- what you verified and how;
- what is `undetermined`;
- questions for Fatih, as decisions with options and a recommendation.

No restating of the plan.
