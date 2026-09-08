# Resend local email smoke — W1-D5-04

One explicit live send was accepted after the local preview succeeded.

| Field | Result |
|---|---|
| Date | 2026-09-07 |
| Command | `pnpm email:smoke --send` |
| Provider endpoint | `POST https://api.resend.com/emails` |
| Response | HTTP 200; `status: accepted` |
| Provider email ID | `88711fc1-58ea-4e1a-bfb1-862bdfe32f7e` |
| Recorded at | `2026-09-07T11:28:15.674Z` (18:28:15 WIB) |
| Subject | `Evergreen email setup test [W1-D5-04]` |
| Recipients | One, configured privately in local `.env` |
| Inbox receipt | Confirmed by the recipient in this session on 2026-09-07: “Sudah masuk inbox” |
| Source | `chore/W1-D5-04-email-smoke`, local changes based on `741ae61` |
| Local validation | `pnpm check`: 34 tests passed (5 workspace + 11 TTL + 9 scheduler + 9 email) |

[`send-result.json`](send-result.json) is the script's unchanged JSON stdout from the live send. It is a **derived, sanitized result**, not the full HTTP response: the script validates the provider email ID, retains HTTP status, and omits mailbox addresses and authorization headers. The API key remains in ignored local `.env`.

The default preview succeeded at `2026-09-07T11:27:47.006Z` with `submitted: false`. The send command above was invoked once, with no automatic retry. The script uses a stable idempotency key for the same message to reduce duplicate delivery if manually retried within Resend's 24-hour window.

**Receipt evidence:** after the send, the recipient explicitly confirmed “Sudah masuk inbox” in this session. This is a recipient-reported inbox check; no mailbox screenshot was captured. The unchanged send output correctly retains `receivedInInbox: "unverified"` because receipt was confirmed later, separately from the API response.

**Proof boundary:** the authenticated request and recipient confirmation establish that one local test email reached the inbox. They do not prove ongoing delivery reliability, engine notifications, or an unattended alert. `W1-D5-04` is Done locally; publication remains subject to local review. No Stellar transaction was submitted.

## Integration with PR #35

The original smoke implementation and this result were preserved in local commit `31097f9` before integrating main `c592d2e` (PRs #28, #33, #35). The implementation now lives at `scripts/send-test-email.mjs`, the path introduced by PR #35, with `pnpm email:smoke` retained as the command. The request and response-validation behavior of the verified local implementation is unchanged; the duplicate `email-smoke.mjs` entry point is removed. No additional email was sent during integration. Combined-tree `pnpm check` passed conflict-marker detection, typecheck, lint, formatting, and all 34 tests. `pnpm email:smoke` also passed preview at `2026-09-07T12:39:50.224Z`, with `submitted: false`. The live-send JSON is unchanged.

## Follow-up after PR #38

2026-09-08: [Issue #37](https://github.com/Fatihmaull/evergreen/issues/37#issuecomment-5573281589) accepts the local implementation and the existing delivery proof; no second send or mailbox screenshot is required. The follow-up on `chore/W1-D5-04-email-follow-up` starts from main `cdbbb77` and selectively carries the probe, nine offline tests and this evidence forward, preserving the merged shared-types checks. The historical validation above describes the old branch. `send-result.json` is byte-for-byte unchanged.

Integration checks passed on 2026-09-08: `pnpm check` ran all 40 tests (7 shared-types + 4 other workspace + 11 TTL + 9 scheduler + 9 email), typecheck, lint, formatting and conflict detection. The configured `pnpm email:smoke` preview returned `submitted: false` with redacted addresses at `2026-09-08T03:24:50.267Z`. No provider request or additional email was made. This preview is an integration check, not another delivery proof. Local review is complete, and [PR #40](https://github.com/Fatihmaull/evergreen/pull/40) publishes the follow-up for @Fatihmaull's review, closing Issue #37 on merge.
