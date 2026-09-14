# W3-D17-01 — EmailChannel implementation plan

**Status:** Rakha approved local implementation on 2026-09-14; implementation and
offline verification and internal review are complete; Rakha authorized publication. This does not authorize email,
transaction, secret lookup or scheduler activation.

**Goal:** implement the existing notification interface with a reusable Resend
email adapter and a previewable local command, feeding the September 18 alert gate.

**Architecture:** shared-types owns the existing contract; core owns message
templates; engine owns transport and private destination configuration. Reuse the
existing provider behavior from the W1 smoke rather than maintain two senders.

**Tech stack:** repository-pinned Node 24, TypeScript, Vitest, native fetch; no new
SDK, database, daemon or queue. Work sequentially with executing-plans after plan
approval, following the repository's local review/publication checkpoints.

**Spec:** PRD P0 email success/failure alerts; ARCHITECTURE's NotificationChannel
seam; BACKLOG W3-D17-01, with D17-03 template dependencies and D17-04/05 validation.

## Baseline and branch

Read source from `origin/main` at cbd2a7e, not the old local D16 checkout. #120–#122
are merged; #131 adds templates; #134/#135 cover idempotency; #136 records scheduler
limitations. D17-01/02/04/05 remain Rakha's rows; no open PR was found at refresh.
Fatih asks for the next branch/date in #104. This local plan has not been sent there.

Before implementation, preserve all local planning/handoff files, refresh ownership
and main again, then create `feat/W3-D17-01-email-channel` from verified main. Do not
continue on the old merged D16 branch or rebuild Fatih's completed tasks. Reconcile
local STATUS/BACKLOG with main before marking D17-01 In progress. Keep the D15-02b
draft separate. Push and mirror sync wait for Rakha's next explicit publish request.

## D16-01: what remains, in plain terms

| Layer | Verified state | Remaining action |
| --- | --- | --- |
| Execution implementation | #122 approved and merged; later safety tests landed | No implementation repeat and no pending #122 review |
| Real RPC simulation | #129 ran A's selected path without signing | Retain it as simulation evidence; it is not a successful bump |
| Controlled live validation | Still outstanding, tracked with #130 | A reviewed payer, cap, recorder and capture plan; explicit live authorization; matching confirmation and post-TTL evidence |
| Live alert delivery | D17-01/03/04/05 dependency | Confirm receipt of success and failure alerts, not only provider acceptance |
| Unattended save claim | W3-D18-02a | A manual invocation cannot establish cron-triggered execution |

Recommended reporting: **D16-01 code complete/merged; live validation pending**.
Keep the existing In progress checkbox until that acceptance is satisfied; do not
describe it as waiting for Fatih review. A single coordinated successful execution
can supply D16-01 validation and D17-04's success-alert evidence. If it is genuinely
scheduled and unattended, it may also satisfy that part of D18-02a; otherwise keep
the unattended requirement open. Failure-alert evidence remains a separate case.

The next step is EmailChannel, not repeating W2 proof A. A new controlled A proof
is a distinct W3 acceptance event. Prepare it early enough for the September 18
gate, with sender, recipient, public payer, current target/cap and artifact capture
concrete before seeking live authorization. Never paste or request a seed in chat.
An unconfirmed hash must be reconciled before another attempt. B/C and shared Wasm
are excluded. No new live action is authorized by this plan.

## Design choice and existing pieces

Recommended: native-fetch Resend transport using the established W1 endpoint,
private configuration and validation patterns, moved behind EmailChannel. A new
Resend SDK would add a dependency without removing meaningful logic. A durable
outbox would expand this task into recovery infrastructure; defer that decision
until D17-05's failure-handling plan demonstrates a need.

The existing shared interface is retained unchanged:

```ts
interface NotificationChannel {
  readonly name: string;
  notify(record: BumpRecord): Promise<void>;
}
```

`bumpSucceeded`, `bumpFailed` and `approachingCritical` already exist in core.
`notifications: { channel: 'email', toEnvVar: 'EVERGREEN_ALERT_TO' }` already exists
in config. Destination addresses stay in environment/private adapter options,
not BumpRecord or published JSON. The channel never imports signer/RPC execution.

## Required correction before reusing the failure template

Reproduced from main's actual template with an offline failed/live record carrying
a hash and the core error `Extension rejected or post-state unverified`:

```text
The extension did not happen. This entry is still on its original TTL.
Nothing was left pending. A retry is safe once the cause is understood.
```

Core emits `failed` after a confirmed transaction when post-TTL verification fails.
The record therefore cannot support those unconditional statements. Proposed narrow
correction in Fatih's D17-03 template: **extension success could not be verified**;
when a hash exists, inspect its confirmation and current TTL before retrying. For
dry-run failure, explicitly say simulation failed and no transaction was submitted.
Do not claim no durable intent exists merely because a record lacks a hash.
Preserve the stronger submitted/unconfirmed warning and temporary-entry semantics.

This is an explicit D17-03 integration correction, not a second template system or
an accepted change to Fatih's text. Include it in plan review; at publication link
the correction to D17-03/#131 so ownership and rationale remain visible. No issue
or comment is sent during this planning step.

## Proposed behavior

| Input or event | Behavior |
| --- | --- |
| `succeeded` live record | Render existing success template |
| `submitted` live record | Render unconfirmed failure warning, never success |
| `failed` record | Render corrected failure wording; distinguish dry-run |
| `simulated` record | Explicit skipped notification, no provider request |
| Default channel mode | Preview only; no API-key lookup or network |
| Explicit send mode | Validate destination/from and API key, submit one bounded request |
| Provider accepts with valid ID | Report accepted; inbox receipt remains unverified |
| Timeout, invalid JSON or missing ID | Surface delivery uncertainty; no automatic resend |
| Provider rejection | Structured sanitized error; do not swallow or change bump outcome |

Keep `notify(record): Promise<void>` for generic callers. Add engine-local
`previewBumpNotification(record): Notification | undefined` and
`EmailChannel.deliver(notification, eventId): Promise<EmailDeliveryResult>` so the
local command can capture a provider receipt and later critical/run-level alerts
can reuse transport without inventing a BumpRecord. `notify` delegates and rejects
on delivery failure; it must not imply inbox delivery when its promise resolves.

Proposed result variants: preview, skipped, accepted (emailId and inboxUnverified).
Typed delivery errors carry rejected/unknown classification and safe error codes;
never include raw provider bodies, credentials, addresses or HTTP headers in logs.
Private options use `EMAIL_FROM`, `EMAIL_API_KEY` and config-selected `toEnvVar`.
Keep the established `onboarding@resend.dev` default for local readiness; wider
delivery needs a verified sender. Do not fall back from the engine recipient to
the W1 `EMAIL_TO` silently. Validate single plain addresses and reject newlines.

Use `POST https://api.resend.com/emails`, plain text, redirects refused and a
10-second end-to-end bound including body consumption. Inject fetch for tests.
No automatic retries in this slice. Idempotency key = fixed prefix plus SHA-256
of a deterministic event identity and the exact sender/recipient/message payload.
Same event/payload must reuse its key; different outcome/payload must not collide.
Keep private input out of the emitted key itself. Resend retains idempotency keys
for 24 hours; that is not permanent deduplication or proof of inbox receipt.
Sources: [Send Email](https://resend.com/docs/api-reference/emails/send-email),
[Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys),
checked 2026-09-14.

Configuration validation is part of the integration: reject an explicit channel
other than email, malformed notifications objects and invalid environment-variable
names instead of coercing another channel into email. Omitted notifications remain
valid; an omitted channel retains the legacy email default. No shared-type expansion or new provider selection is needed.

## Implementation sequence and acceptance

1. **Template/config preconditions.** Add regression cases in
   `packages/core/test/notification-templates.test.ts` and `config.test.ts` before
   fixing `notification-templates.ts` and config validation. A failed live record
   with a hash must not say unchanged TTL, no pending state or safe retry. A
   submitted record must never produce a success claim. Invalid channel/config
   fails; existing omitted/email config stays compatible.
2. **Channel and transport.** Add `packages/engine/src/email-channel.ts`, export
   its API from engine/index, and test in `packages/engine/test/email-channel.test.ts`.
   Cover default preview (zero fetch/key-reader calls), explicit accepted send,
   all four outcome variants, 401/429/5xx, redirect/transport failure, malformed
   response, timeout during fetch and body read, stable/distinct idempotency keys,
   and redaction. Every failure test asserts no second provider call. Rejecting
   email delivery must leave the original BumpRecord untouched.
3. **Real command path.** Add engine-local command parsing and
   `scripts/email-notify.mjs`, with `pnpm email:notify --record <file>` preview and
   explicit `--send` for a separately authorized send. Use config for recipient
   lookup. Read exactly one validated BumpRecord; reject malformed JSON/variants
   before rendering or looking up secrets. No record fabrication or signing in
   the command. Keep this rehearsal command local-only for sending; generic
   channel code has no hard-coded CI ban because future authorized scheduling
   consumes it. Built-artifact tests exercise help, preview, argument rejection
   and sanitized nonzero delivery errors with a fully offline provider.
4. **Retire duplicate W1 provider code.** Replace `scripts/send-test-email.mjs`
   with a migration/help shim for the new command; it must no longer send the
   old fixed probe. Port its applicable protections/tests to the channel and
   update package scripts. Preserve historical W1 evidence and label the old
   commands historical in SETUP. Do not leave two independent Resend send paths.
5. **Docs, verification, local review.** Update SETUP, relevant ARCHITECTURE seam,
   `.env.example` descriptions and D17 implementation/status notes. Run focused
   core/channel/command tests, built command tests and complete `pnpm check`.
   Confirm removing the send opt-in or suppressing a transport error fails a
   targeted test. Internal review precedes the explicit publish checkpoint.

Test commands after a fresh build:

```sh
pnpm build
pnpm exec vitest run packages/core/test/notification-templates.test.ts packages/core/test/config.test.ts packages/engine/test/email-channel.test.ts packages/engine/test/email-command.test.ts
pnpm check
```

## Boundaries and next gates

- D17-02 webhook/Telegram stubs remain a separate small task using the same interface.
- D17-01 is the reusable channel and rehearsal entry point. D17-04/05 own wiring
  it to actual engine outcomes and handling preflight failures, unavailable RPC,
  low balance and missed runs. Do not fabricate failed bump records for events
  where no bump attempt existed. Use the generic delivery seam with an explicitly
  reviewed message/event identity instead.
- A scheduler that did not start cannot send its own failure email. D17-05 must
  account for the measured 132-minute median / 294-minute worst gap and an external
  detection/backstop path; cron self-reporting alone cannot satisfy that case.
- No live email, secret inspection or Stellar write during implementation/review
  without a concrete authorized test. Actual sending needs reviewed recipient and
  message. Provider acceptance and inbox receipt are recorded separately.
- D17-01 may be implemented and published while #125 and #130 remain open. Keep
  status In progress until the required real delivery validation is recorded.
- Aim to prepare channel code first, then D17-02 and the D17-04/05 proof plan,
  leaving time for actual success/failure delivery before Friday September 18.
  Do not promise a branch date to Fatih before Rakha approves implementation.

This plan has been checked against the current interface, templates, config parser,
W1 transport and merged backlog. At planning time only local planning/status notes were written; the implementation report records the subsequently authorized work.
