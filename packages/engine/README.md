# `@evergreen/engine`

The scheduled auto-bump worker. **Built in Week 3.**

For the shipped Testnet entry points and a safe first dry run against your own
contract, follow the [self-host guide](../../docs/ENGINE-SETUP.md). The
repository's scheduled workflow is **decide-only**; it does not submit.

Designed as a scheduled job, not a daemon
([ADR-001](../../docs/adr/ADR-001-scheduled-serverless-engine.md)). The
load → scan → decide path runs on the repository cron. Submission and alerts
are separate explicit local operator paths today; the cron does not invoke
them.

## You self-host it, and you fund it

The engine pays extend fees from an account **you own and fund**. Evergreen never pays another party's rent ([ADR-004](../../docs/adr/ADR-004-payment-model.md), CLAUDE.md hard rule 5).

It never holds a key of yours beyond that, and never needs one — `extendTTL` is permissionless, so there is no authority over your contract to grant.

## Two signer stages

- **Stage 1 (default, what the quickstart teaches):** a plain funded Ed25519 account holding only enough XLM to pay extend fees.
- **Stage 2 (hardened path, unavailable in v1):** the proposed direct smart-account adapter does not constrain the native TTL fee-payer signature. The accepted disposition is no-go/partial with full scoping deferred to SOW 2; do not treat the config/type seam as an implemented signer. See [signer status and limits](../../docs/POLICY-SIGNER.md).

## Non-obvious requirements

- **Dry-run is the default.** Live submission is explicit.
- **Live runs need reconciliation.** The local attempt journal prevents casual reuse but is not cross-run scheduler recovery. An uncertain in-flight transaction must be reconciled before another live attempt — see [ADR-003](../../docs/adr/ADR-003-toolchain-hosting-persistence.md).
- **A missed scheduler run must be watched.** The independent watcher in the
  [Stage 1 runbook](../../docs/W3-D17-05-RUNBOOK.md) is a separate deployment,
  not an automatic property of the repository cron.
