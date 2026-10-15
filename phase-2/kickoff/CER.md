# Kickoff — CER (Rakha's CLI/engine agent)

You are the CLI/engine agent working for **Rakha**. Fatih has his own CLI/engine agent (CEF). Your track is the **money-moving half**: the engine, the write path, persistence, and the hosted autopilot. It is the critical path to revenue.

## Read first, in order

1. [`../README.md`](../README.md): role codes and the **standing rules**, which bind you.
2. [`../PHASE2-PLAN.md`](../PHASE2-PLAN.md): every decision and card. Yours are marked **CER**. §3.2 and §3.3 are your design notes.
3. `AGENTS.md`, `docs/ONBOARDING.md`, and the spike that underpins your epic: `docs/evidence/2026-10-14-sac-allowance-spike/README.md` (PR #297).

Re-verify against `origin/main` before building on anything in the plan.

## Your paths

**Yours:**
- `packages/engine`
- `packages/cli/src/extend.ts` and its tests
- `action.yml`
- the DB schema and migrations
- the scheduler
- watchlist and alerts APIs
- all hosted-autopilot code

**CEF's — do not edit, open an issue mentioning Fatih instead:**
- `packages/core`
- `packages/shared-types`
- the rest of `packages/cli`
- `scripts/` gates
- ADRs
- auth

**Shared, coordinate by PR review:**
- `BACKLOG.md`
- `package.json`
- `pnpm-lock.yaml`
- `.github/workflows/`

## Your cards, in the order to take them

**Start now. Nothing blocks it:**

1. **PH2-E2-01 — Cloudflare Workers spike, go/no-go.** Plan §3.2 has the verified free-plan limits: 10 ms CPU per request and per cron, 50 subrequests per invocation. Run, inside `workerd` (`wrangler dev`) and then deployed:
   - a scan of guinea-pig A;
   - a testnet extend;
   - a SEP-41 `transfer_from`.

   For each, report:
   - CPU time per action;
   - subrequest count;
   - whether the scan output **matches the CLI's output for the same contract at the same ledger**;
   - whether Neon is reachable (serverless driver or Hyperdrive).

   A successful build is **not** a pass. `core` once built fine for the browser and silently mis-scanned because of the global `Buffer`.

   Verdict: **free / Workers Paid / not viable**, with the numbers.

**Then — none of these waits on PH2-E0-02, because no gate ever froze `core`:**

2. ~~**PH2-E0-06 — retire the sprint write guard for A/B/C.**~~ **Moved to CEF on 2026-10-15**, because `write-guard.ts` is in `packages/core`. Rakha reviews CEF's PR.
3. **PH2-E1-02 — tests for `cli/extend.ts`.** It is at 37.5% function coverage and is the file that signs; you wrote it (#86). Mutation proof is required.
4. **PH2-E1-04 — `extend` refuses on mainnet, plus `action.yml` mainnet support.** The refusal is tested in both directions. *Shrunk on 2026-10-15:* the mainnet read-only scan path moved to CEF's PH2-E1-03, which this card depends on.
5. **PH2-E1-06 (R, in person) — publish CLI `0.2.0`, without the Support tip** (PH2-E1-08 is not a dependency). You are primary for publishing. Verify against the registry readback, never `package.json`.

**After PH2-E2-02 (the API spec, CEF + WEBF):**

6. **PH2-E2-03 — Neon schema:**
   - users, sessions, wallets;
   - watchlist;
   - allowances (cap, `live_until_ledger`, last-read remaining);
   - jobs, with an idempotency key;
   - fee ledger: rent pulled, rent charged, fee, refunds.

   Your Neon preflight (#261) and persistence spike (#52) are prior art.
7. **PH2-E2-05** — watchlist API. **PH2-E2-06** — per-user alerts reusing the Resend channel you built (#137).
8. **PH2-E4-01 — multi-tenant engine:** N contracts × M payers, with per-contract budgets in the DB. ADR-004 already set the rule: never assume a single global payer.
9. **PH2-E4-02 — the hosted action flow, exactly as plan §3.3:**
   - pre-flight: simulate rent, read the allowance and balance, check the budget;
   - idempotent `transfer_from(rent + fee)`;
   - extend, with bounded retries;
   - reconcile;
   - on final failure, **refund from the engine pool, never from treasury**;
   - on-demand "Extend now" jobs: a **daily limit** per user, and an **email notice** to the user for each one (your proposal, accepted 2026-10-15).

   Every path needs a failing case first.
10. **PH2-E4-03 — key separation, with Fatih:**
    - the engine float has an upper limit and refund headroom;
    - fees are swept to treasury;
    - the treasury key never touches a server.
11. **PH2-E4-04** — scheduler per PH2-E2-01's verdict: cron enqueues work, one action per message. **PH2-E4-05** — operator monitoring: failed pulls, failed extends, float low, allowances expiring.

## Report format

Each report covers:
- what landed (PR links);
- what you verified, and with which tx hashes;
- what is `undetermined`;
- questions for Rakha (and for Fatih where a decision is his), as decisions with options and a recommendation.
