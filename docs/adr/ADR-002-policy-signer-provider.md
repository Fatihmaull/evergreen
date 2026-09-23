# ADR-002: Use `stellar/passkey-kit` for the non-custodial policy signer

**Status:** Accepted — amended 2026-09-04 (see Update log). Retained, but moved off the critical path; validation by the Week 3 spike, **now `W3-D19` (was D15/D16)**

> **Task IDs in the Context/Options/Consequences sections below are pre-rescope and no longer resolve to the work they name.** The 2026-09-04 amendment restructured Week 3 into two stages and the day contents moved; the IDs themselves were reused. Current mapping: the spike is **`W3-D19-01/02`**, its fund-rejection check is **`W3-D19-02`**, the end-to-end headless submit is **`W3-D19-03`**, the go/no-go is **`W3-D20-01`**, and the setup guide is **`W3-D20-03`**. The body is left as written because an ADR records the reasoning we had at the time — see the update log for what changed.
**Date:** 2026-09-04
**Deciders:** Fatih, Rakha

## Context

The engine needs to sign `extendTTL` transactions automatically while remaining non-custodial: the signer must be *incapable* of moving funds, not merely trusted not to. Soroban supports this through smart wallets (contract accounts) that enforce authorization in `__check_auth`, with signers scoped by policies.

Constraint: this is one sub-component of a three-deliverable, 30-day, $4,800 engagement. Time spent here is time not spent on the CLI, dashboard, and docs.

## Options considered

**A. `stellar/passkey-kit` (smart-account-kit).** TypeScript SDK for Soroban smart wallets. Supports Ed25519 signers and policy signers alongside WebAuthn passkeys, ships pre-deployed testnet factory/wallet/policy contracts. Originated with kalepail, now under the official `stellar` GitHub org. **Est. 15–25h ≈ $450–750.** Risk: less audited than OZ; its demos center on browser passkey flows, so the headless path is unproven for us.

**B. OpenZeppelin Stellar Contracts (smart accounts).** Audited Rust framework separating signers, scope rules, and policies. Ships multisig and spending-limit policies; no single-function-allowlist policy, so we'd author a custom policy against their trait. **Est. 25–40h ≈ $750–1,200.** Lower security risk, higher time cost, requires Rust work in the tightest week.

**C. Custom `__check_auth` contract from scratch.** Full control, no dependency on third-party contract addresses. **Est. 40–60h ≈ $1,200–1,800** — a quarter to a third of the entire grant budget on one sub-component, plus an unaudited authorization contract, which is precisely the artifact attackers look for.

**Infra add-on (orthogonal): Launchtube.** SDF-run relayer handling fee sponsorship and nonces for Soroban ops. Would let the bot submit without a funded G-address. Explicitly experimental with no stability guarantees — optional, ~4–8h, only if it removes real friction.

## Decision

Option A. Use `passkey-kit` with an **Ed25519 signer** (not the passkey/WebAuthn signer type — our bot is headless, there is no human to touch a security key) scoped by a policy to `extendTTL` only.

Option C is explicitly out of scope for this grant. If both A and B prove insufficient, a custom signer contract becomes a follow-on Instaward (SOW 2) candidate rather than something improvised under this budget.

## Consequences

**Easier:** no account contract of our own to design, deploy, and defend; pre-deployed testnet contracts remove setup from Week 3, the tightest week; SDK is TypeScript, matching the rest of the stack.

**Harder:** we inherit a dependency whose headless policy-signer path we have not verified. Mitigated by a timeboxed spike on W3-D15/D16 with a hard go/no-go — not an open-ended investigation.

**Fallback trigger:** if a headless, policy-scoped `extendTTL` isn't working end-to-end by the end of W3-D16, switch to Option B *immediately* and cut both P1 items (PRD §7) to buy back the time. Do not spend Day 17+ debugging Option A.

**Security invariant, regardless of provider:** the signer's capability set is exactly `{extendTTL}`. Verifying that a fund-moving call is *rejected* is part of the spike's definition of done (W3-D15-02) — a signer that works but can also move funds is a failed spike, not a partial success.

## Update log

- 2026-09-04: created, following the build-vs-buy research pass.
- **2026-09-04 (amendment — the premise changed, the decision did not):**

  **What we found.** `extendTTL` is *permissionless*. Stellar's state-archival documentation states it directly: "There is no access control for TTL extension operations. Any user may invoke `ExtendFootprintTTLOp` on any `LedgerEntry`." Anyone may extend anyone's TTL provided they pay the resource fee.

  **What that invalidates.** The Context section above says the signer "must be *incapable* of moving funds, not merely trusted not to," framed as what makes the engine non-custodial. That framing was wrong. Evergreen is non-custodial because it needs no authority over a user's contract at all — there is no permission to grant, so there is none to abuse. The policy signer is not what earns that property.

  **What the policy signer is actually for.** In v1 users self-host the engine and fund a bot account they own (ADR-004). That hot key sits on *the user's* server with *the user's* lumens on it. Capping its capability limits *their* blast radius if it leaks. That is a real reason for a self-hoster to adopt it, and it is how `docs/POLICY-SIGNER.md` should present it — not as a compliance artifact.

  **Consequence for the plan — Week 3 splits in two:**
  - *Stage 1 (critical path):* prove the core loop with a plain funded Ed25519 account. No policy signer. This lands the unattended-bump proof (`W3-D18-02a`/`b`) around Sep 17–20 rather than Sep 22.
  - *Stage 2 (off the critical path):* add the capped policy signer per this ADR, plus the setup guide. If the spike fails, we ship the core proof anyway and document policy scoping as partial, with full scoping deferred to SOW 2.

  The fallback arithmetic in the Consequences section no longer has to close: Option B was never survivable as a mid-Week-3 pivot (25–40h of Rust starting Sep 19 against a Sep 22 proof), and it no longer needs to be, because nothing on the critical path depends on it. Rakha's Rust is solid, so Option B remains genuinely available for Stage 2 — it is simply no longer load-bearing.

  **Consequence for the published package.** The README quickstart teaches the plain funded account; the policy signer is the documented hardened path. DX wins technical decisions (PRD §2), and the SOW's evidence requirement is met by the hardened path being documented and demonstrated, not by it being mandatory.

  **Consequence for SOW 2.** Stage 2's machinery — an account the user owns, from which a scoped signer may draw only to pay `extendTTL` fees — is the foundation of a hosted engine that stays non-custodial. See ADR-004.

  **Scope note.** The SOW names the capped policy signer in both the Deliverable 2 description and its required evidence, so this is a resequencing, not a drop. Fatih owns raising it with the Ambassador Chapter Lead in Week 1 rather than at review.
- **2026-09-22 — `W3-D20-01` DECIDED: no-go on Stage 2. Policy scoping ships partial; full scoping deferred to SOW 2.** Decided by Fatih on Rakha's proposal in [#183](https://github.com/Fatihmaull/evergreen/issues/183) / [#191](https://github.com/Fatihmaull/evergreen/pull/191). **Amended here, not rewritten** — the no-go reasoning is worth more to a later reader than a clean ADR.

  **The finding, and it is a property of the mechanism rather than of the library:** contract-invocation authorization does not constrain the *native TTL payer's transaction signature*. A smart account can police what a contract call may do; it does not police the ordinary Stellar transaction that pays for `extendTTL`. So the engine still holds an unrestricted key, which is precisely the blast radius Option A existed to cap. Recorded in `docs/W3-POLICY-SIGNER-FEASIBILITY.md`.

  **Why Option B was not taken instead.** A different contract-auth framework inherits the same gap — it adds no enforcement hook to the native payer path. Option B remains genuinely available for SOW 2, but swapping frameworks would have been motion, not a solution, and neither option has a row scheduled to produce the enforcement evidence either would need.

  **What ships instead.** The verified Stage 1 path: a plain funded Ed25519 account the self-hoster owns and funds (ADR-004), with `docs/POLICY-SIGNER.md` describing what exists today, its hot-key limits, and what a future hardened path requires. This is the exit this ADR pre-authorised — *"if the spike fails, we ship the core proof anyway and document policy scoping as partial"* — so taking it follows the plan rather than abandoning it.

  🔴 **The cost, recorded rather than discovered at review.** SOW §4.1 names the capped policy signer in **Deliverable 2's own description**, not only in its evidence list, so D2 is expected to grade **Partial** rather than Present under §6.2. That was true under every option; the others simply arrived at it later and with a thinner guide. The §6.1 evidence item — *"policy-signer configuration guide"* — is satisfied honestly either way, which is the difference between a **Missing** row and a **Partial** one.

  **Task dispositions:** `W3-D19-01/02/03` recorded as no-go with the reason, out of Blocked. `W3-D20-02` **does not exist** under a no-go and is dropped rather than started — this decision deleted work. `W3-D20-03` becomes the truthful guide.

  ⚠️ **Still open, and it is a human action:** the Scope note above assigns Fatih the conversation with the Ambassador Chapter Lead, *"in Week 1 rather than at review."* It is Week 4 and it has not happened. It pairs with the Oct 2 deadline confirmation `docs/PRD.md` has wanted since 2026-09-04.

- *(`W3-D20-01`: record spike outcome — go with A, or fall back to B, and why. Was filed here as W3-D16-03 pre-rescope. **Closed by the entry above.**)*
