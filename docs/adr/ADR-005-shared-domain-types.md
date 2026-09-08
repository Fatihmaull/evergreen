# ADR-005: Use JSON-compatible shared domain types

**Status:** **Accepted 2026-09-08** by Fatih — implemented in [PR #36](https://github.com/Fatihmaull/evergreen/pull/36), W1-D6-01/01b/01c
**Date:** 2026-09-07
**Deciders:** Fatih (accepted), Rakha (proposed)

## Context

The shared model will cross CLI JSON output, engine history and dashboard boundaries. ADR-004 and the shared-code finding already require unique ledger entries and per-payer signing. W1-D4-13 establishes inclusive TTL boundaries. This record covers representation choices for those requirements, not a new engine or persistence design.

## Options considered

- SDK/XDR objects and `bigint` throughout: convenient inside a transaction builder, but consumers need SDK knowledge and custom JSON serialization.
- Plain objects with numeric money: straightforward JSON, but large stroop integers can silently lose precision.
- Plain objects with integer money as decimal strings: ordinary JSON at boundaries, exact conversion to/from `BigInt` for arithmetic, no runtime SDK dependency in shared-types.

## Decision

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

## Downstream sweep

Required before an ADR is finished (`docs/adr/README.md`). **This decision changed no dependency** — it formalises the representation choices already implemented and merged in PR #36, and every consumer was written against those types from the start. No task in `BACKLOG.md` assumes a different shape.

Stating that explicitly rather than leaving the section blank, because an unconsidered sweep and an empty one look identical.

## Update log

- 2026-09-07: proposed alongside the shared-types implementation.
- **2026-09-08: ACCEPTED.** Three things carried the decision, recorded so a future reader knows what was actually being endorsed rather than re-deriving it:

  **Money as integer decimal text.** Stroop values above `Number.MAX_SAFE_INTEGER` round silently as JSON numbers — a rent estimate that is quietly wrong is worse than one that fails, because nothing surfaces it. Decimal text round-trips exactly and converts to `BigInt` for arithmetic. The cost is that consumers must convert before doing maths, which is the right trade: an explicit conversion is visible, a silent rounding is not.

  **Explicit variants over sentinel values.** `known` / `unavailable` for TTL and `simulated` / `submitted` / `succeeded` / `failed` for outcomes, rather than nulls or magic numbers. This is what makes "an entry with no TTL" structurally distinct from "an entry expiring now" — the two collapse into `0` under any nullable-number model, and that collapse is exactly the class of bug this project keeps finding.

  **The signer seam is explicitly *not* a security boundary.** Recorded plainly in Consequences. A seam described as security that is not enforced as security is worse than no seam, because it invites trust it cannot carry. Real adapters must verify testnet, payer, operations and fee policy themselves, and the Week 3 spike may amend the seam if integration evidence requires it.

  Also endorsed: a shared entry with multiple payer candidates must **not** imply first-payer-wins. Leaving resolution to the engine is correct — a default buried in a type would be invisible at the point it mattered.
