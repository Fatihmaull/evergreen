# W3-D17-01 — internal review

**Outcome: one P2 finding reproduced and fixed locally; no remaining blocking
findings in the reviewed scope.** Ready for the explicit publication checkpoint.
Real email delivery and inbox verification remain outstanding.

Reviewed uncommitted D17 changes on `feat/W3-D17-01-email-channel`, based on main
cbd2a7e, including new files. This was a sequential internal review in the same
session; Fatih's independent review remains separate.

## Corrected finding

**P2 — a valid key and valid addresses could still name the wrong contract.**
`parseNotificationRecord` accepted A's instance key with `contracts: [B]`, or with
`contracts: [A, B]`. The rendered email could therefore identify the wrong subject
even though the parser claimed to check record consistency. Reproduced first with
the built parser and then with two failing regression cases; no email was sent.

ContractData embeds exactly one owner in its canonical key. The parser now compares
that address against the single declared consumer using the existing core key
helpers. ContractCode retains multiple-consumer support; a positive regression
protects that case. This is input consistency checking, not chain verification or
a change to the transaction write guard.

Only `packages/engine/src/notification-record.ts` changed in production during this
review. No change to sender behavior, budgets, execution, workflows or shared types.

## Additional checks

Eight cases were added: two owner mismatches, one valid shared-code record, sender
validation independent of recipient validation, three invalid API keys, and
idempotency-key separation for different private recipients. The five channel
cases passed the existing implementation; they are added coverage, not bug fixes.

The review also traced:

- Default preview and explicit send boundaries, including command flags and CI
  refusal. Simulation records remain skips, with no success mail or key lookup.
- Routing of succeeded/submitted/failed records and the corrected failure-template
  limits; post-state uncertainty does not become an unchanged-TTL or safe-retry claim.
- Fixed provider endpoint, refused redirects, one request per attempt, bounded
  fetch/body reads, sanitized errors and propagation to a nonzero command exit.
- Stable event/payload idempotency keys; provider acceptance remains distinct from
  inbox receipt. No permanent delivery guarantee or automatic retry is claimed.
- Record validation before recipient/API configuration access, retired W1 sender,
  unchanged shared interface, built-command test isolation and current setup docs.

## Verification

Fresh full `pnpm check`: **793 tests = 714 Vitest + 79 Node**, exit 0. Coverage:
94.32% statements, 90.10% branches, 95.06% functions, 96.47% lines. Gates unchanged.
Focused channel/command tests: 59 passed. The full check rebuilt the command and
ran its provider-isolated subprocess tests against the corrected source.

Disabling the new owner check makes both mismatch regressions fail with assertion
errors. The source was restored byte-for-byte and all 36 command/record tests then
passed again. Earlier implementation mutations already cover missing send opt-in
and swallowed delivery errors; they were not rerun without a new reason.

[Check output](evidence/2026-09-14-email-channel/review-pnpm-check.txt),
[review source manifest](evidence/2026-09-14-email-channel/review-verification.json),
[owner-check mutation](evidence/2026-09-14-email-channel/review-mutation.json).
The implementation manifest remains the historical pre-review snapshot.

No operational secret, real provider request, inbox access, Stellar RPC,
transaction, publication or Notion write occurred. D17-01 remains In progress
pending actual delivery validation. D17-04/05 still owns live outcome wiring and
failure/missed-run alerts; the channel alone does not meet that operational gate.
