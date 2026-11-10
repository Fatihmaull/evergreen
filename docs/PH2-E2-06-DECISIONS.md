# PH2-E2-06 alert preferences: decisions still open

**Status: accepted.** The PM accepted every recommendation for items 2–7 in the review on [#608](https://github.com/Fatihmaull/evergreen/pull/608#pullrequestreview-5818648963). This is not an ADR. `docs/adr/` is for a choice that has been made. The PM decided these items before any of them is built. Where a number or a behaviour is not in the repo, this page says **undetermined**. It invents no Soroban method and no ledger count.

**Source of the questions.** Draft PR [#602](https://github.com/Fatihmaull/evergreen/pull/602) (`cursor/ph2-e2-06-alert-preferences-262f`), `web-reference/design-language/components.md` § Alert preferences, screen `/dashboard/alerts/`. The open list is at lines 453–479 of that file. Draft PR [#605](https://github.com/Fatihmaull/evergreen/pull/605) does not contain that section. It is the workshop-template branch. The questions below are #602's items 2–7. Item 1 (the preference read and write) is the subject of [#603](https://github.com/Fatihmaull/evergreen/pull/603) and is not decided here.

**What is already built, and what is not.** Migration 0011 is applied on preview and production (`docs/ops/neon-migrations.md:17`, 2026-11-05). `dispatchUserAlert` exists and is called from tests only (`apps/api/src/alerts/dispatch.ts:90`). No production caller sends a user alert. The screen `/dashboard/alerts/` is not in `apps/web`. The design header on `main` says migration 0011 is applied (`docs/PH2-E2-06-ALERTS-DESIGN.md:3`) and marks the older "not applied" clause as superseded (`docs/PH2-E2-06-ALERTS-DESIGN.md:5`). This file does not edit it: #603 already changes `docs/PH2-E2-06-ALERTS-DESIGN.md`, so no link was added there.

Citations of `main` are `origin/main` at `5a23ac9`. Citations of #603 are `cursor/ph2-e2-06-alert-preferences-832e` at `b20b728`. #603 does not change `templates.ts`, `0011_alert_outbox_and_prefs.sql`, `schema.sql`, or `packages/core`.

`apps/api/db` and the scheduler are Rakha's. A change on either needs a GitHub issue that names Rakha. A route in `apps/api/src` is CEF's, which is what #603 is.

## 2. Email verification field

Is a verification column needed before a user alert may be sent?

### Current state

`users` has `id`, `email`, `created_at`, `deactivated_at` (`apps/api/db/schema.sql:18-23`) and `reactivated_at` (`apps/api/db/0004_users_reactivated_at.sql:7`). No migration adds `email_verified` or a verified-at column. The `User` type is `id`, `email`, `createdAt` (`apps/api/src/auth/store.ts:13-18`). `GET /me` returns `{ user: { id, email, createdAt }, wallets, csrfToken }` (`docs/API.md:101`; the object is built at `apps/api/src/auth/routes.ts:93`).

An account row is created, or a deactivated row is reactivated, when `POST /auth/email/verify` accepts a one-time code (`docs/API.md:98-99`). There is no route that changes `users.email`.

#603 leaves that response alone. Its §6a says the preference route adds no verification field, and that a session means a sign-in code was accepted once (`docs/API.md:207` on that branch). The spec's three email sentences (unknown / not verified / confirmed) wait on an explicit boolean (`components.md:463-465` on #602).

### Options

1. **No new column.** Alerts go to `users.email`. The screen stays on the unknown sentence. A later alert arriving is a different fact from the sign-in code, and no boolean can assert it (`receivedInInbox` below).
2. **Stamp `email_verified_at` when the sign-in code is consumed, and refuse dispatch while it is null.** Every current account would be stamped, because that is how the row is created. New column on `users`.
3. **A second confirmation, only for product mail,** separate from the sign-in code. New column, a new message, and a gate in `decideAlert`.

### Trade-offs

Option 1 needs no migration and matches how an account is born. It does not give the screen a way to leave the unknown chip. Option 2 is a migration (Rakha, `apps/api/db`) that restates a fact the row already implies, and it still cannot say a later alert arrived. Option 3 is the only one that means something different from sign-in. It is also the only one that blocks mail the design already says goes to `users.email` (`docs/PH2-E2-06-ALERTS-DESIGN.md:12`). Whether product policy wants that second consent is **undetermined**. ADR-008 does not require it.

### Recommendation

Option 1. Do not add a verification column, and do not block user alerts on one. The sign-in code is the proof that `users.email` received mail once.

### Owner

No schema change on this recommendation. If the PM picks option 2 or 3, that is an issue for Rakha (`users` is `apps/api/db`) before CEF reads the column.

## 3. How the dashboard reads `ALERTS_SEND`

The kill switch sends only when the value is exactly `send`.

### Current state

`alertsMode` returns `send` only for the string `send`. `SEND`, ` send`, `send ` and `Send` are dry-run (`apps/api/src/alerts/policy.ts:8-14`). `decideAlert` consults it after the preference and the rate limit (`apps/api/src/alerts/sender.ts:48-61`).

No route returns it. `apps/api/src/router.ts` serves health, auth and the watchlist. `apps/web` has no `/dashboard/alerts/` page.

The design puts the switch on the scheduler Worker (`docs/PH2-E2-06-ALERTS-DESIGN.md:74`). The ops table says the scheduler Workers do not have the variable, and that scheduler code does not read it (`docs/ops/secrets.md:106`). The code that compares it lives in `apps/api/src/alerts`. On the production API Worker, Fatih set `ALERTS_SEND` to exactly `send` (K4). That value cannot be read back (`docs/ops/secrets.md:107`). It gates the operator checks. Preview's API Worker does not have it set (`docs/ops/secrets.md:105`). User dispatch has no caller, so that production value is not a user-alert send.

#603 does not return the switch. §6a says the API Worker cannot see the scheduler Worker's copy (`docs/API.md:208` on that branch). The design note on that branch says the dashboard cannot read either Worker, and the two can disagree (`docs/PH2-E2-06-ALERTS-DESIGN.md:74` on that branch).

### Options

1. **No dashboard read.** The sending line stays on the spec's unknown sentence until a documented read exists.
2. **A session field that is only the boolean `alertsMode(env.ALERTS_SEND) === 'send'`**, computed on the Worker that calls `dispatchUserAlert`. The raw string and `ALERTS_ALLOWLIST` stay on the Worker.
3. **The scheduler writes the mode somewhere the API can read** (a column or a binding), and the dashboard reads that.

### Trade-offs

Option 1 matches the code. The screen cannot show "not sending" as a known fact, which the spec separates from unknown (`components.md` sending states, #602). Option 2 preserves the byte comparison and leaks nothing, but only after the sending Worker is named. Using the production API Worker's K4 value would report the operator switch. Option 3 crosses Workers. That is a scheduler change and, if it is a table, a migration. Both are Rakha's.

Which Worker will call `dispatchUserAlert` is **undetermined**.

### Recommendation

Option 1. Do not expose `ALERTS_SEND` until the Worker that sends user alerts is named. Do not proxy the production API value.

### Owner

Naming that Worker is the scheduler (`PH2-E4-04`, Rakha). An issue that names Rakha comes before any scheduler environment is shown to the API. If the caller is the API Worker, the boolean in option 2 is CEF's route and needs no migration.

## 4. Outbox history: what `sent` means

### Current state

`alert_outbox.status` is `pending`, `sent` or `failed` (`apps/api/db/0011_alert_outbox_and_prefs.sql:41-42`). A `sent` row must have `sent_at` (lines 55-57). `resend_email_id` is "Resend's id once accepted" (line 45). `markSent` writes `sent` after `transport.deliver` returns (`apps/api/src/alerts/dispatch.ts:119-122`, `apps/api/src/alerts/pg-store.ts:90-99`).

`EmailChannel` returns `status: 'accepted'` and `receivedInInbox: 'unverified'` (`packages/engine/src/email-channel.ts:17-24` and `175-180`). The design says accepted is not received (`docs/PH2-E2-06-ALERTS-DESIGN.md:63`). There is no history route on `main`. `eg_api` already has `SELECT` on `alert_outbox` (0011 line 75). `eg_scheduler` has no grant on the table (line 84).

#603 does not list the outbox. §6a says a later route must keep `sent` as "Resend accepted", with inbox delivery unverified, and must not say delivered or received (`docs/API.md:209` on that branch). The spec maps `sent` to the word `accepted` and forbids the healthy chip (`components.md` outbox paragraph, #602, after line 440).

### Options

1. **No history route.** The column stays as it is. The screen shows no list.
2. **A later session route lists the caller's rows.** The JSON value stays `sent`. The documented meaning, and the screen's word, are "accepted". Inbox delivery stays unverified. No new column.
3. **Rename the status to `accepted`, or add a received flag.**

### Trade-offs

Option 1 leaves the spec's history unbuilt, which the spec already requires until a route is in `docs/API.md`. Option 2 needs no migration: `SELECT` is already granted to `eg_api`. It keeps the queue word and the screen word apart on purpose, so a reader does not treat acceptance as delivery. Option 3 is a migration (Rakha) and a code change to every writer of `sent`. A received flag cannot be set: the channel's result is `unverified`, and nothing in this repo reads an inbox.

### Recommendation

Option 2's wording, and option 1's scope. Lock the meaning now: `sent` means Resend accepted the message. Inbox delivery is unverified. Do not build the route in the preference work. Do not add a received column.

### Owner

The route, when the PM asks for it, is CEF (`apps/api`). No issue for Rakha unless the PM asks for a schema change. That change should not be a received flag.

## 5. Ledger count for `approaching_critical`, and how early `allowance_expiring` is sent

### Current state

Both are **undetermined** in the alerts design (`docs/PH2-E2-06-ALERTS-DESIGN.md:39` for the allowance lead, `:45` and `:62` for the approaching alert, `:108` in the undetermined list). `renderAlertEmail` takes an optional free-text `detail` and no ledger count (`apps/api/src/alerts/templates.ts:10-18`, `93-129`). `alert_preferences` has no threshold column. Its key is `(user_id, kind)` (`apps/api/db/0011_alert_outbox_and_prefs.sql:64-71`).

`watch_items.threshold_ledgers` is the autopilot threshold (`apps/api/db/schema.sql:75`). `DEFAULT_WARN_LEDGERS` is 120,960 and `DEFAULT_CRITICAL_LEDGERS` is 17,280 (`packages/core/src/health.ts:116-128`). Those grade scan and engine health. They are not this alert's setting. The spec says not to print either as the alert's ledger (`components.md:275-282` on #602).

TTL is a count of ledgers. A day count is an estimate: ledgers close roughly every 5–6 seconds, and remaining 0 is still live (`docs/SOROBAN-PRIMER.md:9-15` and the inclusive-boundary section). On the testnet configuration recorded in the primer, `min_temporary_ttl` is 720 and a measured temporary lifetime was 720 ledgers (`docs/SOROBAN-PRIMER.md:157-159`). 17,280 is already above that fresh lifetime. The same line records `max_entry_ttl = 3110400`, so an extended temporary entry can outlive 17,280. `assessEntry` marks a low temporary entry `critical` because expiry deletes it (`packages/core/src/health.ts:260-268`). No code here calls `assessEntry` to decide this email.

The allowance is an `approve` with a `live_until_ledger` (ADR-007, the SEP-41 section). ADR-007 and the phase-2 plan both say renewal reminders at 30, 7 and 1 days (`docs/adr/ADR-007-allowance-funded-hosted-engine.md:93`, `phase-2/PHASE2-PLAN.md:233-235`). Nothing wires those three instants to the kind `allowance_expiring`. The failure-mode detector for the allowance read is still pending on the scheduler (`apps/api/src/alerts/failure-modes.ts:101-104`).

#603 does not decide either number (`docs/API.md:212` on that branch). Its design note quotes the 30 / 7 / 1 schedule and does not adopt it (`docs/PH2-E2-06-ALERTS-DESIGN.md:108` on that branch).

The event id for the approaching alert depends on the autopilot-window rule, which is still open (`docs/PH2-E2-06-ALERTS-DESIGN.md:62`, #461 §7). That id is **undetermined**.

### Options

1. **Send neither kind until the PM names the rule.** The screen keeps both "undetermined" sentences. Do not borrow 17,280, 120,960, `threshold_ledgers`, or 30 / 7 / 1.
2. **Borrow the numbers already written elsewhere.** Approaching: `assessEntry` against `DEFAULT_THRESHOLDS`. Allowance: the three ADR-007 reminders, one preference covering all three.
3. **One user-chosen line for approaching, and one reminder for the allowance.** Approaching fires from `watch_items.threshold_ledgers` when that column is set, and does not fire when it is null. Allowance fires once, at a lead the PM still has to name.

### Trade-offs

Option 1 sends nothing for the product's core optional alert until a rule exists. It avoids treating a health default, an autopilot threshold, or a day estimate as the alert. Option 2 reuses numbers that were written for something else. 17,280 is above the fresh temporary lifetime in the primer and below `max_entry_ttl`, so it is not a temporary entry's lifetime. The 30 / 7 / 1 figures are wall-clock estimates against a `live_until_ledger`. Three reminders also consume three of the five optional slots (`apps/api/src/alerts/policy.ts:94-97`). Option 3 uses a number the user set, and it is silent when the column is null. The approaching event id is still **undetermined** under all three, because the window rule is open.

How many days of ledgers equal 30, 7 or 1 is **undetermined**. This page does not multiply by a seconds-per-ledger guess.

### Recommendation

Option 1. Do not emit `approaching_critical` or `allowance_expiring` until the PM names the remaining-ledger comparison and the allowance lead. The 30 / 7 / 1 schedule and the health defaults stay written where they are. They are not this email's setting unless the PM says so.

### Owner

Emitting either kind is the scheduler (`PH2-E4-04`, Rakha) and the allowance read (`PH2-E4-02`, Rakha). An issue that names Rakha comes before that code. No new column on this recommendation. CEF's templates already render without a count.

## 6. Severity of `approaching_critical`

`templates.ts` says `warn`. Core can return `critical`. Which one is sent?

### Current state

The user-alert copy hard-codes `warn` (`apps/api/src/alerts/templates.ts:67-71`). `planUserAlert` sends that severity (`apps/api/src/alerts/plan.ts:54-62`). The core template `approachingCritical` sets `critical` when `assessEntry` returns `critical`, and `warn` otherwise, including `unknown` (`packages/core/src/notification-templates.ts:106-123`). Its comment says the severity comes from `assessEntry` so the email and the CLI do not disagree.

The design table records the severity as `warn/critical` (`docs/PH2-E2-06-ALERTS-DESIGN.md:45`). The outbox accepts `info`, `warn` or `critical` (`apps/api/db/0011_alert_outbox_and_prefs.sql:39-40`). Nothing calls `dispatchUserAlert` for this kind, so neither file has won a real send.

#603 does not change `templates.ts` or `notification-templates.ts`. The spec leaves the row without a chip until one value is the sent value (`components.md:474-476` on #602).

`assessEntry` returns `critical` for an expired entry, a low temporary entry, and a low entry shared by more than one contract, and `warning` for a low recoverable entry that affects one contract (`packages/core/src/health.ts:230-295`). Which of those the alert uses is **undetermined** until item 5 names the comparison.

### Options

1. **`templates.ts` wins.** The user email is always `warn`. Core stays the CLI template. The screen can show the warning chip.
2. **Core wins.** The user email uses `approachingCritical`'s rule: `critical` when `assessEntry` is `critical`, otherwise `warn`. `templates.ts` stops hard-coding `warn` for this kind.
3. **Neither wins yet.** The sent severity stays undetermined. The screen shows no chip. Option 2 applies after item 5 has a rule.

### Trade-offs

Option 1 is a one-line story and it splits the user email from the CLI on the same entry, which is the split `approachingCritical` was written to avoid. Option 2 keeps one severity and cannot be applied honestly until item 5 says when the entry is assessed. Option 3 matches the spec and blocks a chip that would pretend the question is closed.

### Recommendation

Option 3 now. After the PM names the ledger rule in item 5, option 2: take the severity from `assessEntry`, and stop hard-coding `warn` in `templates.ts`.

### Owner

The template change is CEF (`apps/api/src/alerts/templates.ts`). Calling `assessEntry` is the scheduler's emit, which is Rakha (`packages/core` and the scheduler). That call needs an issue that names Rakha. Do not change `assessEntry` itself for this.

## 7. Whether F3 and F5 are delivered by email

### Current state

The design lists no user email for F3 or F5, and leaves a pending notice and a delay notice **undetermined** (`docs/PH2-E2-06-ALERTS-DESIGN.md:48`). The failure-mode list says the same: F3 tells the user once the outcome is known, and whether to say "pending" earlier is undetermined (`docs/PH2-E4-05-FAILURE-MODES.md:79-85`); F5 sends nothing per attempt, F4 if it finally fails, and a delay notice is undetermined (`:95-101`).

In code, F3's user alert is `via` F4 and F5, and F5's is `via` F4 (`apps/api/src/alerts/failure-modes.ts:106-120`). `ALERT_SPECS` has no F3 or F5 kind (`apps/api/src/alerts/policy.ts:59-71`). The 0011 kind check would reject a new kind until a migration replaces it (`apps/api/db/0011_alert_outbox_and_prefs.sql:34-38`).

#603 repeats that F3 and F5 have no kind and are not decided (`docs/API.md:212` on that branch; `docs/PH2-E2-06-ALERTS-DESIGN.md:48` and `:114` on that branch). The spec has no row for them (`components.md:477` on #602).

F3's submitted-hash column is not on `main` (`docs/PH2-E4-05-FAILURE-MODES.md:80`). F5's retry count is **undetermined** (`:100`).

### Options

1. **No user email for F3 or F5.** The user hears a final outcome: `extend_failed_refund` (F4), `extend_succeeded`, or `refund_delayed` (F6).
2. **One email when a pull is submitted and the outcome is still unknown** (F3 "pending"). New kind. Required or optional is itself **undetermined**.
3. **One email when an extend is delayed** (F5), after a retry bound. The bound is **undetermined**. This page does not pick a count.

### Trade-offs

Option 1 matches the design's "no user email" list and the `via` links in code. A pending mail can be wrong by the next tick, when the outcome is F4 or success. Option 2 needs a new kind, a CHECK migration, and a detector that the failure-mode list says is missing. Option 3 needs the same, plus a retry count nobody has set. Both 2 and 3 add a row the screen does not have.

### Recommendation

Option 1. Do not email F3 or F5. Leave the failure-mode sentences as they are until the PM reopens them. No new kind.

### Owner

No change. If the PM later picks option 2 or 3, the kind CHECK is a migration on `apps/api/db` (Rakha) and the emit is the scheduler (Rakha). Both need an issue that names Rakha. The screen row would be a separate WEBF change after `docs/API.md` names the kind.

## Per-contract overrides

None exist. This is a fact, not a choice this page is making up.

`alert_preferences` is `(user_id, kind)` (`apps/api/db/0011_alert_outbox_and_prefs.sql:64-71`). The optional kinds are `allowance_expiring`, `approaching_critical`, `extend_succeeded`. There is no contract column. The spec says the screen has no per-contract switch (`components.md:440` on #602). #603 refuses a `contractId` on the preference body with `400` (`docs/API.md:206` on that branch).

Do not add a per-contract override on this card. A later one is a migration (Rakha) and needs an issue that names Rakha.

## What this page does not decide

- The preference HTTP shape. That is #603.
- A ledger count, a day count, or a Soroban call. Item 5 stays undetermined on purpose.
- Production sending. `ALERTS_SEND` on the production API Worker is already Fatih's K4 for operator mail (`docs/ops/secrets.md:107`). User alerts still have no caller.
