# ADR-006: Separate incomplete scan information from observed low TTL

**Status:** Proposed — Rakha approved this implementation on 2026-09-09; shared review with Fatih remains pending before merge.
**Date:** 2026-09-09
**Deciders:** Fatih, Rakha

## Context

Fatih's [review in Issue #44](https://github.com/Fatihmaull/evergreen/issues/44#issuecomment-5589189730) found that D8-03 commit `0ad2880` returned the same exit 1 for low TTL and for zero supplied data keys, even if a contract genuinely has no data outside its instance. Such a contract could never report healthy through the new coverage path. Legacy results without coverage could still return 0. The tests documented those mechanics without resolving their ambiguity.

The CLI reads known keys; it cannot verify that a caller enumerated all contract storage. A health gate must communicate uncertainty and must not be interpreted as an instruction to spend funds. No engine run loop exists yet. The CLI feature gate is Sep 16; npm publication remains W4 per BACKLOG, not Sep 16.

## Options considered

- Keep exit 1 for any non-error unhealthy/unknown result: smallest interface, but clients cannot distinguish observed low TTL from missing information without reading JSON, and the zero-data case remains unresolved.
- Add exit 3 only: separates uncertainty but still cannot distinguish unknown keys from genuinely no extra data keys.
- Add only an explicit empty-data assertion: permits genuinely instance/code-only contracts to pass, but still conflates other incomplete observations with low TTL.
- Add exit 3 plus `--no-data-keys`: two small interface additions that separate both cases. Consumers must migrate from the old helper semantics.

## Decision

Implement the final option for review. The health gate has precedence **2 > 3 > 1 > 0**:

| Exit | Meaning |
|---|---|
| 2 | Invalid input/response, connection/network refusal or RPC failure |
| 3 | Coverage unspecified/unknown, unavailable TTL, missing/unsupported entries, or no observations |
| 1 | Observations and declared scope are available, with at least one TTL below threshold |
| 0 | All observed keys within the declared scope have known TTL at or above threshold, without issues |

`--no-data-keys` is mutually exclusive with `--keys-file`. Core accepts the same assertion through its fourth options argument and rejects a contradictory nonempty key list before reading RPC. The result records the assertion as optional `coverage.noDataKeysDeclaredByContract[id]: true`, with supplied count zero. It is a caller declaration, not independently verified emptiness. An empty keys file or omitted key information alone does not assert emptiness.

JSON retains every successful observation and issue. For low TTL plus missing information, exit 3 wins but the low TTL remains visible. A missing payload/transport error wins as 2. Neither result can silently pass CI. The same precedence applies to programmatic legacy results: omitted coverage is unknown (3), not implicitly complete.

## Consequences

Healthy instance/code-only contracts can pass when the caller explicitly declares that scope. Known-key scans still cannot prove whole-contract health. The caller can make an incorrect assertion; the UI and JSON expose its provenance rather than presenting it as measured completeness.

Exit status summarizes health; **it never authorizes or requests a transaction**. The future engine must examine structured observations, issues, policy, payer, budgets and execution mode. Zero available information must never trigger a speculative extension. This proposal changes no signer, transaction, threshold arithmetic or temporary-entry auto-bump policy.

CLI callers relying on legacy results without coverage returning 0 must migrate. Tests cover all four codes, mixed-result precedence, unknown/declared-empty scope and conflicting options. If shared review requests a different public interface, amend this ADR and its tests/docs before merging/publishing; do not silently restore an ambiguous code meaning.

## Downstream sweep

- `W2-D8-03`: implementation, CLI help, shared coverage metadata, tests and guides updated here; existing Issue #44 tracks review.
- `W2-D10-01/02/03`: Fatih still owns final UX, exit-code and error handling work. This proposal supplies the coverage distinction; it does not complete those tasks. Mixed findings remain in JSON for severity presentation.
- `W2-D10-04`: nonzero liveness requirement remains satisfied for low TTL combined with missing information (3) or error (2). No change to the Sep 18 deadline.
- `W2-D13-01`: future config loading must preserve a caller's coverage declaration explicitly; no config schema/loader is introduced here.
- `W3-D15-01/02/02b`: engine decisions use structured observations and explicit policy; temporary-entry auto-bump policy stays pending. No execution path consumes CLI exit 1 as payment permission.
- `W4-D25-01/02`: the future Action can gate on any nonzero code and distinguish 1/2/3 in reporting; no Action implementation added.
- `W4-D27-02`: npm publication must include the agreed exit/help/JSON contract; its W4 timing is unchanged.

## Update log

- 2026-09-09: recorded the reviewed branch finding and Rakha-approved local implementation proposal; Fatih acceptance and publication remain pending.
