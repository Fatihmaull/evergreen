# W3-D15-02b — internal review

Reviewed the implementation against the approved per-entry plan and Fatih's #125
decision. Focus: default-off bypass, repeated registration veto, XDR durability and
owner binding, refreshed execution, alert deduplication and immutable evidence.

Two integration defects found during validation were fixed directly:

1. Execution refresh only requested persistent data keys. A temporary candidate
   stopped before simulation/send. The full runner regression now verifies a
   declared opted-in temporary key reaches confirmed post-state; refresh includes
   it and rechecks the same consent resolver.
2. The bump-record alert path could cover a temporary liveness finding while using
   the ordinary unconfirmed warning tier. Typed temporaryRetention context now
   preserves critical urgency and irreversible-loss detail without duplicate email.

The setup helper also needed a Uint8Array hash-format correction. The original
intent, malformed lookup, corrected canonical hash and successful receipt are all
retained. This did not require another upload or a production-code change.

Validation: `pnpm check` exited 0 — **765 Vitest + 112 Node = 877 tests**. New cases
cover strict config validation, missing/false/default consent, independent keys,
duplicate veto in both orders, forged execution decisions, TTL zero and expiry,
actual runner execution and alert deduplication. Real Testnet verification confirms
one temporary-key extension, with all four setup/extension receipts and explorer
screenshots. One critical test email reached the user's inbox.

No confirmed open finding remains within this scope. No B/C/shared-Wasm write,
policy-signer work, timer activation or publication was performed. Local task
completion and Fatih's later review/merge remain distinct.

## Publication CI follow-up — #128 clock coverage

CI for PR #160 exposed the same fixture clock race in the separate "review
boundaries" suite: the old Date-only fake-timer hooks applied only to the first
suite. A new regression waits 1.1 real seconds after setup and then executes;
it failed deterministically before the correction. Date-only hooks now cover
all suites in this fixture file. Real timeout/sleep behavior is not mocked, and
production execution, policy behavior and recorded live evidence are unchanged.

Post-fix full `pnpm check` exited 0: **766 Vitest + 112 Node = 878 tests**.
