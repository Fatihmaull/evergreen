# `@evergreen/engine`

The scheduled auto-bump worker. **Built in Week 3.**

A scheduled job, not a daemon ([ADR-001](../../docs/adr/ADR-001-scheduled-serverless-engine.md)). One run = load config → scan → decide → submit → record → notify.

## You self-host it, and you fund it

The engine pays extend fees from an account **you own and fund**. Evergreen never pays another party's rent ([ADR-004](../../docs/adr/ADR-004-payment-model.md), CLAUDE.md hard rule 5).

It never holds a key of yours beyond that, and never needs one — `extendTTL` is permissionless, so there is no authority over your contract to grant.

## Two signer stages

- **Stage 1 (default, what the quickstart teaches):** a plain funded Ed25519 account holding only enough XLM to pay extend fees.
- **Stage 2 (hardened path, unavailable in v1):** the proposed direct smart-account adapter does not constrain the native TTL fee-payer signature. The accepted disposition is no-go/partial with full scoping deferred to SOW 2; do not treat the config/type seam as an implemented signer. See [signer status and limits](../../docs/POLICY-SIGNER.md).

## Non-obvious requirements

- **Dry-run is the default.** Live submission is explicit.
- **Runs can overlap.** Bumps are idempotent; an in-flight transaction must survive a second scheduled run starting. This needs a real lock, not a flat file — see [ADR-003](../../docs/adr/ADR-003-toolchain-hosting-persistence.md).
- **A missed scheduler run alerts.** It must never fail silently.
