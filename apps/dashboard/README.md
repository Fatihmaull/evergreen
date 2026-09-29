# `@evergreen/dashboard`

Public read-only site on **Cloudflare Pages**, per [ADR-003](../../docs/adr/ADR-003-toolchain-hosting-persistence.md) (`W1-D5-02`). Live at [evergreen-stellar.pages.dev/dashboard/](https://evergreen-stellar.pages.dev/dashboard/).

## What it is

**Read-only.** No wallet, no signup, no accounts, and no write path.

- **Scan any contract.** Scanning is a permissionless read, so anyone can paste any contract ID and get TTL health.
- **Bump history** for contracts this instance monitors. Anything else reads _"not monitored by this instance"_ — which must not read as _"this contract is unprotected."_

Wallet-connect and "extend now" were cut on 2026-09-10 (`W4-D24-04`, cut order #3). They are not a control on this site, and there is no disabled button standing in for them. A signature, where the CLI asks for one, authorizes a payment, never access ([ADR-004](../../docs/adr/ADR-004-payment-model.md)).

## Constraints

- **No automated write path.** The dashboard never bumps anything. That is the engine's job, and this site does not sign or submit.
- **The read-only site is the product.** It ships without dead buttons or auth-gated empty regions.
- **The deployed instance is a demonstration, not a service.** No registration, no accounts, no storing strangers' contract IDs. If it starts growing toward a service, stop and flag it.
