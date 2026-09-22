# W3-D18-03a — internal review

Outcome: ready for publication review. No unresolved blocking finding in this
change; no PR publication or Shared acceptance is implied by this local review.

## Finding fixed

A report could replay valid source bytes, then read its source hashes after a file
changed and incorrectly bind the result to different bytes. A deterministic
filesystem test reproduced this: adding whitespace to the source manifest between
validation and report hashing still returned success before the fix.

The assessor now fingerprints source metadata before replay, compares it afterward,
and rechecks the complete checksum inventory before emitting the report. The same
reproduction is rejected. Test file URLs also use proper filesystem decoding for
checkout paths containing spaces.

## Validation

- Full `pnpm check` passed: 894 tests, including 10 assessment tests.
- Still-live states, both TTL-zero boundaries, missing/wrong baseline, rehearsal,
  invalid controls, shared expiry changes, altered payloads, missing/malformed TTL,
  corrupt checksums and resealed false summaries are rejected.
- Three real retained final attempts produce separate `expiry-observed` assessments;
  saved assessment claims, source hashes and current assessor hashes match replay.
- Each original attempt still has22 valid checksum entries. Its original verdict
  remains `unverified`; no recorded result or sealed manifest was rewritten.
- Frozen capture root still matches all31 runtime fingerprints. The original five
  capture/verification scripts, core, dependencies and lockfile are unchanged.
- Tests and reassessment are offline; no new chain read, transaction or restore.

## Scope

This is a separate assessment of version1 evidence, not a mutation of its verdict.
No CLI scan-rendering change or generic archive API redesign is included. Reviewers
must distinguish local compatibility success from final Shared acceptance. C's
required later capture and W3 closeout remain outstanding.
