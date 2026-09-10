# ADR-006: Separate incomplete scan information from observed low TTL

**Status:** **Accepted 2026-09-10 as amended** by Fatih. The scheme merged in #60 before acceptance was given and ran as originally written for one day; the amendment below is what is accepted. Rakha approved the original implementation on 2026-09-09.
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
| 3 | ~~Coverage unspecified/unknown,~~ unavailable TTL, missing/unsupported entries, or no observations — **see the amendment: undeclared coverage no longer belongs here by default** |
| 1 | Observations and declared scope are available, with at least one TTL below threshold |
| 0 | All observed keys within the declared scope have known TTL at or above threshold, without issues |

`--no-data-keys` is mutually exclusive with `--keys-file`. Core accepts the same assertion through its fourth options argument and rejects a contradictory nonempty key list before reading RPC. The result records the assertion as optional `coverage.noDataKeysDeclaredByContract[id]: true`, with supplied count zero. It is a caller declaration, not independently verified emptiness. An empty keys file or omitted key information alone does not assert emptiness.

JSON retains every successful observation and issue. For low TTL plus missing information, exit 3 wins but the low TTL remains visible. A missing payload/transport error wins as 2. Neither result can silently pass CI. The same precedence applies to programmatic legacy results: omitted coverage is unknown (3), not implicitly complete.

## Consequences

The bare `evergreen scan <id>` milestone invocation now returns 3 when data-key coverage is unspecified, even with healthy instance/code. W1-D7-01's recorded exits describe the earlier implementation and remain historical evidence, not a current CLI contract. Reproduction should explain this change rather than altering old recordings.

An incomplete default scan can teach callers to add `--no-data-keys` reflexively. Do not present that flag as a way to silence exit 3: first explain missing coverage and supply the actual known data keys; declare no additional keys only when the caller knows that assertion is correct. A successful exit under a false assertion is not independently verified whole-contract health. Final CLI UX remains W2-D10-01.

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

- 2026-09-09: Fatih endorsed the scheme in Issue #44; added his requested milestone migration and assertion-misuse consequences. Final ADR acceptance/merge remains separate.

---

## Amendment — 2026-09-10: undeclared scope is not the same as a degraded scan

**Accepted as amended.** The four codes and the `2 > 3 > 1 > 0` precedence stand, and so does the load-bearing sentence — *exit status summarises health and never authorises a transaction*. One thing changed.

### What was wrong

The original decision made `3` cover two different things: **a scan that came back degraded**, and **a caller who has not declared their data-key scope.** The second is not a defect in the read, and for most callers it is not fixable.

Whether a contract has data keys beyond its instance is knowable **only from its source**. `scan-contract.ts` states the constraint plainly — *"RPC cannot enumerate arbitrary storage"* — so there is no observation that establishes absence. Therefore:

- **If you wrote the contract, `--no-data-keys` is a claim you can make truthfully.** Your storage schema is a static property of your own code.
- **If you did not, you cannot know, at all.** Not "with difficulty" — there is no procedure.

And the second case is not marginal. Extending TTL is permissionless, `W4-D22-02` promises *"paste any contract ID"*, and the dashboard's whole premise is scanning contracts nobody on this team owns. For those callers the original scheme made `3` **permanent**, with the only escape being a flag that asserts something unverifiable.

**An exit code that users routinely silence with a flag has stopped being a signal** — and here the silencing would be a false statement about the chain. This ADR anticipated exactly that (*"can teach callers to add `--no-data-keys` reflexively"*) and answered it with a paragraph telling people not to. **A documentation note is not a mechanism.** It does not survive contact with someone who wants a green build.

### What changes

1. **`3` now means the scan itself came back degraded** — an entry not returned, a TTL unavailable, an executable that cannot be followed, or nothing observed. These are genuinely unknown, genuinely uncommon, and therefore still informative.
2. **A bare `evergreen scan <id>` exits `0`** when everything it was asked to check is healthy. Coverage is printed on every scan, so the limit is stated where a human reads it rather than encoded in a code they cannot act on.
3. **The completeness demand becomes opt-in: `--require-declared-scope`**, which restores the original behaviour exactly. `evergreen-check` sets it by default (`W4-D25-01`), because the Action is the CI surface and its user is almost always the contract's author — the one party who can satisfy it.

`--no-data-keys` survives unchanged as the author's declaration, and is still never independently verified. An empty keys file still does not assert emptiness.

### What this deliberately does not do

**It does not abandon fail-closed.** Fail-closed is right wherever the caller can satisfy the demand, and `--require-declared-scope` keeps it verbatim for them. The amendment says only that the demand should be made of the party who can meet it, rather than of everyone. Two callers with opposite needs now get the default each one actually wants, instead of one default that is correct for CI and wrong at a terminal.

**It does not make `0` mean more than it did.** `0` has always meant *"everything I was asked to check is healthy"* and never *"this contract is fully healthy"*. That was true before the amendment and is true after; what changed is that the CLI now says so in words rather than through a code the reader cannot interpret.

### Verified

Against guinea-pig A on live Testnet, not fixtures:

```
bare                                   -> 0
--require-declared-scope               -> 3
--no-data-keys                         -> 0
--no-data-keys --require-declared-scope-> 0
--keys-file <two keys> --require-...   -> 0
```

143 offline tests pass. Rakha's original coverage assertions were **moved behind the flag rather than deleted** — every case he wrote still fails closed for the CI caller.

## Downstream sweep (amendment)

- `W2-D10-01` — CLI UX and exit codes: this is where the final wording lives; the amendment supplies the shape, not the finished UX.
- `W4-D25-01` — `evergreen-check` must pass `--require-declared-scope`. **Without it the Action inherits the permissive default and a CI user gets a green on an undeclared scope**, which is the one place the original instinct was right.
- `W2-D13-01` — config loading still preserves a caller's coverage declaration; unchanged.
- `W1-D7-01` — its "exit codes verified in all four directions" record is historical and already labelled as such.
- `W3-D15-01`/`W3-D16-*` — unaffected. No exit code has ever authorised a transaction and none does now.

## Update log (amendment)

- 2026-09-10: accepted as amended. `3` narrowed to a degraded scan; the completeness demand moved to `--require-declared-scope`, on by default in the Action. Recorded because the original shipped in #60 before acceptance and ran unamended for one day.
