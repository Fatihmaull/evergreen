# W3-D17-02 — notification channel stubs

Status: local implementation and built public API refusal tests complete;
[internal review](W3-D17-02-REVIEW.md) found no blocking findings. Branch `feat/W3-D17-02-channel-stubs`, base main cbd2a7e. No push,
commit or PR for this task is claimed. The defined stub task is Done locally; publication and Fatih review/merge remain.

## Result

The public engine entry point exports WebhookChannel, TelegramChannel and
ChannelNotImplementedError. Both channels implement the existing shared interface
without changing it. Their names are webhook and telegram; notify(record) always
returns a rejected promise with code CHANNEL_NOT_IMPLEMENTED, the fixed channel
name, and an explanation that actual delivery is SOW 2 scope.

Constructors accept no endpoints, credentials or recipients. Neither stub reads,
mutates, serializes or logs the record. There is no transport, fallback channel,
accepted receipt or successful no-op. Config, scheduler and transaction code are
unchanged. ARCHITECTURE documents that these are unavailable extension points.

The production addition is one small module plus the public export. No new
dependency or shared-type change. EmailChannel and strict email-only config
validation remain in the separate PR #137; this branch does not duplicate them.

## Verification

- Four source tests exercise both channels through NotificationChannel, typed
  rejection, unchanged records, no record access, no fetch and no logging.
- One fresh-process test imports the built package's public entry point, calls
  both stubs and checks both exact rejections. Fetch and credential-variable
  access are guarded; a resolved call or side effect fails the test.
- Replacing each channel's rejection with a resolved promise fails its tests.
  Both mutations were restored byte-for-byte before the full check.
- Full `pnpm check` passed: **728 tests = 643 Vitest + 85 Node**, exit 0. Coverage:
  94.51% statements, 90.46% branches, 94.64% functions, 96.58% lines. Gates unchanged.

[Full output](evidence/2026-09-14-channel-stubs/pnpm-check.txt),
[source hashes](evidence/2026-09-14-channel-stubs/verification.json),
[mutation results](evidence/2026-09-14-channel-stubs/mutations.json).

The suite count is relative to main cbd2a7e, not the larger suite on unmerged #137.
The relevant e2e acceptance for unavailable stubs is verified refusal from the
built public API. A real webhook or Telegram send would exceed this task's scope;
none was attempted. No email, Stellar RPC, signature, transaction or scheduler
activation occurred.

## Workspace and handoff

The prior D17-01 branch and its live-email evidence remain at published head
4451394. Its unpublished STATUS/W1-REVIEW notes were preserved as stash b7148a2,
named Preserve unpublished D17-01 session notes before D17-02. The D15-02b draft
and W3 handoff remain untracked and untouched. Do not apply those old notes over
new main blindly when returning to that branch.

The full gate initially encountered the gitignored one-shot email capture helper
under .evergreen, which ESLint still scans. That helper was preserved byte-for-byte
outside the repo at /tmp/evergreen-W3-D17-01-send-approved-email-2026-09-14.mjs;
private intent/results remain in .evergreen. No lint exclusion or gate was changed.

Next checkpoint is an explicit publish request, then Fatih review/merge. Refresh #137's state and reconcile its export/tracking changes before
publishing. Notion sync is deferred to publication. Afterwards prioritize D17-05
failure/alert wiring and D17-04 proof before September 18.
