# `@evergreen/dashboard`

Public site on **Cloudflare Pages**, per [ADR-003](../../docs/adr/ADR-003-toolchain-hosting-persistence.md) (`W1-D5-02`). Live at [evergreen-stellar.pages.dev/dashboard/](https://evergreen-stellar.pages.dev/dashboard/).

## What it is

**Scanning needs no wallet, no signup and no account** (ADR-008: anonymous scan stays). Sign-in and wallet linking are being built (`PH2-E3-01`).

- **Scan any contract.** Scanning is a permissionless read, so anyone can paste any contract ID and get TTL health.
- **Bump history** for contracts this instance monitors. Anything else reads _"not monitored by this instance"_ — which must not read as _"this contract is unprotected."_

Wallet-connect and "extend now" were cut on 2026-09-10 (`W4-D24-04`, cut order #3). They are not a control on this site, and there is no disabled button standing in for them. A signature, where the CLI asks for one, authorizes a payment, never access ([ADR-004](../../docs/adr/ADR-004-payment-model.md)).

## Constraints

- **No automated write path.** The dashboard never bumps anything. That is the engine's job. An email session never authorises moving XLM (ADR-008).
- **No dead buttons.** The site ships without disabled controls or auth-gated empty regions.
- **The deployed instance is a demonstration, not a service.** No registration, no accounts, no storing strangers' contract IDs. If it starts growing toward a service, stop and flag it.
