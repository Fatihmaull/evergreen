# ADR-005: Use JSON-compatible shared domain types

**Status:** Proposed — implemented for review in [PR #36](https://github.com/Fatihmaull/evergreen/pull/36), W1-D6-01/01b/01c
**Date:** 2026-09-07
**Deciders:** Pending human review

## Context

The shared model will cross CLI JSON output, engine history and dashboard boundaries. ADR-004 and the shared-code finding already require unique ledger entries and per-payer signing. W1-D4-13 establishes inclusive TTL boundaries. This record covers representation choices for those requirements, not a new engine or persistence design.

## Options considered

- SDK/XDR objects and `bigint` throughout: convenient inside a transaction builder, but consumers need SDK knowledge and custom JSON serialization.
- Plain objects with numeric money: straightforward JSON, but large stroop integers can silently lose precision.
- Plain objects with integer money as decimal strings: ordinary JSON at boundaries, exact conversion to/from `BigInt` for arithmetic, no runtime SDK dependency in shared-types.

## Decision proposed

Use plain readonly objects. `ScanResult.entries` is keyed by canonical base64 XDR ledger key, with consumer contract IDs on the entry. Fee/rent values use integer decimal text in stroops. The SDK stays in adapters; signing accepts/returns serialized transaction envelopes.

Use explicit variants for known/unavailable TTL and simulated/submitted/succeeded/failed bump outcomes. The final live ledger and archival/deletion behavior remain separate. Each TTL observation records its own RPC ledger. A successful bump requires both transaction confirmation and a verified after observation; an uncertain result remains submitted until reconciled.

Configuration refers to payers, environment variable names and policy-adapter configuration references. It never contains secret values. A shared entry with multiple payer candidates must not imply a first-payer-wins rule; resolution belongs to the later decision/engine implementation.

## Consequences

The same records can survive JSON round-trips without losing large integer fees. Consumers must convert monetary text for arithmetic and validate canonical non-negative values at input. IDs are documented string aliases, not runtime validators. Producers still enforce canonical keys, uniqueness, reference integrity, safe ledger integers and arithmetic consistency.

The signer interface is not a security boundary or a validation of the Stage 2 SDK. Real adapters must verify Testnet, payer, operations and fee policy; the Week 3 spike can amend that seam if integration evidence requires it. Submitted/succeeded records require the resolved signer identity; simulation/failure records may omit it when the signer has not resolved, so a missing signer can be reported without inventing an account. Dry-run defaults are a runtime-loader responsibility, documented now and explicit in the config example.

## Update log

- 2026-09-07: proposed and implemented locally for Issue #29 review. No publication, real signing, transaction submission or notification delivery is part of this change.
- 2026-09-07 final review: simulation/failure records can omit an unresolved signer identity; submitted/succeeded records still require it. Regression examples reject the previous shape and pass with the correction.
- 2026-09-07 publication: PR #36 links the implementation and review correction to Issue #29. Proposal remains pending human review.
