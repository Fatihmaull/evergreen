# ADR-008: Authenticate with passwordless email, link wallets with a signed challenge, and keep sessions server-side

**Status:** Accepted. Fatih decided it on 2026-10-14 in [`phase-2/PHASE2-PLAN.md`](../../phase-2/PHASE2-PLAN.md) v4 (Q20 and §3.1). Written down 2026-10-15 by `PH2-E0-05`. Built by `PH2-E2-04`.
**Date:** 2026-10-15
**Deciders:** Fatih. Rakha reviews, since the session and wallet tables land in his schema (`PH2-E2-03`).

## Context

This is **the first account system in the project.** Until now, Evergreen had no accounts on purpose. ADR-004's dashboard scope guard said *"no registration, no accounts, no storing strangers' contract IDs."*

Phase 2 reverses that for one reason: a personal watchlist, alerts and a hosted autopilot all need to know who a user is (Q4, Q14). The #297 spike also settled what a login must *not* be: the thing that authorises money. Funds move only on the user's own on-chain `approve` ([ADR-007](ADR-007-allowance-funded-hosted-engine.md)).

## Options considered

**A. Email + password.**
- Familiar.
- We would store password hashes, own a breach surface, and build reset flows. That is all cost and no product.

**B. Passwordless email only** (one-time code or magic link).
- Nothing secret is stored long-term, so nothing can leak.
- No link to a wallet, so nothing on the dashboard can reach the user's allowance.

**C. Wallet only** (sign-in by signed challenge).
- No email held.
- No recovery and no alerts channel. Losing the wallet loses the account and its watchlist, and alerts need an address anyway.

**D. Email for the account, wallet linked by signed challenge** (Q20).
- Each identity does the one thing it is good at: email for identity, recovery and notifications; the wallet for authority over money.
- Two flows to build.

**E. Third-party OAuth** (GitHub, Google).
- Fast to build.
- Adds a provider dependency and a consent screen. It still needs a separate wallet link, so it is D plus a vendor.

## Decision

**Option D.** Two identities, two powers.

**Email is the account.**
- Passwordless: a one-time code or magic link with a 10–15 minute expiry, single use, **stored hashed**.
- Send rate limited per address and per IP.
- Delivery reuses the engine's existing Resend channel (`packages/engine/src/email-channel.ts`).
- No passwords are stored, so none can leak.

**The wallet is authority over money.**
- Linking a wallet to an account **always** requires a signed challenge: the server issues it, the wallet signs it, the server verifies it. This is the SEP-10 (Stellar Web Authentication) pattern.
- One account may link several wallets.
- **Nothing that moves XLM is ever authorised by an email session.** On chain it cannot be anyway, because the allowance is the user's own signature (ADR-007).

**Sessions are server-side.**
- Session rows in Neon, referenced by an `httpOnly; Secure; SameSite=Lax` cookie.
- Short-lived and rotated.
- CSRF protection on every state-changing route.
- Logout invalidates the row server-side, rather than trusting the browser to forget.

**Recovery.** Email recovers the account, **never funds.** Funds were never ours to recover, which is the point of ADR-007.

**Anonymous scan stays.** Scanning any contract needs no login, as it does today. `docs/READY.md` item 2 makes "check any contract's TTL" with *"No wallet, no signup, no account"* part of the product's definition of done. Accounts add a watchlist; they do not gate the read.

## Consequences

**Resolved: the pinned SDK ships the SEP-10 helpers.** The plan left this "to verify". Checked 2026-10-15: `@stellar/stellar-sdk` **17.0.1**, the version `packages/core` and `packages/cli` pin, exports `WebAuth` with:
- `buildChallengeTx`
- `readChallengeTx`
- `verifyChallengeTxSigners`
- `verifyChallengeTxThreshold`
- `verifyTxSignedBy`
- `gatherTxSigners`
- `InvalidChallengeError`

The server does not need to hand-roll challenge construction.

🔴 **That brings a new key: the server's challenge-signing key.** A SEP-10 challenge is a transaction signed by the server, so the server holds a signing keypair. It must be:
- **distinct from the engine key and the treasury key** (Q17);
- **unfunded**, because it signs challenges and nothing else;
- passed by naming an environment variable, never in argv, per phase-2 standing rule 6.

A leak of it lets someone forge challenges, but grants no access to funds. Whether it lives as a Workers secret depends on the backend's location, which `PH2-E2-02` decides (`undetermined`).

**We will hold personal data for the first time:** email addresses, and wallet-to-email links. A wallet address is public, but linking it to an email is not.
- The schema keeps both behind the session boundary, and no public route returns them.
- **What this needs in a privacy statement is `undetermined`.** It is not decided here, and the custody statement `PH2-E4-06` is not the same document.

**Departure from ADR-004's dashboard scope guard, named.** *"No registration, no accounts, no storing strangers' contract IDs"* no longer holds. Phase 2 stores accounts and their watchlists by decision (Q14, Q20). The guard's purpose — not drifting into a service by accident — is answered by deciding to build one (Q3, Q4), not by pretending the guard still applies.

**Rate limits are a requirement, not a polish item.** Passwordless login makes email sending an unauthenticated action. Without per-address and per-IP limits, the login form is a free mail relay.

## Downstream sweep

| Where | Says | Disposition |
|---|---|---|
| ADR-004, *On the dashboard* | no registration, no accounts | **Superseded** for phase 2 by this ADR and ADR-007. Left as written, because ADR-004 is now marked superseded. |
| `docs/READY.md:16` | check any contract's TTL: *"No wallet, no signup, no account"* | **Stands.** Anonymous scan is kept, above. |
| `apps/dashboard/README.md:12` | wallet-connect was cut on 2026-09-10 | **True of SOW 1.** Wallet linking returns as `PH2-E3-01`. The dashboard README is the web track's (WEBF) to update when it ships. |
| `PH2-E2-03`, `PH2-E2-04`, `PH2-E3-01` | users, sessions and wallets tables; auth; login UI | **Consistent.** They build this. |

## Update log

- 2026-10-15: created by `PH2-E0-05`, recording Q20 and plan §3.1. Resolved the plan's SEP-10 "to verify" against the pinned SDK, and named the challenge-signing key the plan did not mention.
- 2026-10-22 (`PH2-E2-02`, Fatih): **account deletion is a soft delete, and the same email reactivates the old account.** One email can never have two accounts. **Reactivation by email keeps the old autopilot and allowance use off** until the user re-signs with their wallet (the SEP-10-style challenge) and turns autopilot on again, because an email session never authorises XLM movement. Public copy and the custody statement (`PH2-E4-06`) say accounts are "deactivated and can be reactivated by email", never "deleted". Details in [`docs/API.md`](../API.md) §10.
