# W3-D16-01 — internal review

**Outcome: no blocking findings in the reviewed local execution scope.**
No production correction was required. Six regression cases were added, and the
complete check passed. Ready for the explicit publication checkpoint; this is
not approval to submit a Testnet transaction or activate live scheduling.

Publication after this review: implementation 19f9275 is in [PR #122](https://github.com/Fatihmaull/evergreen/pull/122), awaiting Fatih review/merge.

Reviewed the uncommitted D16 changes on `feat/W3-D16-01-engine-execution` against
parent cdecdb8, including new files. The [review source manifest](evidence/2026-09-13-engine-execution/review-verification.json)
identifies the exact tree. Production source matches the implementation snapshot;
changes during review are tests, local reports and verification artifacts.
This was a sequential internal review in the implementation session. Fatih's
independent review and merge remain separate.

## Contracts checked

- Config and explicit flags jointly gate live execution. Simulation uses the
  public payer without reading operational seeds or creating submission state.
- Only selected instance/persistent keys reach preparation. Temporary/code
  exclusions preserve decisions and liveness; the manual planner's implicit
  instance does not leak into the engine selection.
- The existing guard protects B/C and shared Wasm, including when A can act in
  the same pass. Protected skips remain visible and cannot be counted as success.
- Per-key refresh preserves scope and rechecks TTL, policy and network ceiling.
  Refreshed skips remain distinct from confirmed extensions.
- One aggregate budget applies across a payer's keys. Signer identity, exact
  envelope/hash, Testnet, target, fee and validity checks reuse the core paths.
- Public intent is flushed before send. A recorder failure prevents send; an
  existing journal prevents another live run. The one-shot journal does not claim
  to solve scheduler recovery or across-path coordination.
- Transient reads retry with bounded backoff. Send never retries. Uncertain sends
  retain their hash and stop later execution across payers; confirmation is bound
  to the returned envelope, and success also requires verified post-state TTL.
- The new command loads the built import graph, preserves actual execution exit
  status and leaves the existing cron decide-only. Tests use offline transports.

## Additional checks

1. A, B and C all due, with shared code also due: only A's instance/persistent
   keys execute; B/C and code retain guard refusals, no previews, and liveness
   findings. This passes through the actual core signer with test-only keys.
2. A readable/due while another watched instance is missing: the initial scan
   gate reports `SCAN_INCOMPLETE`, leaves A unattempted, exits 2 and never reads a
   seed or sends. This verifies the conservative limitation described below.
3. Installed SDK HTTP 429 and 503 reads retry exactly twice with 1s/2s backoff.
4. Installed SDK HTTP 400 reads do not retry.
5. Installed SDK HTTP 503 during send does not retry.

The two status variants in item 3 make six added test cases. SDK checks replace
fetch with fixture responses; there is no network fallback.

Two targeted mutations verify that tests detect missing safeguards: omitting the
before-submit recorder fails its rejection test, and routing send through the
read-retry wrapper fails the one-send test. Both failures were assertion failures,
and both production files were restored byte-for-byte before the final check.
[Mutation results](evidence/2026-09-13-engine-execution/review-mutations.json).

## Verification and limits

Fresh full `pnpm check`: **704 tests = 619 Vitest + 85 Node**, exit 0.
Coverage: 94.12% statements, 90.20% branches, 94.44% functions, 96.17% lines.
[Captured output](evidence/2026-09-13-engine-execution/review-pnpm-check.txt).
All gates are unchanged. The Notion gate ran parse-only and made no mirror writes.

Initial scan completeness is deliberately a whole-run gate in this slice:
any non-advisory scan issue stops execution even if another entry is readable.
It reports the affected observations, unattempted selection and a nonzero exit.
This trades availability for conservative refusal. Operators must resolve stale
or unreadable declared scope before another attempt; per-entry degraded execution
would need its own reviewed behavior. An ordinary protected skip with readable
observations does not trigger this gate and does not silence A.

Task status remains In progress: unsigned Testnet validation and the separately
authorized controlled live proof remain pending. Across-run recovery, shared-key
execution coverage, durable published history and live alerts remain their own
backlog gates. This review does not close the September 18 operational gate.

Read-only GitHub refresh found #120 and #121 open at dda2530 and cdecdb8, without
submitted reviews or merge. No newer Fatih instruction changed this execution
scope. No commit, push, external comment, Notion write, operational seed access,
Testnet RPC, transaction or scheduler activation occurred during this review.
The D15-02b draft and W3 handoff remain separate local files.
