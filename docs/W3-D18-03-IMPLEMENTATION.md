# W3-D18-03 — capture preparation, 2026-09-14

Implementation is local on `feat/W3-D18-03-crossing-capture`, based on main
`91ad650` (#154). Runtime commit: `2ac20f4cda5dca2b34798287a2a9be412a1e108b`.
Separate internal review and publication are still pending. W3-D18-03 remains
In progress: prepared tooling is not the future crossing/expiry evidence.

## Implemented

- Reused the existing read-only B/C producer and engine; the legacy probe CLI remains.
- Added exclusive capture directories with raw RPC, producer output, independent
  control reads, source/build fingerprints, timestamps and checksums.
- Added offline replay verification, explicit rehearsal exclusion, verified baseline
  requirements for expiry, and sealed-bundle handling in the existing dated gate.
- Added [operator commands and acceptance limits](W3-D18-03-CAPTURE.md).
- Kept the core write guard, shared types, dogfood config, scheduler and protected
  acknowledgements unchanged. No transaction, email or timer was run.

## Validation

`pnpm check` exited 0: 750 Vitest tests and 101 Node script tests (851 total),
including 15 crossing-capture cases. Regression coverage includes TTL zero, the
one-ledger instance/persistent expiry difference, missing controls, mismatched
control key/XDR ownership, tampered/resealed summaries, write RPC rejection,
concurrent transport ownership and rehearsal/supporting-file gate exclusion.
The control ownership test failed before its validation fix and passed afterward.
All synthetic future captures remained in temporary directories.

Three real read-only Testnet captures used the committed runtime, fresh forced
builds and exactly five allowed RPC calls each. Strict offline replay succeeded
for all three. Local retained directories are under
`.evergreen/crossing-prep/2026-09-14/` (ignored, not published):

| Directory | Observation UTC | Subject remaining TTL | Result |
| --- | --- | --- | --- |
| `B-before` | 15:48:12.949 | 118,227 | `before-action`, does not qualify |
| `C-before` | 15:48:29.929 | 204,633 | `before-action`, does not qualify |
| `B-rehearsal` | 15:48:34.800 | 118,222 | `rehearsal`, does not qualify |

B instance expiry remained 4,793,687; C remained 4,880,097; shared Wasm remained
5,290,829. Each control read returned A, subject instance, subject persistent and
shared Wasm; the declared temporary key was absent. This is the observed state,
not a claim that temporary expiry occurred during this test.

`verify:crossing B-rehearsal --require-crossing` exited **2**, as required.
There is no new transaction hash to index. Preserve all capture bytes for review;
if publishing this preparation evidence later, label it with the real date and
keep rehearsal separate. Nothing here satisfies the Sep 20/Sep 25 crossing gate.

## Remaining checkpoints

1. Internal review of this implementation and its operational instructions.
2. Separate publication approval; sync Notion then. Current local repo status is
   ahead of the mirrored D18-03 Pending state, with that pending sync recorded.
3. Shared acceptance in #130 and the manual/unattended distinction are unresolved;
   a prepared collector is not proof of unattended B monitoring.
4. Operator handoff/readiness by Friday Sep 18, then actual B/C crossing and expiry
   observations in their windows. No timer has been installed by this change.
5. Retain/index real event logs and any required alert screenshots. Fatih's
   shared-Wasm handoff remains conditional on accepted B/C evidence.

## Review correction

The locale finding in [internal review](W3-D18-03-REVIEW.md) is corrected locally:
probe, engine and liveness numeric text uses explicit `en-US` formatting. A new
cross-process test proves a German-locale capture passes both German- and
English-locale dated gates. Historical real capture bytes are unchanged and still
pass semantic replay with runtime-version checking disabled; strict replay retains
its original-source requirement. The existing test-only clock fix from PR #146 is
also reused after the known #128 flake surfaced during the full check.
