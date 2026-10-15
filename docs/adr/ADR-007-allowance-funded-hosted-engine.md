# ADR-007: Fund the hosted engine with a capped SEP-41 allowance, and charge a fee only when Evergreen's infrastructure moves XLM

**Status:** Accepted. Fatih decided it on 2026-10-14 in [`phase-2/PHASE2-PLAN.md`](../../phase-2/PHASE2-PLAN.md) v4: Q3, Q8, Q9, Q11, Q17, Q18, Q21, §4.2 and §4.3. Written down 2026-10-15 by `PH2-E0-05`. **Supersedes [ADR-004](ADR-004-payment-model.md)**, whose invariant survives unchanged (see *Decision*).
**Date:** 2026-10-15
**Deciders:** Fatih (decision). Rakha reviews; the engine that executes this is his track.

## Context

ADR-004 settled **who pays**: the user, always, and Apex never subsidises rent. It left the **hosted** question open on purpose:

- *"Preferred: non-custodial delegation"*, via the Stage 2 policy signer;
- *"Fallback we would rather avoid: custodial prepay"*;
- *"whichever path SOW 2 takes needs its own ADR and its own thinking about custody before a line of it is written."*

This is that ADR. Three things changed since ADR-004:

1. **The preferred path died.** ADR-002's 2026-09-22 no-go found that contract-invocation auth cannot constrain the native transaction signature that pays for `extendTTL`. A policy signer cannot cap the engine's key.
2. **A different path was measured and works.** The SEP-41 allowance spike ([#297](https://github.com/Fatihmaull/evergreen/pull/297), [evidence](../evidence/2026-10-14-sac-allowance-spike/README.md)) ran on testnet with native XLM held by G-accounts:
   - `approve` / `transfer_from` work;
   - the cap is enforced (over-cap, expired, revoked and self-extended pulls are all refused);
   - **the spender cannot extend its own spending authority.**
3. **Phase 2 makes the hosted autopilot a paid service** (Q3), aimed at real adoption (Q4). So the fee needs a rule, and the rule needs to be one a user can predict.

**One protocol constraint shapes everything below.** A transaction containing `InvokeHostFunction`, `ExtendFootprintTTL` or `RestoreFootprint` may contain only that one operation (plan §3.3). The fee can never ride inside the extend's transaction.

## Options considered

**A. Custodial prepay** — ADR-004's fallback. The user tops up a balance Evergreen holds.
- Simplest to build.
- Evergreen holds user funds. That is a different trust and regulatory posture, and the exact thing the hosted-billing non-goal was drawn around.

**B. A capped, expiring SEP-41 allowance.** The user signs one `approve(engine, cap, live_until_ledger)` on the native XLM SAC. The engine pulls rent plus fee with `transfer_from` per action.
- Non-custodial in the precise sense that matters: Evergreen never holds a user balance, and can take at most the remaining cap until expiry.
- Measured on testnet, with four limits: re-sign about every 180 days; temporary storage; one allowance per (user, engine) pair, where a new `approve` *overwrites* rather than adds; single-signature flow only when the user is the transaction source.

**C. Policy-signer delegation** — ADR-004's preferred path. **Not available:** ADR-002's no-go, for a protocol reason rather than a library one.

**D. No autopilot; the user signs every extend.** No custody question at all, and no product. The hosted value *is* not having to be there.

## Decision

**Option B.**

### The invariant that survives from ADR-004

**The user always pays their own rent, and Evergreen never subsidises another party's rent.** It is now enforced by mechanism as well as by policy: the engine extends using funds it has just pulled from that user's allowance.

### The fee rule (Q9, Q11, Q21, §4.2)

- **Whenever XLM moves through Evergreen's own infrastructure, Evergreen takes a percentage fee per transaction.** That means the hosted autopilot and dashboard extends.
- **Actions that move no XLM are free.** That includes scan, watchlist and alerts.
- **The CLI and the self-hosted engine stay fee-free and MIT.** Revenue from them is voluntary only: an opt-in "Support Evergreen" tip, which is never on by default and never bundled into another action.
- **The percentage is not set here.** It is set from measured mainnet costs (`PH2-E5-03`).
- **One revenue destination**, with no profit split. All of it funds development.

### The flow for one hosted action (plan §3.3, built by `PH2-E4-02`)

1. **Pre-flight, nothing submitted.**
   - Simulate the extend to get the exact rent.
   - Read `allowance()` and the user's balance.
   - Check the per-contract budget.
   - If any check fails, abort and alert the user.
2. **Pull** `rent + fee` with one `transfer_from`, under an idempotency key. A job is never pulled twice.
3. **Extend** from the engine account, retrying transient failures a bounded number of times.
4. **Reconcile** the rent actually charged against the rent pulled, and record the difference in the fee ledger.
5. **On final failure, refund from the engine pool** (§4.3), never from treasury, under the same key.
6. **Sweep** accumulated fees from the engine account to treasury on a schedule. The treasury key is separate from the engine key (Q17), is held offline by Fatih, and never touches a server.

### Dashboard manual extend (§4.2)

- **Allowance users:** one click and zero wallet prompts. It is an on-demand engine job.
- **Users without an allowance:** a one-signature router contract if `PH2-E4-07` finds one viable. Otherwise the dashboard extend requires an allowance first. **Two-transaction extends are not offered.**

### Scope and timing

Testnet only until the beta exits (`PH2-E5-02`, Q18). Mainnet starts read-only (Q5).

## Consequences

**The exposure, stated exactly** (#297 §6, the basis for the public custody statement `PH2-E4-06`). An attacker holding the engine key gets:
- the engine float;
- **plus, for every user at once, the remaining allowance** until its `live_until_ledger`.

They cannot raise an allowance, extend its expiry (tested), revive an expired one (temporary entries are deleted), or act after a revoke. **The bound is the sum of all outstanding allowances, not any single one.** That is why the float has an upper limit and a sweep (`PH2-E4-03`).

**A fee can never be a toll on the chain.** Extension is permissionless. Anyone can extend any entry with the `stellar` CLI, or with our MIT CLI, and pay no fee. The fee buys the convenience Evergreen runs, and the pricing and custody copy must say so plainly.

**The UI must say that a new approve replaces the cap rather than adding to it.** The protocol overwrites, so a user "topping up" can silently lower their cap. Renewal reminders go out at 30, 7 and 1 days. An expired allowance stops the autopilot **and alerts the user**; it never silently stops protecting a contract.

**ADR-004's data-model constraints stand:**
- payer distinct from contract;
- N contracts × M payers;
- `Signer` resolved per payer.

The payer is now the user's allowance-holding G-account, and the executing account is the engine's.

🔴 **Undetermined, and `PH2-E4-02` must decide it before any money moves: who absorbs a shortfall?** Step 4 records the difference between the rent charged and the rent pulled. The CLI has measured rent varying about 18% between days. If the charged rent **exceeds** what was pulled, the engine account has paid part of a user's rent. **That is a subsidy, which this ADR forbids.** Two ways to close it:
- pull a margin and refund the excess;
- recover the shortfall with a second, idempotent `transfer_from`.

The plan does not choose, and neither does this ADR.

🔴 **Departure from `AGENTS.md`, named rather than absorbed.** Hard rule 4 (`AGENTS.md:135`) reads: *"The bot must never have authority over a user's contract or a user's funds … Any change that gives the bot capability beyond paying fees and submitting `extendTTL` is a security regression requiring explicit human sign-off."*

**An allowance is capped authority over a user's funds.** Q8 is the human sign-off the rule asks for. But the rule's text is unchanged, so `AGENTS.md` and this ADR currently disagree. The phase-2 standing rules say to stop and ask Fatih when they do. **This ADR does not edit `AGENTS.md`.** The amendment is Fatih's decision.

Hard rule 5 (*"Evergreen never pays another party's extend fees"*) is unaffected. The unresolved shortfall above is the one place it could be broken by accident.

## Downstream sweep

Every reference to ADR-004 outside `docs/evidence/` and `docs/archive/`, with its disposition:

| Where | Says | Disposition |
|---|---|---|
| `README.md:29`, `docs/ONBOARDING.md:32`, `docs/PRD.md:40`, `docs/PRD.md:81`, `docs/ARCHITECTURE.md:79`, `packages/engine/README.md:17` | the user always pays their own rent | **Stands.** That is the surviving invariant; the link to ADR-004 still resolves to its reasoning. |
| `docs/SOROBAN-PRIMER.md:81` | a wallet signature authorises a payment, never access | **Stands.** An `approve` is a payment authorisation, capped. |
| `docs/adr/ADR-005-shared-domain-types.md:9`, `BACKLOG.md` `W1-D6-01b` | per-payer signing, payer distinct from contract | **Stands**, and is what this ADR builds on. |
| `docs/PRD.md:41`, `docs/SOROBAN-PRIMER.md:83`, `docs/READY.md:28` | a hosted engine is a future direction, not built in v1 | **True of SOW 1, superseded for phase 2.** PRD and primer get a one-line pointer here. `READY.md` is SOW 1's definition of done and is left as written. |
| `AGENTS.md:139` (hard rule 5), `AGENTS.md:193` (ADR list) | the ADR-004 invariant | Rule 5 **stands**. The ADR list needs ADR-007 and ADR-008 added, which waits on the hard-rule-4 decision above, so `AGENTS.md` changes once. |
| `BACKLOG.md` `W4-D26-04` | "hosted engine per ADR-004" as a SOW 2 candidate | **Stands** as the sprint-era record. Phase 2 is that direction. |
| `phase-2/` cards `PH2-E1-08`, `PH2-E3-04`, `PH2-E3-05`, `PH2-E3-07`, `PH2-E4-01` to `PH2-E4-07`, `PH2-E5-03` | the allowance flow and fee | **Consistent.** They are where this ADR came from. |

## Update log

- 2026-10-15: created by `PH2-E0-05`, recording decisions made in plan v4 on 2026-10-14. Supersedes ADR-004.
