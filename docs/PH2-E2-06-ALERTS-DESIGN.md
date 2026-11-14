# PH2-E2-06 per-user alerts via Resend: design for agreement before code

**Status, 2026-11-10:** dispatcher, templates, planning and the Postgres stores are on `main`. Migration **0011 is on `main` and applied** to preview (2026-11-05 07:34:02–07:34:07 UTC) and production (2026-11-05 07:35:20–07:35:26 UTC, snapshot `pre-0011-20261105`); see `docs/ops/neon-migrations.md`. The 2026-11-04 line that said 0011 was not applied was stale. `GET` and `PATCH /me/alert-preferences` are specified in `docs/API.md` §6a and implemented in `apps/api/src/alerts/routes.ts`. One-click unsubscribe (RFC 8058) is `POST /api/v1/alerts/unsubscribe`, specified in `docs/API.md` §6a and implemented in `apps/api/src/alerts/unsubscribe.ts`. **Nothing in the API cron or the scheduler calls `dispatchUserAlert` yet.** Those events come from `PH2-E4-04` and `PH2-E4-02` (CER). `approaching_critical` and `allowance_expiring` still have no sender. Production sends nothing until Fatih gives his production-secrets "ya" (`docs/ops/secrets.md`). Wherever the repo doesn't define a value or a behaviour, this page says **undetermined**. It invents no numbers.

**Update, 2026-11-04 (kept; the "not applied" clause is superseded above):** the dispatcher (`apps/api/src/alerts/dispatch.ts`) has Postgres stores over migration 0011, run as the `eg_api` role: `PgAlertOutboxStore` and `PgAlertPreferencesStore` in `apps/api/src/alerts/pg-store.ts` (#588). A preference reset is an UPDATE to the kind's default, never a delete (`eg_api` has no DELETE). Operator alerts (F9, F10, F11) do not use the outbox, because it has a user foreign key; their only dedupe is Resend's 24-hour idempotency key.

Owner: CEF (`F · CEF`); Rakha reviews. *Depends on `PH2-E2-05`* (the watchlist API, #427). The events that need alerts come from `PH2-E4-05`'s failure-mode list, [`docs/PH2-E4-05-FAILURE-MODES.md`](PH2-E4-05-FAILURE-MODES.md), and most of them come from the scheduler, [`docs/PH2-E4-04-SCHEDULER-DESIGN.md`](PH2-E4-04-SCHEDULER-DESIGN.md). The scheduler has a heartbeat and a dry-run evaluation; it does not call `dispatchUserAlert`. This design defines the interface it will call. It does not define when.

## 1. Scope

**In:**
- Emailing a signed-in user about their own watched entries and autopilot jobs, at the address on `users.email`.
- The user half of every `PH2-E4-05` mode that has a user alert (§3), because DoD-2 needs each of those modes to alert the user (`phase-2/PHASE2-PLAN.md:51`).
- Opt-out and preferences, dedupe, rate limiting, and an outbox that records what was sent.

**Out:**
- The operator alert. That is `PH2-E4-05`, and its channel is still undetermined.
- The decision about when an event fires. That belongs to the scheduler and the money path (`PH2-E4-04`, `PH2-E4-02`).
- The CLI's own bump notifications (`EmailChannel` as it is used today).
- Any channel other than email. Telegram is the F16 backup channel (decided by Tih, 2026-10-29); its wiring comes later and is out of scope here.
- Dashboard UI for preferences. That is WEBF's path (`apps/web`), and this design only defines the API it would call.

## 2. Recommendation in five lines

1. **Reuse, don't rebuild, the transport.** The scheduler gets one `UserAlertSender` that sends through `EmailChannel.deliver()` (`packages/engine/src/email-channel.ts:79`). That method already validates the subject and body, refuses CR/LF in headers, and derives a Resend idempotency key from the event ID and the body.
2. **Templates live in `packages/core`.** They sit next to `notification-templates.ts` (`Notification` = subject, body, severity), so the CLI, API and scheduler can't word the same event differently. The copy goes through `web-reference/design-language/claims-and-copy.md`.
3. **An outbox row is written before the send.** This is the same "intent before effect" rule as #461 §5, and its unique key on the event ID is the dedupe. A worker killed mid-send retries the same row, and Resend's idempotency key stops a second email.
4. **Money and safety alerts can't be switched off. Everything else can.** For a mode that DoD-2 requires to alert the user, an opt-out would break the definition of done.
5. **Stage it.** Stage A: templates, sender and outbox with a fake transport, all in tests. Stage B: preview-only sends to an allowlisted test address. Stage C: real users on preview. Production comes later, behind Fatih.

## 3. Which events alert the user

Every row maps to a mode in [`PH2-E4-05-FAILURE-MODES.md`](PH2-E4-05-FAILURE-MODES.md). **Required** means DoD-2 needs it and the user can't opt out of it.

| Event | Mode | Class | Severity | Notes |
|---|---|---|---|---|
| Pre-flight failed, with its reason | F1 | required | warn | Nothing was pulled. Whether a repeated reason sends again or is suppressed until the user acts is **undetermined** (F1's retry). |
| Allowance missing or expired; 30-day budget exhausted | F2 | required | warn | Includes how long autopilot has been stopped (`docs/API.md:413`). |
| Allowance about to expire | F2 | optional, on by default | info | Lead time **undetermined**. |
| Extend failed after the pull, full refund under way | F4 | required | critical | "Whole pull, fee included" (#469, #470). The entry is still unprotected. |
| Refund delayed | F6 | required | critical | The amount is owed and delayed. Never refunded from treasury. |
| Unexplained charge on the user's own money | F7 | required | critical | Sent only after reconcile confirms a difference against the chain. |
| Testnet reset | F10 | required | warn | Protection state is reset. |
| Restore lost recent changes | F19 | required | warn | Which changes is **undetermined** until the restore procedure exists. |
| Entry approaching critical with autopilot off | — | optional, on by default | warn/critical | Not one severity. Core's `approachingCritical` is `critical` when `assessEntry` health is `critical`, and `warn` otherwise (including `unknown`). The hosted draft in `templates.ts` is fixed at `warn`. The preference screen shows no chip for this kind until one rule is the sent value. Which rule is sent is a decision for Fatih (§9). |
| Extend succeeded | — | optional, **on by default** | info | Shown as a receipt. Default ON decided by Tih, 2026-10-29, for a clearer user flow. Still optional: the user can turn it off or unsubscribe. |

There is **no user email** for F3, F5, F8, F9 or F11–F15, F17 and F18. Those modes surface to the user only when they become F1, F4 or F6, or as undetermined on the dashboard (`docs/API.md:390`). This matches the user column of each mode in the E4-05 list. Whether F3's "pending" or F5's delay should also be emailed is still **undetermined** there, and this design follows whatever is decided.

## 4. Channel

- **Transport:** Resend, through the existing code. Today there are two senders:
  - `ResendMailer` (`apps/api/src/auth/mount.ts:70`) sends the sign-in code and nothing else. It is the reference for error handling: `redirect: 'manual'`, `MailerError` with no address and no provider message, and one `auth.email_send_failed` log line.
  - `EmailChannel` (`packages/engine/src/email-channel.ts:79`) has `deliver(notification, eventId)`, `mode: 'dry-run' | 'send'`, and the idempotency key `evergreen-email-<sha256(eventId, body)>`.
- **Proposal:** the scheduler builds one `EmailChannel` per send, with `to` set to the user's address and `mode: 'send'` only on preview with the flag in §6 set. **Undetermined:** whether `EmailChannel` keeps one fixed `to` per instance or gets a per-call recipient. That is a small engine change, and since `packages/engine` is Rakha's path, it is an ask in §7.
- **Sender address:** the existing `EMAIL_FROM` (`docs/API.md:35`). Whether alerts should come from a different address than sign-in codes is **undetermined**.
- **Secret:** the existing `EMAIL_API_KEY`, read through `readApiKey`, never logged. The scheduler Worker's preview secrets are DevOps' job (`docs/ops/secrets.md`).
- **A send failure is F16.** It is logged without the address and goes to the operator alert once one exists. The outbox row stays `failed` and is retried (§5).

## 5. Dedupe, rate limit, retries

- **Event ID:** stable per fact, not per tick. Examples are `job:<job_id>:refund-delayed` and `entry:<user>:<network>:<contract>:approaching:<threshold-crossing ledger window>`. The ID for the approaching alert depends on the autopilot-window rule that is still open (#461 §7), and is **undetermined** until that is decided.
- **Outbox (migration 0011, applied 2026-11-05):** one row per (user, event ID). The UNIQUE constraint is what dedupes. Status is `pending`, then `sent` or `failed`, plus the Resend email ID once accepted. **`sent` means Resend accepted the message. It does not mean the inbox received it.** `EmailChannel` returns `receivedInInbox: 'unverified'`. There is no history route. A later one must use those words and must not say delivered or received (`docs/API.md` §6a).
- **Resend idempotency:** a retry of the same row sends the same body, so Resend gets the same idempotency key. Resend's retention window for that key is **undetermined** (not read yet).
- **Rate limit per user:** a conservative cap of at most N emails per user per window, with required alerts **always** sent (decided by Tih, 2026-10-29). If the cap is hit, optional alerts are folded into the next one. **At most 5 optional alerts per user per 24 hours**, decided by Tih on 2026-10-29. Required alerts always pass and never count against it. In code: `ALERT_RATE_LIMIT` (`apps/api/src/alerts/policy.ts`).
- **Retries:** bounded, with backoff, on the next tick. The count is **undetermined** and follows E4-05's retry decisions. When retries run out, the row is `failed` and goes to the operator as F16.

## 6. User preferences and opt-out

- **Preferences:** per user, one boolean per optional event (§3). Required alerts aren't stored as preferences, because they can't be turned off.
- **Unsubscribe:** every optional alert carries a link to the dashboard preferences page (`DASHBOARD_ORIGIN` + `/dashboard/alerts/`, WEBF's screen; the page is not built in `apps/web`). One-click unsubscribe (RFC 8058) is offered for **optional alerts only** (decided by Tih, 2026-10-29). It is built: `POST /api/v1/alerts/unsubscribe?token=…` with `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on the optional-alert message. There is no `mailto:`. The token is an HMAC over the user id and the fixed purpose `alerts-optional` (every optional kind, not one kind). GET does not unsubscribe. Required alerts cannot be unsubscribed and say why they can't be turned off. The route does not send mail and does not move XLM.
- **API:** `GET` and `PATCH /api/v1/me/alert-preferences`, specified in `docs/API.md` §6a and implemented in `apps/api/src/alerts/routes.ts`. Session on both; CSRF on PATCH. The read returns every kind with the effective `enabled` (a missing optional row is the default, which is on). The write is one kind and one boolean, or `reset: true`, which updates the row to that default and does not delete it. No `updated_at`, no per-contract field, no email-verification field, and no `ALERTS_SEND` value. One-click unsubscribe is the separate unauthenticated route in §6a (`apps/api/src/alerts/unsubscribe.ts`). It sets every optional kind to `enabled: false` in one database transaction (an UPDATE, never a DELETE). Per-kind control stays on the session route. The POST accepts `multipart/form-data` (RFC 8058 §3.2) and `application/x-www-form-urlencoded`. GET returns a page that says the link itself changes nothing. PM accepted the path, the all-optional switch, the 90-day token, and `ALERTS_UNSUBSCRIBE_SECRET` (review 5903652258). Fatih still reviews the public API before merge.
- **Deactivated users** (`users.deactivated_at`) get nothing. That matches the planner rule from #477.
- **Kill switch:** `ALERTS_SEND` on the scheduler Worker, and the same name on the API Worker for the operator checks. **Sending is on only when the value is exactly `send`**, compared byte for byte with no trimming or case folding. Every other value means dry-run (render and record, never send): unset, empty, `dry-run`, a different case such as `SEND`, or added whitespace such as ` send`. It is never set to `send` in production before Fatih's "ya". Stage B adds `ALERTS_ALLOWLIST`, a list of test addresses, and anything outside it is dry-run. `ALERTS_SEND` is a plain DevOps setting. `ALERTS_ALLOWLIST` is a Worker **secret**, because it holds email addresses (`docs/ops/secrets.md`); its values are never logged or echoed. **The dashboard cannot read either Worker's value.** `GET /me/alert-preferences` does not return it. The two Workers can disagree, and the API cannot see the scheduler's environment.

## 7. Asks

**Rakha** (schema and engine). Items 1 and 2 landed as migration 0011, applied 2026-11-05. The original ask follows.
1. **An outbox table** for user alerts: `user_id`, `event_id`, `kind`, `severity`, `status`, `resend_email_id`, `attempts`, `created_at`, `sent_at`, and UNIQUE (`user_id`, `event_id`). With its grants, per the #479 checklist: INSERT and UPDATE on the status columns for `eg_scheduler`; SELECT for `eg_api` only if a history route needs it (**undetermined**). Name and migration number are your call.
2. **A preferences store:** either columns on `users` or a separate `alert_preferences` table. Your call. Grants: `eg_api` SELECT and UPDATE (that user only), `eg_scheduler` SELECT.
3. **`EmailChannel`:** a per-call recipient, or a confirmation that one instance per send is fine.
4. **Copy for each required alert:** it goes in `packages/core` alongside the existing templates. Who writes it is undetermined (CEF proposes a draft, Rakha reviews).

**DevOps:** `EMAIL_API_KEY` and `EMAIL_FROM` on the scheduler Worker's **preview** environment, plus `ALERTS_SEND` (a setting) and `ALERTS_ALLOWLIST` (a secret, `docs/ops/secrets.md`). Production waits for Fatih. One-click unsubscribe adds `ALERTS_UNSUBSCRIBE_SECRET` on the API Worker (`evergreen-api-preview` first, production after Fatih). Name only; the value is never written down. `docs/ops/` is not edited for it.

**Fatih:** decided 2026-10-29: (1) conservative per-user rate limit, required alerts always pass; (2) the receipt alert is on by default, still optional; (3) one-click unsubscribe for optional alerts only; (4) Telegram as the F16 backup channel, wired later; (5) the optional-alert rate limit is 5 per 24 hours (§5). Still his: turning production sending on, and reviewing the public unsubscribe API before merge. PM accepted on review 5903652258, which Fatih had delegated: the path `POST /api/v1/alerts/unsubscribe`, one switch for every optional kind, a 90-day token, and a separate secret `ALERTS_UNSUBSCRIBE_SECRET`. DevOps sets that secret on the preview API Worker first. Production waits for Fatih. The value is never written down.

## 8. Test plan (no network)

All of these run in Vitest with an injected `fetch` and PGlite. None of them calls Resend.
1. Each §3 event renders a `Notification` that passes `EmailChannel.deliver()`'s validation. Snapshot the subject and body, check there is no CR/LF in the subject, and check the severity matches the table.
2. Dry-run, with `ALERTS_SEND` unset, records the outbox row and makes **zero** `fetch` calls.
   - 2a. `ALERTS_SEND` set to `""` (empty) or to `dry-run`: dry-run, with the same result.
   - 2b. `ALERTS_SEND` set to `SEND`, ` send`, `send ` or `Send`: dry-run, with the same result. None of these enables sending.
   - 2c. `ALERTS_SEND` set to exactly `send`, and the recipient in `ALERTS_ALLOWLIST`: one `fetch` to the fake Resend, and the row becomes `sent`. The same value with the recipient outside the allowlist: dry-run, with zero `fetch` calls (see test 8).
3. Dedupe: the same event delivered twice gives one outbox row and one `fetch`. A crash between "row written" and "sent", followed by a retry, gives the same idempotency key.
4. Opt-out: an optional event with its preference off gives no row and no `fetch`. A required event with every preference off is still sent.
5. Rate limit: required alerts go past the cap, and optional ones are held back.
6. A deactivated user gets nothing.
7. Failure: a 4xx, 5xx, 3xx or network error from the fake Resend leaves the row `failed`, the attempts go up, and the log line contains no address, key or provider message (same as `apps/api/test/email-send-failure.test.ts`).
8. Allowlist: on preview, an address outside `ALERTS_ALLOWLIST` is dry-run.

Live proof on preview (Stage B) happens only after the code merges and DevOps sets the preview secrets. It means one email to an allowlisted test address, and evidence goes under `docs/evidence/`.

## 9. Undetermined

- When the scheduler emits each event. `PH2-E4-04` has a heartbeat and a dry-run evaluation; it does not call `dispatchUserAlert`. The money path (`PH2-E4-02`) is not built.
- The allowance-expiry lead time. Plan §3.3 says allowance renewal reminders at 30, 7 and 1 days before expiry (`PHASE2-PLAN.md`, Renewal). That schedule is not wired to `allowance_expiring`, and this design does not adopt it until Fatih says those three reminders are this email. The ledger count for `approaching_critical` is not a stored number: core grades the entry with `assessEntry` against that entry's threshold. `17,280` is the CLI default threshold, not this alert's setting.
- Retries are 3 (`DEFAULT_ALERT_MAX_ATTEMPTS`). Resend keeps an idempotency key for 24 hours (`docs/PH2-E4-05-FAILURE-MODES.md`).
- The event ID for the "approaching critical" alert, which depends on the autopilot-window rule (#461 §7).
- Whether alerts use a separate sender address.
- When the Telegram backup channel for F16 is wired (the channel itself is decided).
- The outbox and preferences schema. Landed as migration 0011 (Rakha's call, applied 2026-11-05). Who the F10 user email is addressed to is still **undetermined**: `testnetResetUserEvents` returns event ids only.
- Whether F3 "pending" and F5 "delay" are emailed (open in E4-05).
- Alert copy. Draft subjects and bodies are in `apps/api/src/alerts/templates.ts`. Whether they move to `packages/core` (recommendation 2) is still open.
