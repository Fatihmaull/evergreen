# ADR-004: Who pays for extends

**Status:** Accepted
**Date:** 2026-09-04
**Deciders:** Fatih, Rakha

## Context

`extendTTL` is permissionless (see `docs/SOROBAN-PRIMER.md`): anyone may extend any ledger entry's TTL provided they pay the resource fee. That removes the authorization question entirely — Evergreen never needs permission over a user's contract — and replaces it with a narrower, sharper one: **whose lumens pay?**

This is not a detail. It determines the data model, it decides whether we stay clear of the SOW's hosted-billing non-goal, and it is easy to muddle, because three different mechanisms can all look like "Evergreen extends your contract" from the outside.

It also becomes load-bearing the moment anyone asks the obvious follow-on question: if anyone can bump anyone's contract, why not run one engine that protects everybody?

## Options considered

**A. The user always pays their own fees.** Evergreen supplies automation, not money. Costs nothing to run, scales without bound, and cannot be abused into an expense. Requires each user to fund something.

**B. Apex funds a shared pool that pays strangers' extends.** Excellent DX — zero setup for the user — and unbounded cost. Every contract anyone registers is a standing claim on our balance, with no natural ceiling and every incentive to over-register. It is also the SOW's "hosted billing / rent-as-a-service" non-goal arriving in disguise.

**C. Hybrid — subsidise a free tier, charge beyond it.** Inherits B's cost exposure plus a billing relationship, which is squarely the non-goal. Out of scope for a 30-day grant regardless of merit.

## Decision

**Option A. The user always pays their own extend fees. Apex never subsidises anyone's rent.**

That single invariant resolves into three mechanisms. All three preserve it; conflating them is how this gets built wrong:

| Mechanism | Who pays | How it's authorized | Status |
|---|---|---|---|
| **Dashboard manual extend** | the user | wallet-connect; the user signs that specific payment | P1 |
| **Engine automated bump (v1)** | the user | the user self-hosts the engine and funds a bot account **they own and control** — still their money, prepaid into their own account rather than signed per transaction | P0 |
| **Hosted engine** | the user | the user funds an account they own, from which the engine may draw **only** to pay `extendTTL` fees — capped, scoped, revocable | SOW 2 — not built |

**Never built, in any phase: Apex paying another party's extend fees.**

## Consequences

**On the data model** — cheap now, expensive later:

- `BumpRecord` carries the **payer as a field distinct from the contract**. Never assume the payer is the contract owner; never assume a single global bot identity.
- `EvergreenConfig` expresses **N contracts watched by M payers**. The bot account is not a process-wide singleton.
- The `Signer` interface resolves **per payer**, not as a global constant.
- Nothing in the persistence layer may assume single-tenant (see ADR-003).

v1 implements none of this as a feature. It must simply not foreclose it. **If a v1 shortcut would close the door, flag it rather than take it.**

**On language** — wallet-connect authorizes a *payment*, never *access*. Nothing in Evergreen ever needs permission over a user's contract. Any doc, UI string, or type name implying otherwise is a bug to fix on sight.

**On the dashboard** — the public instance we deploy is a demonstration instance, not a service. Its scan feature works for any contract (scanning is a permissionless read, so this is nearly free and makes the instance genuinely useful to strangers). Its bump history covers only contracts this instance monitors; anything else reads "not monitored by this instance." Scope guard: read-only scan of arbitrary contracts is P0, and there is to be **no registration, no accounts, no storing strangers' contract IDs, and no write path for contracts we do not monitor.** If it starts growing toward a service, stop and flag it.

## The hosted question, recorded as open

One public engine protecting every registered contract is the eventual direction and a strong SOW 2 headline. It is **not built in these 30 days**. When it is built, the custody question must be answered first, and it is genuinely open:

- **Preferred: non-custodial delegation.** The user funds an account they own; the engine holds a scoped signer permitted only to pay `extendTTL` fees — capped and revocable. This preserves the property that makes Evergreen worth trusting, and it is precisely the machinery Stage 2's policy signer (ADR-002) builds. Stage 2 is therefore not only an SOW obligation and a hardening path for self-hosters; it is the foundation of the hosted model.
- **Fallback we would rather avoid: custodial prepay.** The user tops up a balance Apex holds and draws down. Simpler to build, and it means Apex holds user funds — a materially different trust and regulatory posture, and plausibly the exact thing the hosted-billing non-goal was drawn around.

**This ADR records a direction, not a design.** Do not treat the hosted model as settled; whichever path SOW 2 takes needs its own ADR and its own thinking about custody before a line of it is written.

## Update log

- 2026-09-04: created, following the permissionless-`extendTTL` finding and the Phase 0 alignment pass.
