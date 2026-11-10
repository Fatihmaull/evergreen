# PH2-E2-06: which Worker sends, and the ledger leads

**Status: proposed. Nothing here is accepted.** This is not an ADR. It builds on [`docs/PH2-E2-06-DECISIONS.md`](PH2-E2-06-DECISIONS.md). The PM accepted every recommendation for items 2–7 in the review on [#608](https://github.com/Fatihmaull/evergreen/pull/608#pullrequestreview-5818648963). This page does not reopen those items. It answers the two questions that review left standing: which Worker calls `dispatchUserAlert`, and what ledger comparison item 5 was waiting for. Nothing in this page is implemented.

Citations are `origin/main` at `efed7fa` unless a line says otherwise. Where a number or a behaviour is not in the repo, or is not an official Stellar page this text can point at, this page says **undetermined**. It invents no Soroban method.

`apps/api/db` and the scheduler are Rakha's, as the accepted page states. A change on either needs a GitHub issue that names Rakha. `BACKLOG.md` marks the card `PH2-E4-04` as `F · CEF`. That letter does not change the path rule.

## A. Which Worker sends user alerts

`evergreen-api` (`scheduled()` in `apps/api`) or `evergreen-scheduler` (`apps/scheduler`)?

### Current state

`dispatchUserAlert` exists and is called from tests only (`apps/api/src/alerts/dispatch.ts:90`). `scheduled()` in `apps/api/src/index.ts` runs the operator checks and does not call it (`apps/api/src/index.ts:36-92`). The scheduler's `scheduled` runs a tick and a dry-run evaluation (`apps/scheduler/src/index.ts:60-62`). It does not import `apps/api`.

Migration 0011 names the sender. Its header says the sender is `eg_api` (the API cron), and that `eg_scheduler` gets nothing on these tables, in particular no `SELECT` on `users.email` (`apps/api/db/0011_alert_outbox_and_prefs.sql:19-21` and `:84`). The grants that follow are `SELECT`, column `INSERT` and column `UPDATE` for `eg_api` only (`:73-81`).

The design still says the scheduler builds the sender (`docs/PH2-E2-06-ALERTS-DESIGN.md:25` and `:55`) and puts `ALERTS_SEND` on the scheduler Worker as well as on the API Worker (`:74`). This page does not edit that file. #603 already changes it.

**Resend secret, names only.** The API Worker comment lists `EMAIL_API_KEY` as the Resend API key (`apps/api/wrangler.jsonc:6`). `EMAIL_FROM` is a plain var on both API environments (`:44` and `:68`), not a secret. The secret inventory, names only, shows `EMAIL_API_KEY` on `evergreen-api` and on `evergreen-api-preview` (`docs/ops/secrets.md:11-12`). The production scheduler's secret list is `DATABASE_URL` only (`:13`). The preview scheduler's list is `DATABASE_URL` and `TICK_TOKEN` (`:14`). Neither scheduler name is `EMAIL_API_KEY`. The scheduler settings table has the same two secrets and no mail key (`apps/scheduler/README.md:31-37`). The README still says this package has no `wrangler.jsonc` (`:39`). The file is there: `apps/scheduler/wrangler.jsonc`. Its secret comment is `DATABASE_URL` and `TICK_TOKEN` (`apps/scheduler/wrangler.jsonc:6-8`).

**`ALERTS_SEND`.** Sending is on only when the value is exactly `send`. `SEND`, ` send`, `send ` and `Send` are dry-run (`apps/api/src/alerts/policy.ts:8-13`). `decideAlert` returns `dry-run` / `alerts_send_off` unless that comparison passes, and then returns `dry-run` / `not_allowlisted` unless the recipient is on `ALERTS_ALLOWLIST` (`apps/api/src/alerts/sender.ts:56-60`). Production `evergreen-api` has `ALERTS_SEND` set to exactly `send` (K4, Fatih). The value cannot be read back (`docs/ops/secrets.md:107`). Preview `evergreen-api-preview` does not have `ALERTS_SEND` set (`:105`). Both scheduler Workers do not have it set, and the scheduler code does not read it (`:106`). A secret named `ALERTS_ALLOWLIST` exists on both API Workers (`:105` and `:107`). It is not set on either scheduler Worker.

**Failure isolation, as landed in #604.** Each of F11, F10 and F9 catches a failed deliver per recipient, logs `action: 'send_failed'`, and goes on to the next recipient. The check does not throw, so the later checks still run (`apps/api/src/alerts/heartbeat.ts:91-96` and `:119-129`; `apps/api/src/alerts/testnet-reset.ts:80-96`; `apps/api/src/alerts/slow-tick.ts:104-108` and `:133-143`). The log line is allowed to carry `httpStatus` or `errorName`. It does not carry the address, the key, the provider body, or the thrown message (`apps/api/src/alerts/operator-send.ts:1-7` and `:19-24`). `scheduled()` says the same: a failed Resend send is contained, and the logs never carry an address or a key (`apps/api/src/index.ts:32-35`). The cron test runs that handler on PGlite with `fetch` faked (`apps/api/test/cron-scheduled.pglite.test.ts:1-11`). `dispatchUserAlert` has its own `try/catch` around `deliver`: a transport throw becomes `markFailed` and `{ action: 'failed' }`, and the function does not throw that error (`apps/api/src/alerts/dispatch.ts:118-126`). That catch does not write a `send_failed` line. A throw from the store (`claim`, `beginAttempt`, `markFailed`) still rejects the caller.

**Cron.** Production `evergreen-api` has `triggers.crons: ["*/15 * * * *"]` (`apps/api/wrangler.jsonc:25`). `evergreen-api-preview` has `triggers.crons: []` (`:48-51`). Production `evergreen-scheduler` has the same `*/15` expression (`apps/scheduler/wrangler.jsonc:16`). `evergreen-scheduler-preview` has `triggers.crons: []` (`:25-29`). The API comment says `scheduled()` runs only if a cron trigger is configured (`apps/api/src/index.ts:32-33`). The preview scheduler's tick is `POST /tick`, and that route is off unless `TICK_TOKEN` is set (`apps/scheduler/src/worker.ts:6-9`). The reason recorded for an empty preview cron is the Neon allowance: 100 CU-hours per project, so two branches ticking every 15 minutes would not fit (`apps/scheduler/README.md:11-15`).

**Neon.** The API cron reads with `neonSqlClient(env.DATABASE_URL)` (`apps/api/src/index.ts:42-46`). The scheduler tick and evaluation use `neon(databaseUrl)` (`apps/scheduler/src/index.ts:24` and `:43`). K5: production `DATABASE_URL` on the two Workers is the `eg_api` and `eg_scheduler` roles (`docs/ops/secrets.md:24`). `eg_api` can read `scheduler_ticks` (migration 0009, `docs/ops/neon-migrations.md:15`). `eg_scheduler` can read `watch_items`, `wallets`, `users (id, reactivated_at, deactivated_at)`, `jobs` and `fee_ledger`. That user-column list has no `email` (`apps/scheduler/README.md:23`). The evaluation logs due counts and writes nothing (`apps/scheduler/README.md:19-21`). Nothing in `apps/api`, `packages/engine` or `apps/scheduler` inserts into `observations` (`BACKLOG.md`, the `PH2-E3-02` row).

**Tests.** The API cron test is PGlite plus a mocked Neon driver plus a `fetch` that records the Resend request (`apps/api/test/cron-scheduled.pglite.test.ts:8-11`). The user-alert unit tests stub global `fetch` so it throws, and pass a fake transport (`apps/api/test/alerts-dispatch.test.ts:1-3`). The outbox store test is PGlite (`apps/api/test/alerts-pg-store.pglite.test.ts:1-2`). The scheduler's PGlite tests cover the heartbeat and the evaluation (`apps/scheduler/test/heartbeat.pglite.test.ts`, `apps/scheduler/test/evaluate.pglite.test.ts`). Its RPC tests inject `fetch` for `getLedgerEntries` (`apps/scheduler/test/due.test.ts:3`, `apps/scheduler/test/tick.test.ts`). No scheduler test sends mail.

### Options

1. **`evergreen-api` `scheduled()` sends.** The call sits in `apps/api/src/index.ts`, next to F11, F10 and F9, using the `EMAIL_API_KEY` and `ALERTS_SEND` that Worker already has. `eg_api` already holds the outbox grants.
2. **`evergreen-scheduler` `scheduled()` sends.** This matches the design's sentence that the scheduler builds the sender. It needs the mail secret, the kill switch, a grant on `users.email` and the outbox, and a send path the scheduler does not have.
3. **Name nobody yet.** `dispatchUserAlert` stays test-only. Item 3 of the accepted page stays as written: the dashboard does not read `ALERTS_SEND` until a Worker is named.

### Trade-offs

**Where the Resend secret lives.** Option 1 uses `EMAIL_API_KEY`, already listed for `evergreen-api` and `evergreen-api-preview`. Option 2 needs that name bound on `evergreen-scheduler` and `evergreen-scheduler-preview`, which do not have it, plus `EMAIL_FROM`, which the scheduler config does not define. Binding a secret is DevOps' `wrangler secret put`. Reading it is scheduler code.

**`ALERTS_SEND`, exact value `send`.** Option 1 runs on a production Worker where that value is already exactly `send` (K4). `decideAlert` still dry-runs a recipient who is not on `ALERTS_ALLOWLIST`. The production allowlist is the operator list (contents unreadable). A user address is dry-run until it is on that list. Preview's API Worker has no `ALERTS_SEND`, so `alertsMode` is dry-run there even for an allowlisted address. Option 2 starts from unset on both scheduler Workers, so the kill switch is dry-run until someone sets exactly `send` on the scheduler. That is a second switch, separate from K4. Option 3 leaves K4 as the operator switch only, which is what it is today.

**Failure isolation (#604).** Option 1 has the pattern in the same `scheduled()`: per-recipient `try/catch`, a `send_failed` line, and the other checks keep running. `dispatchUserAlert` already swallows a transport throw, and it does not log `send_failed`. A store throw still rejects `scheduled()`, which would skip whatever check has not run. The call has to sit in the same kind of per-recipient `try/catch` the operator checks use, so one user failure logs `send_failed` and F11, F10 and F9 still run. Option 2 has no send path to copy that into. The isolation would be new scheduler code. Option 3 adds no failure path.

**Cron.** Both production Workers already fire `*/15 * * * *`. Cadence does not choose between them. `evergreen-api-preview` has `triggers.crons: []`, so its `scheduled()` does not fire on a timer. `evergreen-scheduler-preview` is the same, and its manual path is `POST /tick`, which does not send mail. A preview proof of option 1 is a manual scheduled dispatch, the same shape the failure-mode list already describes for the operator checks. This page does not ask for a preview cron. The empty preview crons are the recorded Neon allowance choice.

**Neon.** Option 1 reads and writes the outbox as `eg_api`, which 0011 already grants, and it can read `scheduler_ticks`. It cannot see a remaining TTL or an allowance expiry in a table: the evaluation writes nothing, and `observations` has no insert from this code. Option 2's role cannot `SELECT` `users.email` and cannot touch `alert_outbox` or `alert_preferences` until a migration says so. That migration is `apps/api/db`. Option 3 leaves the grants as they are.

**Ownership.** Option 1 is `apps/api/src`, the path the accepted page calls CEF's. It needs no issue for Rakha. Option 2 is `apps/scheduler` and a grant migration in `apps/api/db`. Both need an issue that names Rakha before the code. Option 3 needs no issue.

**Tests.** Option 1 extends a handler the PGlite cron test already runs, with `fetch` mocked, beside unit tests that stub `fetch`. Option 2's PGlite tests and injected `fetch` cover the tick and the RPC read. They do not cover Resend. A mail test there would be new. Option 3 keeps the tests that exist.

### Recommendation

Option 1. `evergreen-api`'s `scheduled()` is the Worker that sends user alerts. Keep `decideAlert`'s allowlist gate. Wrap each recipient in the #604 `try/catch`, log `action: 'send_failed'` with no address and no key, and let F11, F10 and F9 run. Do not bind `EMAIL_API_KEY` onto the scheduler for this, and do not grant `eg_scheduler` the outbox.

Naming the Worker does not emit `approaching_critical` or `allowance_expiring`. The accepted item 5 still holds until the comparison in B is accepted and some later card stores the ledgers `eg_api` can read. This page does not reopen item 3: the dashboard still does not read `ALERTS_SEND`.

### Owner

The call in `apps/api/src/index.ts` is CEF (`PH2-E2-06`). No issue for Rakha on this recommendation. If the PM picks option 2, the issue that names Rakha comes first, and it covers `apps/scheduler` and `apps/api/db`.

## B. Ledger comparison for `approaching_critical`, and the 30 / 7 / 1 allowance lead

### Current state

Both kinds are optional and on by default (`apps/api/src/alerts/policy.ts:62` and `:68`). No caller emits them. The accepted item 5 says they stay unemitted until the PM names the comparison and the lead.

The only TTL comparison the lint allows is `needsAction`: `remainingLedgers <= thresholdLedgers` (`packages/core/src/ttl.ts:155-167`). `assessEntry` uses that comparison (`packages/core/src/health.ts:245-246`). Above the threshold the health is `healthy` (`:248-257`). At or below it, a temporary entry (`endBehavior: 'deleted'`) is `critical` (`:260-268`), a shared entry is `critical` (`:272-281`), and an exclusive recoverable entry is `warning` (`:284-295`). A scan marks `kind === 'temporary'` as `endBehavior: 'deleted'` (`packages/core/src/scan-contract.ts:305-306`). `remainingLedgers === 0` is still live (`packages/core/src/ttl.ts:16-17`, `docs/SOROBAN-PRIMER.md:17-31`). `<=` includes that last live ledger on purpose (`packages/core/src/ttl.ts:155-157`).

`approachingCritical` calls `assessEntry(entry, thresholdLedgers)` and sets severity `critical` only when that health is `critical`. Otherwise, including `unknown`, it sets `warn` (`packages/core/src/notification-templates.ts:106-123`). The hosted copy hard-codes `warn` (`apps/api/src/alerts/templates.ts:67-71`). Accepted item 6 says: once this comparison is named, take the severity from `assessEntry` and stop hard-coding `warn`.

`DEFAULT_CRITICAL_LEDGERS` is 17,280 and `DEFAULT_WARN_LEDGERS` is 120,960 (`packages/core/src/health.ts:116-128`). The comment calls them ~1 day and ~7 days (`:103-104`). The test pins that reading: `LEDGERS_PER_DAY = (24 * 60 * 60) / SECONDS_PER_LEDGER`, then `DEFAULT_WARN_LEDGERS / LEDGERS_PER_DAY === 7` and `DEFAULT_CRITICAL_LEDGERS / LEDGERS_PER_DAY === 1` (`packages/core/test/thresholds.test.ts:14-26`). `SECONDS_PER_LEDGER` is 5 (`packages/core/src/ttl.ts:32`). Those two constants grade scan and engine health. The design says 17,280 is the CLI default threshold and is not this alert's setting (`docs/PH2-E2-06-ALERTS-DESIGN.md:108`).

`watch_items.threshold_ledgers` is the autopilot column (`apps/api/db/schema.sql:74`). The check requires it only while autopilot is on (`:84-87`). The scheduler's due verdict is `needsAction(min remaining, item.thresholdLedgers)` (`apps/scheduler/src/due.ts:10-16` and `:165-166`). That is the autopilot-on line. This alert is the autopilot-off row (`docs/PH2-E2-06-ALERTS-DESIGN.md:45`).

The allowance lead in the ADR is wall-clock: renewal reminders at 30, 7 and 1 days (`docs/adr/ADR-007-allowance-funded-hosted-engine.md:93`). The plan says the same, "before" expiry (`phase-2/PHASE2-PLAN.md:235`). The expiry the repo reads is a ledger. `readAllowance` calls `getLedgerEntries` on the SAC allowance key and takes `expiration_ledger` as `liveUntilLedger`, with `observedAtLedger` from that response's `latestLedger` (`apps/web/src/lib/allowance.ts:50-57`, `:89`, `:117` and `:125-133`). ADR-007's name for the `approve` argument is `live_until_ledger` (`docs/adr/ADR-007-allowance-funded-hosted-engine.md:32`). Remaining ledgers are `liveUntilLedgerSeq - currentLedgerSeq` (`docs/SOROBAN-PRIMER.md:11-13`). No alert code performs this read. The F2 detector is still pending on the scheduler (`apps/api/src/alerts/failure-modes.ts:101-104`). `ENGINE_SPENDER` is `undefined`, so the web module makes no chain call (`apps/web/src/lib/allowance.ts:5-11` and `:42`).

**The 5-second figure is an assumption for display, and a measurement, and not a guarantee.** `SECONDS_PER_LEDGER = 5` is "the simple display path" and records "~5s on testnet (measured over 100,000 ledgers, 2026-09-05)" (`packages/core/src/ttl.ts:26-32`). `estimateEndsAt` says the truth is the ledger number and cadence is measured rather than guaranteed (`:169-171`). `MEASURED_TESTNET_CADENCE` stores `secondsPerLedger: 5`, `uncertaintySecondsPerLedger: 0.0008`, and a basis of two measurements: 5.000 s/ledger over that 100,000-ledger Horizon sample, and 5.0008 s/ledger over 16.3 hours. The 0.0008 is the spread between those two measurements, not a variance (`:193-231`). The primer says ledgers close roughly every 5–6 seconds, so a wall-clock conversion is an estimate (`docs/SOROBAN-PRIMER.md:15`), and its wall-clock column assumes ~5s per ledger and is an estimate (`:161`). Stellar's own docs say nodes update the ledger about every 5 seconds, that the target close time is a network setting that can change, and that a single ledger can take longer to close ([Stellar Stack](https://developers.stellar.org/docs/learn/fundamentals/stellar-stack), Stellar Core; the same sentence is on [Validators](https://developers.stellar.org/docs/validators)). That page states no integer seconds and no ledger count for 30, 7 or 1 days.

### The conversion, derived from `SECONDS_PER_LEDGER = 5`

The test's day length is `(24 * 60 * 60) / SECONDS_PER_LEDGER` = `86400 / 5` = **17,280 ledgers per day**. Under that assumption, and only under that assumption:

| Lead in the ADR | Derived ledgers | Arithmetic |
|---|---|---|
| 1 day | 17,280 | `1 * 86400 / 5` |
| 7 days | 120,960 | `7 * 86400 / 5` |
| 30 days | 518,400 | `30 * 86400 / 5` |

17,280 and 120,960 are the same integers as `DEFAULT_CRITICAL_LEDGERS` and `DEFAULT_WARN_LEDGERS`. The test is what says those constants are 1 day and 7 days at this rate. 518,400 is not a named constant in `packages/core/src`. It is 30 days times the test's `LEDGERS_PER_DAY`. A later edit to a health tier must not move an allowance reminder, so the lead is the day count times `(24 * 60 * 60) / SECONDS_PER_LEDGER`, not an import of `DEFAULT_WARN_LEDGERS`.

The same assumption meets the plan's cap. `max_entry_ttl` on the recorded testnet configuration is 3,110,400 (`docs/SOROBAN-PRIMER.md:157`). `17280 * 180 = 3110400`, so 3,110,400 ledgers is 180 days at 5 seconds. The plan says `live_until_ledger` is at most current + 3,110,399 (`phase-2/PHASE2-PLAN.md:196`) and that expiry is at most about 180 days (`:234`). 3,110,399 is one ledger under 180 days at this rate. ADR-007's "about every 180 days" is the same phrase (`docs/adr/ADR-007-allowance-funded-hosted-engine.md:34`).

A conversion at 5.0008 s/ledger is **undetermined** here. That figure is the other end of the recorded spread. Dividing by it does not land on an integer this repo stores, and this page does not publish a rounded one.

The configured temporary minimum is 720 ledgers, and the configured persistent minimum is 120,960 (`docs/SOROBAN-PRIMER.md:157-159`). 720 is below 17,280. 120,960 is above 17,280.

### Options

1. **Name both rules from the constants above.** `approaching_critical` calls `approachingCritical` with `thresholdLedgers = DEFAULT_CRITICAL_LEDGERS` (17,280). Severity stays `assessEntry`'s, which accepted item 6 already chose. `allowance_expiring` fires at the three derived leads, 518,400 and 120,960 and 17,280, using `needsAction(liveUntilLedger - observedAtLedger, lead)`.
2. **Use the watch-item column for the entry, and leave the allowance lead unnamed.** `approaching_critical` fires only when `threshold_ledgers` is set, compared with `needsAction`. `allowance_expiring` stays unemitted. The 30 / 7 / 1 conversion above is written down and not adopted.
3. **Adopt neither.** Both kinds stay unemitted, which is the accepted item 5. The derived counts stay on this page as arithmetic, not as a setting.

### Trade-offs

Option 1 gives the kind named `approaching_critical` the line the health module calls the action tier, one day at the 5-second assumption, and it gives the allowance the three leads the ADR already wrote, in ledgers. An exclusive persistent entry at or below 17,280 is health `warning` inside `assessEntry`, so the email severity is `warn`. `critical` from that function is the expired entry, the shared entry, and the temporary entry. A fresh temporary entry at the configured minimum of 720 ledgers is already below 17,280, and `assessEntry` marks it `critical` because it is deleted at expiry. Whether temporary entries need a different line is **undetermined**. This page does not invent one. The 17,280 figure is a display assumption. A ledger that closes in 6 seconds, the other end of the primer's "5–6 seconds", would make these leads a different wall-clock time. That other conversion is **undetermined**.

Option 2 uses a number the user stored. The column is required only while autopilot is on, and this alert is the autopilot-off case, so a null column sends nothing. The allowance lead stays the open question item 5 already recorded.

Option 3 changes no behaviour. The screen keeps the undetermined sentences. The ADR's three days stay in days.

All three leave the event id **undetermined**. The approaching id depends on the autopilot-window rule (`docs/PH2-E2-06-ALERTS-DESIGN.md:62`). No code names the three allowance event ids. All three also leave the reader **undetermined**: `scheduled()` has no stored `remainingLedgers` and no stored `liveUntilLedger` to compare. The web read is the shape of the two numbers, and it does not run while `ENGINE_SPENDER` is unset.

### Recommendation

Option 1 for the rule, and no emit until the ledgers are stored where `eg_api` can read them.

- `approaching_critical`: `approachingCritical(entry, key, DEFAULT_CRITICAL_LEDGERS)`. The comparison inside that call is `needsAction`, so the entry is in the alert when `remainingLedgers <= 17280`. Severity is `assessEntry`'s health, per accepted item 6. Do not read `watch_items.threshold_ledgers` for this kind.
- `allowance_expiring`: one kind, three crossings, at 518,400, 120,960 and 17,280 ledgers of remaining life, each computed as `days * (24 * 60 * 60) / SECONDS_PER_LEDGER` with `SECONDS_PER_LEDGER = 5`. The comparison is `needsAction(liveUntilLedger - observedAtLedger, lead)`. The two ledger fields are the ones `RawAllowance` already has. No new Soroban method.

Do not treat 518,400 as a protocol constant. Do not treat 17,280 or 120,960 as the allowance setting by importing the health constants; the match is the shared 5-second assumption. The 5.0008 measurement, a close time of 6 seconds, a temporary-only threshold, and both event ids stay **undetermined**.

### Owner

Emitting either kind from `scheduled()` is CEF once the rule is accepted and the rows exist (`apps/api/src`). Storing the scan or the allowance ledgers for that cron to read is a migration or scheduler work, and that part needs an issue that names Rakha. This page does not open the issue and does not add the column.

## What this page does not decide

- Items 2–7 of [`docs/PH2-E2-06-DECISIONS.md`](PH2-E2-06-DECISIONS.md). Those recommendations are accepted.
- A dashboard read of `ALERTS_SEND`.
- A preview cron. Both preview Workers keep `triggers.crons: []`.
- A new table, a new grant, or a new Soroban method.
- The design file `docs/PH2-E2-06-ALERTS-DESIGN.md`. #603 changes it. If this page is accepted, the sentence that says the scheduler sends is a later edit.

## Numbers

Every figure above, and where it comes from.

| Figure | What it is here | Source |
|---|---|---|
| `send` | The only `ALERTS_SEND` value that sends | `apps/api/src/alerts/policy.ts:11-13` |
| `*/15 * * * *` | Production cron, both Workers | `apps/api/wrangler.jsonc:25`, `apps/scheduler/wrangler.jsonc:16` |
| `[]` | Preview cron, both Workers | `apps/api/wrangler.jsonc:51`, `apps/scheduler/wrangler.jsonc:29` |
| 100 | CU-hours, the recorded reason preview does not tick | `apps/scheduler/README.md:15` |
| 5 | `SECONDS_PER_LEDGER` | `packages/core/src/ttl.ts:32` |
| 5.000 | s/ledger, 100,000-ledger Horizon sample, 2026-09-05 | `packages/core/src/ttl.ts:26-27` and `:217-230` |
| 5.0008 | s/ledger, the other recorded measurement (16.3 h) | `packages/core/src/ttl.ts:217-230` |
| 0.0008 | Spread between those two measurements | `packages/core/src/ttl.ts:227` |
| 5–6 | Primer's range; wall-clock is an estimate | `docs/SOROBAN-PRIMER.md:15` |
| about 5 seconds | Official wording. The target close time can change, and one ledger can take longer. No integer ledger count | [Stellar Stack](https://developers.stellar.org/docs/learn/fundamentals/stellar-stack), Stellar Core; same sentence on [Validators](https://developers.stellar.org/docs/validators) |
| 86,400 | `24 * 60 * 60`, the numerator in the test | `packages/core/test/thresholds.test.ts:14` |
| 17,280 | Ledgers in 1 day at 5 s, and `DEFAULT_CRITICAL_LEDGERS` | Derived `86400 / 5`; `packages/core/src/health.ts:128`; test `thresholds.test.ts:26` |
| 120,960 | Ledgers in 7 days at 5 s, and `DEFAULT_WARN_LEDGERS` | Derived `7 * 86400 / 5`; `packages/core/src/health.ts:117`; test `thresholds.test.ts:20` |
| 518,400 | Ledgers in 30 days at 5 s | Derived `30 * 86400 / 5`. Not a named constant |
| 30, 7, 1 | Allowance reminder leads, in days | `docs/adr/ADR-007-allowance-funded-hosted-engine.md:93`, `phase-2/PHASE2-PLAN.md:235` |
| 720 | `min_temporary_ttl` on the recorded testnet config | `docs/SOROBAN-PRIMER.md:157-159` |
| 120,960 | `min_persistent_ttl` on that same config | `docs/SOROBAN-PRIMER.md:157` |
| 3,110,400 | `max_entry_ttl` on that config | `docs/SOROBAN-PRIMER.md:157` |
| 3,110,399 | Plan's cap: current + this many ledgers | `phase-2/PHASE2-PLAN.md:196` |
| 180 | "About 180 days", the plan and ADR-007 | `phase-2/PHASE2-PLAN.md:234`, `docs/adr/ADR-007-allowance-funded-hosted-engine.md:34`. `17280 * 180 = 3110400` is derived |
| 0 | Remaining 0 is still live | `packages/core/src/ttl.ts:16-17`, `docs/SOROBAN-PRIMER.md:31` |

**Undetermined:** a ledger count at 5.0008 s/ledger; a ledger count at 6 s/ledger; a temporary-only threshold; the approaching event id; the three allowance event ids; which table holds `remainingLedgers` and `liveUntilLedger` for the API cron. The official pages above do not supply those missing integers.
