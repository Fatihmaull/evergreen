# Evergreen Phase 2 — decisions, design and task plan (v4)

**Status: CONFIRMED by Fatih, 2026-10-14.** v4. Written from the grilling session (Q1–Q20), the §4 answers, and Rakha's merged-PR history. Every card is registered in `BACKLOG.md` § Phase 2 since 2026-10-15 (PH2-E0-07).

**Card IDs are registered task IDs** (rewritten 2026-10-15 by PH2-E0-07).
- v4 was confirmed with provisional labels; each became its ID by gaining a `PH2-` prefix. The form is defined in `scripts/task-id.mjs:33`.
- **Three exceptions:** the backlog cards that already had IDs keep them — `B-D31-01`, `B-D31-02`, `B-D31-03`. The `PH2-BL` sequence skips 04, 06 and 07.
- The naming departure this note used to record — provisional labels in a public folder — ended with the rewrite.

---

## 1 · Phase 2 in one paragraph

Evergreen becomes a product people use. Success is real adoption (Q4), starting with an **initial release to 10–20 users for feedback**.

- The CLI covers what developers need.
- The dashboard works for anyone's contracts: email + wallet login, a personal watchlist, scan, and extend.
- A hosted autopilot is funded by a **capped, expiring XLM allowance** the user signs once (Q8).
- The fee rule: **whenever XLM moves, Evergreen takes a percentage fee per transaction; actions that move no XLM are free.**
- Testnet public beta first, mainnet second.

---

## Definitions of Done

**Official, Fatih, 2026-10-20.** Two gates. The thresholds are written as Fatih set them; where one cannot be measured with what the plan will build, the note under them says which and why.

**P0** = loss of funds, failed protection, or a false health state shown to a user.

### DoD-1 — Beta (testnet)

Met when:
- every E0–E4 card is done;
- at least 10 external users (not the team) are onboarded on testnet, each having logged in with email + wallet, added ≥1 contract to a watchlist, and run ≥1 extend (autopilot or manual) recorded in the fee ledger;
- every user's feedback is recorded in one place (`PH2-E5-01`);
- the public custody statement is approved by Fatih and live (`PH2-E4-06`);
- no open P0.

### DoD-2 — Stable (testnet, post-beta)

Measured over 30 consecutive days after DoD-1:
- zero missed protections (no watched entry archived while its allowance was valid and funded);
- ≥99% of autopilot jobs succeed and 100% of failed pulls are refunded from the engine pool;
- zero subsidy (the fee ledger shows the engine never paid a user's rent, and reconciliation has no unexplained differences);
- the worst scheduler gap is measured, dated, and below the 17,280-ledger act threshold;
- no open P0/P1, every incident has a postmortem;
- every failure mode is shown to alert both user and operator, and a Neon backup restore has been exercised;
- engine and treasury keys are separate and the float never exceeded its cap;
- a cold reader can onboard from the docs alone (`B-D31-03`).

**Mainnet launch (`PH2-E5-02`..`PH2-E5-04`) comes only after DoD-2.** `PH2-E5-02`'s core criterion is "DoD-2 met".

### Measurability: what these need that nothing yet provides

Checked against `origin/main` on 2026-10-20. Most thresholds are measurable from records the plan already calls for (the `PH2-E2-03` tables, transaction results, the engine account's history). These are not, as things stand:

1. **"No open P1" is unmeasurable: P1 is not defined.** Only P0 is. The repo also has no priority labels (`gh label list`: `bug`, `documentation`, `enhancement` and the GitHub defaults), so "no open P0" has nowhere to be counted either. Both need a definition and a label before DoD-1 can be checked.
2. **"Every failure mode is shown to alert both user and operator" needs a list of failure modes.** None exists. `PH2-E4-05` names operator conditions (failed pulls or extends, float low, allowance expiries), and §3.3 names user alerts (pre-flight abort, expired allowance, renewal reminders), but nothing enumerates the modes, so "every" cannot be checked.
3. **"100% of failed pulls are refunded" does not match the flow it measures.** A pull that fails moves no XLM, so there is nothing to refund. §3.3 step 5 and §4.3 refund when *a pull succeeds and the extend fails*. As written the threshold is either vacuous or measures the wrong event.
4. **"Run ≥1 extend (manual) recorded in the fee ledger" is measurable only for allowance users.** Their one-click extend is an engine job, so reconcile writes the ledger (§3.3 step 4). A user without an allowance extends through `PH2-E4-07`'s router contract, a transaction they sign themselves. No card says that transaction reaches the fee ledger. If the router is not viable, dashboard extend requires an allowance (§3.3), and the gap closes by itself.
5. **"Below the 17,280-ledger act threshold" assumes one threshold.** 17,280 is the CLI's default (`packages/cli/src/command.ts`, `--threshold`). The engine's action threshold is configurable (`bumpWhenRemainingLedgersBelow`, `packages/core/src/config.ts`), and the hosted engine's is not decided yet (`PH2-E4-01`). If users can lower it, the worst gap has to clear the lowest one in use.
6. **The 30 days assume testnet is not reset during them.** A testnet reset wipes every watched entry. Whether one falls inside the window is **undetermined**, and the DoD does not say whether a reset restarts the 30 days.
7. **"A cold reader" cannot be Fatih any more.** `B-D31-03`'s own row says the cold read now belongs to someone who has watched the project for a month. The reader has to be someone else, for example one of the external beta users.

Measurable with records still to be built:
- *zero missed protections*: §3.3's pre-flight reads the allowance and the user's balance before every job. It is measurable only for entries the scan can see (instance, code, and declared data keys).
- *≥99% of autopilot jobs succeed*: below 100 jobs in the window, 99% means zero failures. Whether a clean pre-flight abort (a user's empty balance, alerted) counts as a failure is not defined.
- *the float never exceeded its cap*: needs the cap recorded as a number (`PH2-E4-03`), and the engine account's balance recorded continuously or reconstructed from its history.
- *zero subsidy*: from the fee ledger plus each transaction's charged fee. ADR-007's `[to verify]` on resource-fee refunds changes what reconcile records, not whether it is measurable.

---

## 2 · Decision record

| # | Decision | Cost / consequence |
|---|---|---|
| Q1 | Shared code entry extended via `stellar` CLI — **done** (#296, live until 8,297,162). Evergreen's CLI must be able to do it in future (`B-D31-04`). | — |
| Q2 | ~~Retire the evidence-integrity freeze: tag `sow1-final`, verify against the tag, unfreeze `core`.~~ **Corrected 2026-10-15 (PH2-E0-02): there was no freeze.** No gate ever compared `core` with anything, so `core` was always editable. `sow1-final` tags the submitted state as a record, not a gate input. The claim ran from the 2026-10-14 extraction, to the handover, to the PM prompt for #296, to #296's evidence README, to `B-D31-04`, to this table. Nobody read the verifier at any step. | No infra PR, no new gate |
| Q3 | Mainnet hosted autopilot is a paid service. | Supersedes ADR-004's "hosted not built" |
| Q4 | Goal: real adoption. Usable dashboard and complete CLI. | Needs a backend |
| Q5 | Mainnet starts read-only. | No mainnet autopilot until extend is hardened |
| Q6 | Lighter process. Keep mutation proof on write paths and `origin/main` verification. | Gate inventory needs sign-off |
| Q7 | Docs hygiene now. | — |
| Q8 | **Allowance, not custody** (spike #297: viable with four limits). | Re-sign about every 180 days; per-contract caps are off-chain |
| Q9 | Fee is a percentage per transaction. The percentage is set from mainnet data. | — |
| Q10 | Open-core: CLI and self-hosted engine are MIT; hosted is paid. | — |
| Q11 | One revenue destination, no profit split; all of it funds development. | — |
| Q12 | Cloudflare: Free, then Workers Paid if PH2-E2-01 measures the engine over the free limits. Render was evaluated and rejected (§3.2). | At most about $5/month, on one platform |
| Q13 | Neon Postgres. | Sprint prerequisites still open |
| Q14 | Manual watchlist now; auto-discovery in backlog. | — |
| Q15 | Foundation → dashboard → hosted; MCP as a side track. | — |
| Q16 | Fix `#235` in `core`; CLI to `0.2.0`. | Breaking `--json` |
| Q17 | Treasury key separate from engine key. | A sweep step |
| Q18 | Testnet beta before mainnet money. | Revenue later |
| Q19 | Two agent tracks per person — see §4 for roles. | API spec is the contract |
| Q20 | Email + wallet login. | First account system in the project |
| §4.2 | Fee applies to dashboard manual extends too. | ⚠️ A Soroban transaction holds exactly one operation, so the fee cannot share the extend's transaction — see §3.3 |
| §4.3 | If a pull succeeds and the extend fails, refund from the **engine pool**, never from treasury. | The engine float must hold refund headroom |
| §4.4 | npm publish rights: both Fatih and Rakha; **Rakha is primary owner of publishing**. | — |
| §4.5 | Fee collection is legal and safe, **per Fatih**. | Recorded as his assertion |
| Q21 | **Fees only when Evergreen's own infrastructure executes** (hosted autopilot, dashboard extends). The CLI and self-hosted engine stay fee-free and open source. Add an **opt-in "Support Evergreen"** tip in the CLI and on the website. | Revenue from CLI users is voluntary only |
| Fee, users without an allowance | Research a router contract first (PH2-E4-07): fewest signatures. **If it cannot work, dashboard extend requires an allowance.** | See §3.3 |

**ADR changes (card PH2-E0-05):**
- ADR-004 is superseded by a new ADR covering allowance funding and the fee. The invariant *Apex never subsidises rent* survives.
- ADR-002 is amended: the capped property is achieved at the token layer (#297); the no-go stands.
- ADR-003 is amended: Cloudflare + Neon. *(2026-10-22: one shared Cloudflare account, superseding the project-owned one from #299; see #310 and ADR-003's update log. Reviewed again at PH2-E5-02.)*
- New ADR for authentication (§3.1).

---

## 3 · Design notes — best practice per decision

These are recommendations for the ADRs to record. Facts marked **[verified]** were checked against a primary source today; facts marked **[to verify]** are a card's job.

### 3.1 Q20 — email + wallet login

**Two identities, two powers.**
- **Email** is the account: identity, recovery, notifications.
- **Wallet** is authority over money. Nothing that moves XLM is ever authorised by an email session. On chain it cannot be anyway, because the allowance is the user's signature.

**Email: passwordless.**
- A one-time code or magic link: 10–15 minute expiry, single use, stored hashed.
- Send rate is limited per address and per IP.
- Delivery reuses the Resend channel the engine already has (`packages/engine/src/email-channel.ts`).
- No passwords are stored, so none can leak.

**Wallet: a signed challenge, the SEP-10 (Stellar Web Authentication) pattern.**
- The server issues a challenge, the wallet signs it, the server verifies it.
- Linking a wallet to an account always requires that signature.
- One account can link several wallets.
- **[to verify]** whether the SDK version we pin ships the SEP-10 helpers, or the server builds and verifies challenges itself.

**Sessions.**
- Server-side session rows in Neon, referenced by an `httpOnly; Secure; SameSite=Lax` cookie.
- Short-lived and rotated. CSRF protection on state-changing routes. Logout invalidates server-side.

**Account deletion is a soft delete** (Fatih, 2026-10-22, from Rakha's review of `PH2-E2-02`). The account is deactivated: the email and personal data stay in the database. So the custody statement (`PH2-E4-06`) and all public copy say **"deactivated", never "deleted"**. Observation and allowance history are kept forever until the DoD-2 evidence is gathered. Both are recorded in `docs/API.md` §10.

**Recovery.** Email recovers the account, never funds. Funds were never ours to recover, which is the point of Q8.

### 3.2 Q12 — Cloudflare first, honestly priced

**The free plan's limits [verified, developers.cloudflare.com/workers/platform/limits, 2026-10-14]:**
- **10 ms CPU** per HTTP request and per Cron Trigger invocation;
- 100,000 requests per day;
- 5 Cron Triggers per account;
- 50 subrequests per invocation.

The paid plan is 30 s CPU per cron run and 10,000 subrequests.

**What this means:**
- **The API and dashboard probably fit free.** Mostly I/O, light CPU.
- **The engine probably does not.** Each action parses XDR, simulates, signs and reconciles; 10 ms of CPU across that is very tight, and 50 subrequests caps one run at roughly 15–25 contracts.
- **This is a measurement, not a guess.** PH2-E2-01 measures CPU per scan and per extend inside `workerd`.

**Render, evaluated at Fatih's request and rejected for the engine [verified, render.com/docs/free, 2026-10-14]:**
- Free covers web services only; **background workers and cron jobs are not available free**.
- A free web service **spins down after 15 minutes without inbound traffic** and takes about a minute to wake.
- Render **may suspend a free service with unusually high outbound traffic, such as frequent external API calls**. An engine calling Soroban RPC on a schedule is exactly that.
- Render **may restart free services at any time**.

An autopilot users pay for cannot run on a host that sleeps, and keeping it awake with pings is the same platform-gaming the sprint rejected for GitHub cron. For the API alone, the one-minute cold start would be the dashboard's first impression.

**Decision ladder:** Workers Free → **Workers Paid (about $5/month)**. Billing stays on one platform, per Fatih's fallback instruction. Railway is no longer on the ladder.

**The known trap.** `core` bundled for the browser *built fine and silently mis-scanned* because of the global `Buffer`. Workers is another non-Node runtime. PH2-E2-01 passes only if a scan run inside Workers **matches the CLI's output for the same contract at the same ledger**. A successful build proves nothing.

**Neon from Workers:** its serverless driver over HTTP/WebSocket, or Cloudflare Hyperdrive. **[to verify]** which works on the plan we choose.

**Engine fan-out:** a cron run that only enqueues work, with one action per message, keeps every invocation small. **[to verify]** whether Cloudflare Queues is available on the free plan.

### 3.3 Q8 — allowance-funded autopilot

**Facts from spike #297 [verified, testnet tx hashes in the PR]:**
- `approve` and `transfer_from` work for native XLM held by G-accounts.
- The cap is enforced: over-cap, expired, revoked and self-extended allowances are all refused.
- `live_until_ledger` is at most current + 3,110,399.
- The allowance lives in temporary storage.
- There is one allowance per user–spender pair; a new `approve` *overwrites* it rather than adding.

**One constraint discovered today [verified, developers.stellar.org]:**
- A transaction containing `InvokeHostFunction`, `ExtendFootprintTTL` or `RestoreFootprint` **may contain only that one operation**.
- So the fee can never ride inside the extend's transaction.
- Every fee is either a separate `transfer_from` (allowance users) or a separate payment (everyone else).

**The recommended flow for one hosted action:**
1. **Pre-flight, nothing submitted:**
   - simulate the extend to get the exact rent;
   - read `allowance()` and the user's balance;
   - check the per-contract budget in the DB;
   - abort cleanly if any check fails, and alert the user.
2. **Pull** `rent + fee` with one `transfer_from`. The job carries an idempotency key; a job is never pulled twice.
3. **Extend** from the engine account, retrying transient failures a bounded number of times.
4. **Reconcile.** Compare the rent actually charged with the rent pulled, and record the difference in the fee ledger.
5. **On final failure, refund from the engine pool** (§4.3) with the same idempotency key.
6. **Sweep.** Fees accumulate in the engine account and are swept to treasury on a schedule (Q17). The treasury key never touches a server.

**Sizing the user's cap:**
- Shown to the user as: estimated rent for the watched contracts × chosen horizon × (1 + fee) × a safety margin.
- The margin exists because the CLI already measured rent varying about 18% between days.
- The UI must say plainly that a new approve **replaces** the cap rather than adding to it.

**Renewal:**
- Expiry is at most about 180 days.
- Reminders at 30, 7 and 1 days before.
- A revoke button that sets `approve(0)`.
- An expired allowance stops the autopilot and alerts the user. It never silently stops protecting a contract.

**Manual extend with a fee (§4.2):**
- **Allowance users: one click, zero wallet prompts.** "Extend now" is just an on-demand engine job, running the same flow as above.
  - **It has a daily limit per contract** (3 per rolling 24 hours; only a job that pulled funds counts; amended 2026-10-22 from "per user", Fatih's decisions recorded in `docs/API.md` §7 and §10) **and every one-click extend sends the user an email notice** (Rakha's proposal on #299, accepted 2026-10-15). A one-click money path with no ceiling and no receipt is the shape an account takeover would use.
- **Users without an allowance:** card PH2-E4-07 researches an Evergreen **router contract** that takes the fee and extends in **one invocation, one signature**.
  - **[to verify]**: whether a contract can extend another contract's instance and code (believed yes), and whether it can extend another contract's *persistent data* (believed no).
  - If it can cover only instance and code, say so and measure how much of a typical contract's rent that is. In #296, the code entry was 99% of the bill.
  - **If the router cannot work, dashboard extend requires an allowance first** (Fatih's fallback). Two-transaction extends are not offered.

**What a fee can never do.** Extension is permissionless, so anyone can extend any entry with the `stellar` CLI or our MIT CLI and pay no fee. The fee is the price of the convenience Evergreen runs, not a toll on the chain. That is correct and should be said plainly in the custody/pricing copy, not hidden.

**"Support Evergreen" (Q21c):**
- Opt-in only. Never on by default, never bundled into another action.
- A separate payment of an amount the user chooses, to the **treasury address**. A receive-only public address is safe to publish.
- **CLI cadence (Fatih, 2026-10-14):** shown **at most once per calendar month**, after a successful command; the user can **dismiss it for that month**.
- **Never print it where it would break something:** only in an interactive TTY, only on **stderr**, never with `--json`, never in CI (`CI` env set), never when stdout is not a terminal. `--json` output feeds scripts, the Action and the MCP server, and a tip inside it is a parsing bug.
- **Also offer a permanent opt-out** (an env var plus a config flag) for CI images and agent hosts that cannot answer a monthly prompt. Recommended as standard CLI etiquette; Fatih may drop it.
- The last-shown month is stored in the user's config directory. This is the CLI's first piece of persistent local state, so the path and format are documented.
- The website gets a support page with the same address.

**The engine float must cover:**
- in-flight extends;
- refund headroom (§4.3);
- an upper limit, beyond which it sweeps or alerts.

The float is the only thing an attacker with the engine key gets beyond outstanding allowances (#297 §6).

---

## 4 · Roles

| Code | Who | Scope |
|---|---|---|
| **F** | Fatih in person | decisions, approvals, treasury key, beta recruitment, legal |
| **CEF** | Fatih's CLI/engine agent | `packages/`, backend, CI, docs, ADRs |
| **WEBF** | Fatih's web agent | `apps/` |
| **R** | Rakha in person | npm/GitHub releases (primary), mainnet readiness, engine-key custody with F |
| **CER** | Rakha's CLI/engine agent | engine execution, hosted autopilot, persistence, Action |
| **WEBR** | Rakha's web agent | money-moving dashboard flows |

### Why the split looks like this — from Rakha's merged PRs (61 PRs, 59 commits on `main`)

His history concentrates in five areas:
- **The write path:** `extend` CLI (#86), guarded execution (#122), live TTL extension proof (#105).
- **The engine:** thresholds (#121), alerts (#142–#146), email channel (#137), temporary-retention consent (#160).
- **Persistence:** persistence spike (#52), Neon preflight (#261).
- **Releases:** npm 0.1.0 (#227, #241) and 0.1.1 (#265, #270), GitHub Release (#259, #263).
- **The Action's external CI:** #256, #257.

So the money-moving engine is his. Fatih's history (176 commits) concentrates in core/scan, gates and evidence, docs, and the dashboard UI rework (#248), so the product surface, data model and auth are his.

### ⚠️ The owner code in `BACKLOG.md` cannot be `(CEF)`

The parser reads only the **first character** of the owner field (`scripts/task-id.mjs:49`), and the Notion sync maps only `F/R/S` (`scripts/sync-notion.mjs:48`). `(CEF)` would parse as owner `C` and sync as **no owner**.

Register as **`(F · CEF)`**, **`(R · CER)`** and so on. The person stays first; the track follows.

---

## 5 · Task cards

Weight: **S** = 1, **M** = 2, **L** = 3. Ordered by dependency within each epic.

### E0 — Close-out and unblock

| Card | What | Owner | Wt | Depends on |
|---|---|---|---|---|
| PH2-E0-01 | Merge #296 and #297 | F | S | — |
| PH2-E0-02 | Correct the evidence-freeze claim; tag `sow1-final` as a record (Q2, corrected) | CEF | M | PH2-E0-01 |
| PH2-E0-03 | Docs hygiene, see the list below | CEF | S | — |
| PH2-E0-04 | Gate inventory: keep / retire / modify, one reason each. **F approves before removal** | CEF → F | S | — |
| PH2-E0-05 | ADR changes (§2) plus the new auth ADR (§3.1) | CEF | M | PH2-E0-01 |
| PH2-E0-06 | Retire the sprint write guard for A/B/C; close `B-D31-04`. *Moved from CER 2026-10-15: `write-guard.ts` is in `packages/core`. Rakha reviews.* | CEF | S | — |
| PH2-E0-07 | Register all cards in `BACKLOG.md` with real IDs and `(F · CEF)`-style owners | CEF | S | plan confirmed |

PH2-E0-03 contents:
- the D2 Present/Partial note;
- the protocol quote replaced with the W1 measurement;
- `USAGE` lists `extend`;
- Protocol 23 in the primer.

### E1 — Foundation

| Card | What | Owner | Wt | Depends on |
|---|---|---|---|---|
| PH2-E1-01 | Fix `#235` (Q16) | CEF | M | — |
| PH2-E1-02 | Tests and mutation proof for `cli/extend.ts` (37.5% functions) | CER | M | — |
| PH2-E1-03 | Network plumbing: explicit network across CLI, engine, signer and dashboard. Today the passphrase is hardcoded at `cli/src/bin.ts:52`. **Also the mainnet read-only scan path in the CLI** (moved from PH2-E1-04 on 2026-10-15) | CEF | L | — |
| PH2-E1-04 | `extend` refuses on mainnet until beta exit, tested in both directions, plus `action.yml` mainnet support. *Shrunk 2026-10-15: the scan path moved to PH2-E1-03.* | CER | S | PH2-E1-03 |
| PH2-E1-05 | Advice strings mention Protocol 23 auto-restore | CEF | S | — |
| PH2-E1-06 | Publish CLI `0.2.0`, **without the Support tip**. PH2-E1-08 is not a dependency, so the #235 fix does not wait on it | R (F backup) | S | PH2-E1-01, PH2-E1-04 |
| PH2-E1-07 | MCP server, in-repo, importing `core` | CEF | M | PH2-E1-01 |
| PH2-E1-08 | CLI "Support Evergreen" tip (§3.3): at most monthly, dismissible for the month, TTY/stderr only, never in `--json` or CI | CEF | S | PH2-E4-03 (treasury address) |

### E2 — Backend

| Card | What | Owner | Wt | Depends on |
|---|---|---|---|---|
| PH2-E2-01 | **Workers spike, go/no-go (§3.2).** Measure CPU and subrequests per scan and per extend; match against CLI output; check Neon connectivity | CER | M | — |
| PH2-E2-02 | API spec, the CE↔WEB contract. Written before either side builds | CEF + WEBF | M | PH2-E2-01 |
| PH2-E2-03 | Neon schema: users, sessions, wallets, watchlist, allowances, jobs, fee ledger | CER | M | PH2-E2-02 |
| PH2-E2-04 | Auth (§3.1): passwordless email plus SEP-10-style wallet linking, sessions | CEF | L | PH2-E2-03 |
| PH2-E2-05 | Watchlist API (Q14) | CER | M | PH2-E2-04 |
| PH2-E2-06 | Per-user alerts via Resend | CER | M | PH2-E2-05 |

### E3 — Dashboard usable by anyone

| Card | What | Owner | Wt | Depends on |
|---|---|---|---|---|
| PH2-E3-01 | Login UI: email + wallet linking | WEBF | M | PH2-E2-04 |
| PH2-E3-02 | Watchlist UI: binding expiry first, honest three-state health | WEBF | M | PH2-E2-05 |
| PH2-E3-03 | Scan any contract, with "add to watchlist" | WEBF | S | PH2-E2-05 |
| PH2-E3-04 | Manual extend with fee (§3.3: one click for allowance users, PH2-E4-07's route for others). One-click "Extend now" has a **daily limit** and sends the user an **email notice** | WEBR | M | PH2-E4-02, PH2-E4-07 |
| PH2-E3-05 | Allowance flow: cap sizing, approve, renewal reminders, revoke | WEBR | M | PH2-E4-01 |
| PH2-E3-06 | Wallet prompt test (#297 left the Freighter prompt count `undetermined`) | WEBR | S | — (only the final check against the real allowance flow follows PH2-E3-05) |
| PH2-E3-07 | Website "Support Evergreen" page: wallet payment to the treasury address | WEBR | S | PH2-E4-03 |
| PH2-E3-08 | Design-language reference for the brand, formats, infographics, motion and templates, plus the `tokens.md` update (#304). Fatih's design agent (DES), on demand | F (DES) | M | — |

### E4 — Hosted autopilot

| Card | What | Owner | Wt | Depends on |
|---|---|---|---|---|
| PH2-E4-01 | Multi-tenant engine (N contracts × M payers); per-contract budgets in the DB | CER | L | PH2-E2-03 |
| PH2-E4-02 | The §3.3 flow: pre-flight, idempotent pull, extend, reconcile, refund from pool. On-demand "Extend now" jobs are capped by a **daily limit** per contract and send an **email notice** | CER | L | PH2-E4-01 |
| PH2-E4-03 | Key separation: float limit, refund headroom, sweep to treasury. Testnet treasury key in F's OS secure store (#299); mainnet treasury key generated offline before PH2-E5-02 | CER + F | M | PH2-E4-02 |
| PH2-E4-04 | Scheduler: Workers cron with enqueue fan-out, or per PH2-E2-01's verdict | CER | M | PH2-E2-01, PH2-E4-02 |
| PH2-E4-05 | Operator monitoring: failed pulls or extends, float low, allowance expiries | CER | M | PH2-E4-04 |
| PH2-E4-06 | Public custody statement: exact exposure (#297 §6) | CEF → F | S | PH2-E4-02 |
| PH2-E4-07 | Spike: router contract for one-signature fee + extend (§3.3). Verdict: covers all entries / instance+code only / not viable. If not viable, PH2-E3-04 requires an allowance | CEF | M | — |

### E5 — Initial release and launch

| Card | What | Owner | Wt | Depends on |
|---|---|---|---|---|
| PH2-E5-01 | Initial release on testnet; recruit 10–20 users; feedback loop and adoption metrics | F | M | E3, E4 |
| PH2-E5-02 | Mainnet readiness checklist. Core criterion: **DoD-2 met** (see Definitions of Done) | F + R | S | PH2-E5-01 |
| PH2-E5-03 | Set the fee percentage from measured mainnet costs | F | S | PH2-E1-03 data (mainnet scan) |
| PH2-E5-04 | Mainnet launch with small caps (release owner: R) | R + F | M | PH2-E5-02, PH2-E5-03 |

### BL — Backlog (unscheduled, same scheme)

| Card | What | Owner | Wt |
|---|---|---|---|
| PH2-BL-01 | Contract auto-discovery via indexer (Q14b) | CER | L |
| PH2-BL-02 | Telegram and webhook channels (stubs exist in `channel-stubs.ts`) | CER | M |
| PH2-BL-03 | Dashboard bundle size: `core` embedded in 3 bundles of 732–768 KB each | WEBR | S |
| B-D31-01 | Scheduler gap floor, still relevant for self-hosters on GitHub cron | CER | S |
| PH2-BL-05 | Landing and marketing copy for the paid hosted tier | WEBF | S |
| PH2-BL-08 | Build the site on Cloudflare Pages from source instead of committing `apps/dashboard/public/`; retires `check:published`. After PH2-E2-02 | WEBF + CEF | M |
| B-D31-02 | Parked checker work — mostly superseded by PH2-E0-04; retire what PH2-E0-04 retires | CEF | S |
| B-D31-03 | Cold read of the docs by someone who has not seen them, before the beta | F | S |

### The balance

| Person | Scheduled (E0–E5) | Backlog | Total |
|---|---|---|---|
| **Fatih** (F 8.5 + CEF 24 + WEBF 6) | 38.5 | 5 | 43.5 |
| **Rakha** (R 2.5 + CER 22 + WEBR 6) | 30.5 | 7 | 37.5 |

**Rebalanced 2026-10-15** after the ownership moves accepted on #299. Before the moves it was Fatih 34.5 and Rakha 32.5 scheduled, recomputed from the tables above.
- PH2-E0-06 moved CER → CEF (S, 1 point).
- PH2-E1-03 grew M → L when it took the mainnet scan path (+1).
- PH2-E1-04 shrank M → S (−1).

**That shifts 2 points each way, not 3.** With S/M/L weights, reaching 37.5 / 29.5 would need another card to change.

Shared cards are split half each. **Equal by weight, not by hours** — Rakha's available hours are his to confirm.

**The concentration risk to know about:** the entire hosted autopilot (PH2-E4-01 to PH2-E4-05) is Rakha's critical path. If he slips, revenue slips. That fits his history, but you should see it before confirming.

---

## 6 · Open conflicts

None. The CLI-fee conflict was resolved by Q21 (a + c).

**Dependency corrections, 2026-10-15.** Three errors in the §5 tables, all in the plan rather than the kickoffs:
- PH2-E2-01 was listed as depending on PH2-E0-02. It depends on nothing, as the CER kickoff already said.
- PH2-E3-06 was listed as depending on PH2-E3-05. The Freighter test depends on nothing; only its final check against the real allowance flow follows PH2-E3-05.
- PH2-E0-02 was listed as a dependency of seven more cards. It blocked none of them, because no gate ever froze `core` — see PH2-E0-02's row in `BACKLOG.md`.

The first two were caught by Rakha on #299.

**Ownership moves, 2026-10-15** (Fatih, after Rakha's comment on #299):
- PH2-E0-06 moves from CER to CEF, because `write-guard.ts` is in `packages/core`. Rakha reviews the PR.
- PH2-E1-04 splits. The mainnet read-only scan path joins PH2-E1-03 (CEF, now L). PH2-E1-04 keeps the mainnet `extend` refusal and `action.yml` (CER, now S).
- One-click "Extend now" gets a daily limit and an email notice (PH2-E3-04, PH2-E4-02).
- CLI `0.2.0` ships without the Support tip (PH2-E1-06).

**Card added, 2026-10-18:** PH2-E3-08 registers the design agent's work (#304) under hard rule 8, at weight M, which moves Fatih's scheduled total to 38.5. The weight is CEF's default; Fatih may change it.
