# Architecture Decision Records

One file per non-trivial decision. Numbered, immutable in spirit: if a decision changes, **amend** the ADR with an update section rather than rewriting history — the reasoning we had at the time is the valuable part.

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](ADR-001-scheduled-serverless-engine.md) | Auto-bump engine runs as a scheduled serverless job, not an always-on service | Accepted |
| [ADR-002](ADR-002-policy-signer-provider.md) | Policy signer via `stellar/passkey-kit`; OpenZeppelin as fallback; custom contract out of scope | Accepted — amended 2026-09-04, moved off the critical path; pending W3 spike validation |
| [ADR-003](ADR-003-toolchain-hosting-persistence.md) | Toolchain, hosting, scheduler, and persistence | Toolchain accepted; hosting/scheduler/persistence pending W1-D5-03 |
| [ADR-004](ADR-004-payment-model.md) | The user always pays their own extend fees; Apex never subsidises rent | Accepted |

## When to write one

Write an ADR when a choice is expensive to reverse, when two reasonable people would disagree, or when a future contributor would otherwise ask "why on earth is it like this?" Don't write one for formatting preferences — those go in `docs/CONVENTIONS.md`.

## Template

```markdown
# ADR-00X: <decision in a short imperative phrase>

**Status:** Proposed | Accepted | Superseded by ADR-00Y
**Date:** YYYY-MM-DD
**Deciders:** Fatih, Rakha

## Context
What forced a decision? Constraints (30-day sprint, $4,800 budget, testnet-only scope), what we knew, what we didn't.

## Options considered
Each with real trade-offs — effort, risk, cost, reversibility. An ADR listing one option isn't a decision, it's a note.

## Decision
What we chose, stated plainly.

## Consequences
What this makes easy, what it makes hard, and what we've now committed to. Include the fallback trigger if there is one.

## Update log
- YYYY-MM-DD: what changed and why.
```
