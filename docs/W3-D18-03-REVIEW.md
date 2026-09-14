# W3-D18-03 — internal review, 2026-09-14

Reviewed local head `c5ae30a` against baseline `91ad650`, scoped to the collector,
verifier, producer refactor, dated gate, fixtures and operator instructions.
No publish, transaction, email or timer activation occurred during review.

## Outcome: finding corrected locally; publication remains separate

### P2 — valid evidence fails replay when capture and CI locales differ

Location: `scripts/verify-crossing-capture.mjs:190–191`.

Replay deep-compares the entire result, including engine decision strings, and
then compares formatted stdout. Both contain numbers rendered through implicit
`toLocaleString()`. The manifest records the capture locale, but replay does not
use it. `checkRuntime: false`, used by the dated gate, does not solve this.

Confirmed with offline fixtures only, in a temporary repository evidence tree:

- Capture B at the normal threshold on the synthetic Sep 20 date with `de-DE`:
  collector exit 0 and qualifying refusal.
- Run the dated gate with `de-DE`: exit 0.
- Run it on the same untouched directory with `en-US`: exit 1, reports missing B
  crossing evidence.
- Independently replay the retained real Sep 14 B preflight under `de-DE`: it
  rejects the summary because `1,694,801` becomes `1.694.801` in decision text.

The operator documentation acknowledges matching locales for strict replay, but
CI's dated gate must accept legitimate operator evidence across machines. It
cannot depend on the CI host accidentally sharing the capture locale.

Fix direction: make numeric formatting deterministic across both production and
replay, or run both under an explicitly controlled locale. Cover engine reason
strings as well as the probe header. Add a cross-process regression that captures
under one locale and runs the actual dated gate under another. Preserve raw RPC
and existing evidence bytes; do not reseal historical captures to hide a mismatch.

## Verification and limits

The existing 15 crossing-capture tests passed again. The cross-locale reproduction
is an additional failing scenario, not included in that suite yet. No full check
was repeated because this review made no runtime changes; the earlier full-check
result remains the implementation's baseline, not evidence that this finding is
covered. No additional actionable finding was confirmed in the scoped review.

## Correction after review

The confirmed finding was fixed directly with Rakha's authorization. Engine decision
text, liveness descriptions and probe thresholds now format numbers explicitly as
`en-US`, matching the existing English messages. Numeric data and decision logic
are unchanged; no comparison or integrity check was weakened.

The new cross-process regression failed before the correction and passed afterward:
a `de-DE` capture passes the actual dated gate under both `de-DE` and `en-US`.
All 16 crossing-capture tests pass. Existing real Sep 14 B/C and rehearsal bundles
also replay successfully under `de-DE` using the historical-runtime mode. Their raw
responses, manifests and checksums were not edited. Strict verification of those
historical bundles still requires their original recorded source/build, as designed.

No review finding remains open. Actual B/C crossing/expiry remains future work.
Publication remains a separate user checkpoint.

The first full-check attempt encountered the existing execution-fixture clock race
tracked in #128: the second expected successful record failed. Reused exactly the
Date-only fake-timer correction already present in PR #146 (`f3518cd`), without
changing engine execution behavior. This shared test correction must be deduplicated
when the two branches are published/merged; it is not a new independent task.

Final validation: `pnpm check` exited 0 after both corrections (750 Vitest tests
plus 102 Node script tests, 852 total). No open review finding remains.
