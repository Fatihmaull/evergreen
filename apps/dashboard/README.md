# `@evergreen/dashboard`

**Built in Week 4.** No framework chosen yet — that depends on the hosting decision still open in [ADR-003](../../docs/adr/ADR-003-toolchain-hosting-persistence.md) (`W1-D5-03`).

## Two layers

**P0 — public read-only.** No wallet, no signup, no accounts.

- **Scan any contract.** Scanning is a permissionless read, so anyone can paste any contract ID and get TTL health, projected archive date, and rent estimate.
- **Bump history** for contracts this instance monitors. Anything else reads _"not monitored by this instance"_ — which must not read as _"this contract is unprotected."_

**P1 — wallet connect + "extend now."** The user signs a payment to extend a contract themselves. **Wallet-connect authorizes a payment, never access** — Evergreen needs no authority over anyone's contract. UI copy implying otherwise is a bug ([ADR-004](../../docs/adr/ADR-004-payment-model.md)).

## Constraints

- **No automated write path.** The dashboard never bumps anything on its own. That is the engine's job.
- **The read-only layer is the whole product.** It ships complete on its own — no dead buttons, no auth-gated empty regions — if the write path never lands.
- **The deployed instance is a demonstration, not a service.** No registration, no accounts, no storing strangers' contract IDs. If it starts growing toward a service, stop and flag it.
