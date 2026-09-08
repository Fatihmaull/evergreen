# Architecture Decision Records

One file per non-trivial decision. Numbered, immutable in spirit: if a decision changes, **amend** the ADR with an update section rather than rewriting history — the reasoning we had at the time is the valuable part.

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](ADR-001-scheduled-serverless-engine.md) | Auto-bump engine runs as a scheduled serverless job, not an always-on service | Accepted |
| [ADR-002](ADR-002-policy-signer-provider.md) | Policy signer via `stellar/passkey-kit`; OpenZeppelin as fallback; custom contract out of scope | Accepted — amended 2026-09-04, moved off the critical path; pending W3 spike validation |
| [ADR-003](ADR-003-toolchain-hosting-persistence.md) | Toolchain, hosting, scheduler, and persistence | Actions + Node 24 and Pages selected; Neon/PostgreSQL adoption deferred to W4 after Sep 20; spike retained as unused experiment |
| [ADR-004](ADR-004-payment-model.md) | The user always pays their own extend fees; Apex never subsidises rent | Accepted |
| [ADR-005](ADR-005-shared-domain-types.md) | JSON-compatible shared domain types: ledger-key-keyed results, money as integer decimal text, explicit variants | **Accepted 2026-09-08** |
| [ADR-005](ADR-005-shared-domain-types.md) | JSON-compatible shared domain types | Proposed — W1-D6-01/01b/01c local implementation for review |

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

## Downstream sweep
Every task in `BACKLOG.md` whose description assumes what this decision changed. Reworded, or a
line saying why each still stands. *(Delete this section only if the decision changed no
dependency — and say so explicitly rather than leaving it blank.)*

## Update log
- YYYY-MM-DD: what changed and why.
```

## An ADR is not done until the downstream sweep is written

**Every decision that changes a dependency leaves orphans downstream.** The decision gets made
carefully, gets its ADR, gets recorded in both channels — and two tasks three weeks out quietly
keep assuming the thing that just changed. Nothing fails. They simply describe a world that no
longer exists, and that surfaces only when somebody tries to do them.

So the last step, before an ADR counts as finished:

> **Downstream sweep.** List every task in `BACKLOG.md` whose description assumes what this
> decision changed. Update their wording, or record why each still stands.

This is cheap at the moment of decision, when the changed assumption is fresh, and expensive at
every other moment. *(Learned 2026-09-08: deferring the database to Week 4 left `W3-D16-02` and
`W3-D16-03` describing a store that would not exist on Sep 20 — the day they came due. Neither
was wrong when written.)*
