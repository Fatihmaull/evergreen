# PH2-E4-05: the failure-mode list (DoD-2)

**Status, 2026-10-29: a list, not wiring.** This is the deliverable DoD-2 checks: *"every failure mode on `PH2-E4-05`'s failure-mode list is shown to alert both user and operator"* (`phase-2/PHASE2-PLAN.md:51`). **No alert in this list is live.** The coverage table below says which ones have code. Every detection signal, user alert and operator alert below depends on `PH2-E4-04` (the scheduler; only Stage 0, the heartbeat, is merged, in #482 `65fa23e`, and it is not deployed) and, for the money path, on `PH2-E4-02` (Rakha's, not built). Where the repo does not define a threshold, a count or a behaviour, this page says **undetermined**. It invents no numbers.

Owner: CEF (`F · CEF`); Rakha reviews (`BACKLOG.md:654`). Nothing here changes code, schema or deployment.

**Update 2026-11-05: the state below the list is the [DoD-2 evidence table](#dod-2-evidence-is-each-alert-wired-proven-and-live-2026-11-08).** The status line above and the *Monitor coverage* table were written on 2026-10-29 and are stale on one point: the F10 and F11 operator checks run in production's cron and may send (K4). Nothing else changed: no user alert is wired, and no money-path alert has a data source.

**Update 2026-11-08: F9's slow-tick check is on `origin/main` (`41692cd`, #587) and in the API Worker that production and preview were both serving that day (`8166908`, `GET /api/v1/health`).** The production scheduler's last successful deploy still inserts `(observed_ledger)` only (`e7fb0aa`, run 41168994480), so those ticks leave `rpc_ms` NULL. **Fires on production: undetermined.**

**Update 2026-11-08: a failed operator send no longer skips the rest of the cron.** On `origin/main` at `852f11d`, before this change, a thrown `fetch` or a non-OK Resend response while emailing F11 rejected `scheduled()` at the first operator: the `alerts.f11_heartbeat` line was never written, the other operator was not tried, and F10 and F9 did not run. Each of F11, F10 and F9 now catches that failure per recipient. The log is the check's existing event with `action: 'send_failed'`, plus `httpStatus` for our status throw or `errorName` when `fetch` throws a name of 1–64 letters. The address, the key, the database URL, the provider body and the thrown message are not logged. The check's outcome line is unchanged when every deliver resolves (`action: 'sent'`). When some throw, it is `sent` with `recipients` equal to the operators who were delivered to and `failed` equal to the throws. When every deliver throws, the outcome is `action: 'send_failed'` with `failed`. The other operators and the later checks still run. A stale slow tick is still left to F11, so an F11 send failure does not make F9 send. `ALERTS_SEND` (exactly `send`), the allowlist, the thresholds, the idempotency keys and F14's `read_failed` are unchanged. **Fires on production: undetermined** — not observed on a deployed Worker.

## Decisions (Fatih, 2026-10-29, confirmed 17:03 WIB)

Final, no longer provisional. Each is applied in its row below.

| Item | Decision |
|---|---|
| F8 | **Option 2.** Refund headroom = the pulls in flight; float cap = headroom + a sweep buffer. The buffer is decided at `PH2-E4-03`. |
| F10 | **Option 3.** A ledger that decreases between consecutive ticks triggers the operator alert and restarts the DoD-2 window. Signal 2 (PM, 2026-10-29): the next tick still <= the pre-drop ledger confirms the user email. An equal ledger counts as a stall, not a reset. |
| F11 | **Option 1.** An entry is at risk when its ledgers left are below 4 × the worst gap (`belowGapMargin` in `packages/core/src/gap-margin.ts`). |
| F15 | **A Neon spending notification at $5**, set in Neon Billing by DevOps. **Not** a 70 CU-hours flag: the project has been on Neon Launch since 16:53 WIB, 2026-10-29 (preview and production share the project). No code. |
| F16 | **Option 3.** A permanent rejection of an email alerts the operator immediately. A transient failure alerts only after its retries run out. Channel: the target stays the operator's Telegram (Fatih's choice, option 3), and until that Telegram channel exists, operators get the alert by email (PM, 2026-10-30). |
| Pulled-then-failed rate | **Option 1.** 30-day rolling window; breach when a user has **≥ 3** pulled jobs **and** a rate **≥ 50%**. Operator alert only; no automatic action on the user. |

## Rules every row follows

1. **Both alerts are mandatory.** Every mode has a user alert and an operator alert (Fatih, 2026-10-20, `BACKLOG.md:654`). A mode where the user has nothing to do still tells them what happened to their money or their protection.
2. **Absence is not health.** A check that could not run is reported as undetermined, never as fine (`docs/API.md:390`).
3. **Money rule (#469 and #470).** When a pull succeeded and the extend finally failed, **the refund is the whole pull, fee included**, from the engine pool and never from treasury, under the same idempotency key. Evergreen absorbs that job's network cost (about 8,000 to 12,400 stroops) as an operating cost (`docs/adr/ADR-007-allowance-funded-hosted-engine.md:68`, `docs/API.md:295`, `BACKLOG.md:651`). DoD-2 needs **100%** of such pulls refunded (`phase-2/PHASE2-PLAN.md` § DoD-2).
4. **The chain is the truth for money.** A job's recorded state is reconciled against `getTransaction`, never assumed (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:69`).
5. **A timeout cancels reads, never an in-flight transaction** (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:14`).

## Alert channels that exist today, and what they are not

| Channel | Where | What it does today | Use here |
|---|---|---|---|
| Resend email from the API | `apps/api/src/auth/mount.ts:89` | Sends the sign-in code only | The route to a user's email exists; no alert email is written |
| `EmailChannel` (Resend) | `packages/engine/src/email-channel.ts:79` | The CLI's bump notifications (`NotificationChannel`, `packages/shared-types/src/index.ts:226`) | Candidate transport for user alerts; not wired to the hosted engine |
| `TelegramChannel` | `packages/engine/src/telegram-channel.ts:67` | The CLI's bump notifications; severities `info`, `warn`, `critical` | Candidate operator channel; which chat is the operator's is **undetermined** |
| `WebhookChannel` | `packages/engine/src/webhook-channel.ts:82` | The CLI's bump notifications | Candidate operator channel |
| Workers Logs | `docs/ops/observability.md` | Console output of the API Worker, 7 days on Paid (`docs/ops/observability.md:58`) | A log is a record, not an alert: nobody is paged by it |
| Cloudflare Budget Alert | `docs/ops/observability.md:64` | Installed by Fatih; amount **undetermined** | Cost only |

**Which channel is "the operator alert" is undetermined.** It is decided when `PH2-E4-04` wires one. **The heartbeat alert must not run on the scheduler it watches** (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:61`); its independent trigger is open.

## The metric: per-user pulled-then-failed rate

**Decision:** Fatih, 2026-10-28: the list includes a per-user failure rate, jobs that pulled and then failed to extend, per user, so abuse of the full-refund rule is visible. Recorded at `BACKLOG.md:654`, `phase-2/PHASE2-PLAN.md:354`, `docs/adr/ADR-007-allowance-funded-hosted-engine.md:68` and `docs/API.md:295`.

- **Definition:** per user, over a window, the number of jobs whose pull confirmed and whose extend finally failed (status `refunded` after a pull, `docs/API.md:237`), divided by that user's jobs that pulled.
- **Window: 30 days, rolling.** **Alert threshold: ≥ 3 pulled jobs and a rate ≥ 50%.** **On breach: an operator alert only**, no automatic action (Fatih, 2026-10-29). Detector: `pulledThenFailedBreaches` (`apps/api/src/alerts/failure-modes.ts`); reading the job rows waits on `PH2-E4-02`.
- **User alert:** each such job already alerts the user (mode F4 below). A separate user alert for the rate itself is **undetermined**.
- **Operator alert:** on breach of the threshold.
- A fleet-wide counterpart follows from DoD-2's "≥99% of autopilot jobs succeed" (`phase-2/PHASE2-PLAN.md` § DoD-2). The alert threshold for it is **undetermined**; 99% is the DoD-2 pass mark over its 14-day window, not an alert level.

## The list

Each row: **detection signal** · **user alert** · **operator alert** · **money state and refund rule** · **retry** · **owner/task**. "Not built" applies to every signal and alert.

### Money path (plan §3.3; `PH2-E4-02`, alerts `PH2-E4-05`)

**F1. Pre-flight fails** (simulation, allowance, balance or per-contract budget; ADR-007 step 1, `docs/adr/ADR-007-allowance-funded-hosted-engine.md:60`).
- Detection: job in `preflight-failed` with its reason (`docs/API.md:270`).
- User: required, with the reason ("abort and alert the user", ADR-007 step 1). Copy **undetermined**.
- Operator: count of `preflight-failed` per reason; threshold **undetermined**.
- Money: nothing submitted, nothing pulled, no refund. Does not count against the daily limit (`docs/API.md:270`).
- Retry: the next tick re-evaluates; whether a reason (e.g. allowance missing) suppresses retries until the user acts is **undetermined**.
- Owner: `PH2-E4-02` (R · CER); alert `PH2-E4-05`.

**F2. Allowance missing, expired or nearly expired; 30-day budget exhausted** (`ALLOWANCE_MISSING`, `ALLOWANCE_EXPIRED`, `docs/API.md` §9a; the "allowance expiries" in `BACKLOG.md:654`).
- Detection: `allowance()` read in evaluation; `checkBudget` (#440).
- User: on expiry, with how long the autopilot has been stopped (`docs/API.md:413`). A warning **before** expiry is in scope of `BACKLOG.md:654`; its lead time is **undetermined**.
- Operator: count of users with autopilot on and no valid allowance; threshold **undetermined**.
- Money: nothing pulled. Protection stops: this is the "missed protection" risk DoD-2 counts only while the allowance was valid and funded (`phase-2/PHASE2-PLAN.md:46`).
- Retry: none until the user re-approves.
- Owner: `PH2-E4-04` evaluation; alert `PH2-E4-05`.

**F3. Pull submitted, outcome unknown** (the worker died, or timed out, after submit).
- Detection: a job with a submitted-but-unconfirmed pull hash. **The column does not exist on main:** it is migration 0006 in #466, open. Without it the pull's hash cannot be written before it confirms (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:73`).
- User: only once the outcome is known (F4, F5 or success). Whether to tell the user "pending" earlier is **undetermined**.
- Operator: any job in this state older than the envelope's time bound; the bound per step is still open (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:77`).
- Money: possibly pulled. Resolved by `getTransaction`; a second envelope is built only once the first is proven dead (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:69`).
- Retry: resume, never restart (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:70`).
- Owner: `PH2-E4-02` (schema #466, R · CER); alert `PH2-E4-05`.

**F4. Pull succeeded, extend finally failed.**
- Detection: job `pulled`, extend retries exhausted, then `refunded` (`docs/API.md:237`).
- User: required: the extend failed, the whole pull is being returned, fee included, and the entry is still unprotected.
- Operator: every occurrence, plus the per-user rate above.
- Money: **full refund, fee included**, from the engine pool, same key; no `evergreen-fee` row; network cost absorbed (`docs/API.md:295`). The entry's protection gap remains.
- Retry: the extend is retried "a bounded number of times" before this state (ADR-007 step 3, `docs/adr/ADR-007-allowance-funded-hosted-engine.md:66`); the bound is **undetermined**. Whether the next tick may start a *new* job for the same entry after a refund is **undetermined** (the window rule is open, `docs/PH2-E4-04-SCHEDULER-DESIGN.md:103`).
- Owner: `PH2-E4-02`; alert and metric `PH2-E4-05`.

**F5. Extend transaction fails transiently or times out** (`ERROR`, `TRY_AGAIN_LATER`, or no answer; `docs/PH2-E4-04-SCHEDULER-DESIGN.md:26`).
- Detection: `sendTransaction` status, `getTransaction` not found past the envelope's bound.
- User: none per attempt; F4 if it finally fails. A delay notice is **undetermined**.
- Operator: retries per job and per hour; threshold **undetermined**. `TRY_AGAIN_LATER` should not occur with `max_concurrency = 1` (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:71`), so any occurrence is worth an operator alert.
- Money: pulled, held in the engine account until extend or refund.
- Retry: bounded (count **undetermined**); a new envelope only after the previous is proven dead.
- Owner: `PH2-E4-02`; alert `PH2-E4-05`.

**F6. Refund fails** (or is submitted with outcome unknown).
- Detection: job past F4 with no confirmed `refund` row (`docs/API.md:244`, `:285`).
- User: required: the refund is owed and delayed. Copy **undetermined**.
- Operator: **every occurrence, highest severity**: DoD-2 needs 100% of these refunds (`phase-2/PHASE2-PLAN.md` § DoD-2).
- Money: the user's pull is held in the engine pool, owed in full. Never refunded from treasury (ADR-007 step 5).
- Retry: until confirmed, under the same key, resume-not-restart. A cap and escalation are **undetermined**.
- Owner: `PH2-E4-02`; alert `PH2-E4-05`.

**F7. Ledger row missing or reconcile does not balance.**
- Detection: per job, `pull` = `rent` + `evergreen-fee` + `refund` + `difference` (`docs/API.md:294`); a stored kind (`pull`, `refund`, `network-fee`) without its `txHash` (`docs/API.md:296`); a transaction on chain from the engine account with no job (detectable only once F3's column exists).
- User: when the user's own money is affected (an unexplained charge). Copy **undetermined**.
- Operator: every unexplained difference; DoD-2 requires none (`phase-2/PHASE2-PLAN.md:48`).
- Money: undetermined until reconciled against the chain.
- Retry: reconcile re-runs; the schedule is **undetermined**.
- Owner: `PH2-E4-02` (reconcile); alert `PH2-E4-05`.

**F8. Engine float low or refund headroom short** (`BACKLOG.md:652`, `PH2-E4-03`).
- Detection: engine account balance read against the float cap and headroom. **Headroom = the pulls in flight; cap = headroom + a sweep buffer** (Fatih, 2026-10-29, option 2). The buffer is decided at `PH2-E4-03`; until then only the low side can be checked. Detector: `floatCheck`; the balance read waits on `PH2-E4-02`.
- User: none unless a job is blocked by it, then as F1. Whether a refund can be blocked by low float is **undetermined**; if it can, F6 applies.
- Operator: required. DoD-2 also needs "the float never exceeded its cap" (`phase-2/PHASE2-PLAN.md:52`), so the cap's upper side alerts too.
- Money: fees accumulate until the sweep; refunds draw on the pool.
- Retry: n/a; an operator tops up or sweeps.
- Owner: `PH2-E4-03` (R/F); alert `PH2-E4-05`.

### Chain access

**F9. RPC unavailable or slow** (`NETWORK_UNAVAILABLE`, `UPSTREAM_UNAVAILABLE`, `docs/API.md:331`).
- Detection: failed or timed-out RPC reads in evaluation; a tick that cannot read the latest ledger cannot write a meaningful heartbeat.
- User: affected items show **undetermined**, never healthy (`docs/API.md:390`). A push alert for a short outage is **undetermined**.
- Operator: consecutive failed ticks; count **undetermined**. Thresholds **decided by PM, 2026-10-31 (revisable by Fatih):** slow if the latest tick's `rpcMs` > 3000 ms; failed if the last 3 consecutive ticks are `ok: false`. **Slow-tick alert: on `origin/main` (`41692cd`, #587), in the API Worker serving `8166908` on 2026-11-08.** Migration 0010 is applied on production (2026-11-04, `docs/ops/neon-migrations.md`). The only successful production scheduler deploy in Actions is run 41168994480 at `e7fb0aa` (2026-10-31); that tick inserts `(observed_ledger)` only, so the rows it writes leave `rpc_ms` NULL and this check returns `unmeasured`. Run 41991457273 (2026-11-05) deployed the `rpc_ms` writer to the preview scheduler and skipped production. Whether any production row has a non-NULL `rpc_ms` was not re-read. **Fires on production: undetermined.** After migration 0010 (`rpc_ms`, `ok`; #570) `runTick` in the source on `origin/main` writes a row on every tick (the production scheduler still at `e7fb0aa` does not): a good tick `ok = true` with the RPC time of both calls in `rpc_ms`; a failed tick `ok = false`, `observed_ledger` NULL, and `rpc_ms` set only when every RPC call returned (NULL when one never did, Fatih, 2026-11-02). The API Worker cron then runs `runSlowTickCheck` (`apps/api/src/alerts/slow-tick.ts`): it reads the newest **`ok`** row and emails the operator when `rpc_ms` > 3000 ms, with the same gate as F11 (`ALERTS_SEND` exactly `send`, operators from `ALERTS_ALLOWLIST`). Operator alerts cannot use `alert_outbox` (its user foreign key), so the only dedupe is Resend's 24-hour idempotency key from `f9-slow-tick:<tick time>`. A slow tick older than `HEARTBEAT_STALE_SECONDS` is left to F11. **Failed-tick rule: closed as covered by F11, and still true now that failed ticks write rows:** F11 and F10 read `WHERE ok`, so a scheduler that only fails leaves the newest `ok` row ageing and F11 fires after `HEARTBEAT_STALE_SECONDS` (prod 2700 = 3 × 900 s). A failed row is not a heartbeat; counting it would have shown a scheduler that fails every tick as alive. The ~24h of preview ticks the PM asked for (2026-10-30) is in: [`docs/evidence/2026-10-31-f9-preview-24h/`](evidence/2026-10-31-f9-preview-24h/README.md). 290/290 ticks, 0 failed; `rpcMs` p50 233 / p95 953 / p99 1723 / max 2887 ms; `rpcMaxMs` p50 136 / p95 682 / p99 1477 / max 2782 ms (1 item, testnet, dry-run). Preview ticks log `rpcMs`/`rpcBatches`/`rpcMaxMs` since #524.
- Note: Stage 1 dry-run writes no `observations` or `jobs` rows by design (`apps/scheduler/src/evaluate.ts:1-16`; the scheduler's only INSERT is `scheduler_ticks`, `apps/scheduler/src/tick.ts:78` on `origin/main` at `8166908`).
- Money: none moves during evaluation; a money step in flight is F3/F5.
- Retry: next tick. **Horizon:** no source under `packages/engine/src` on main mentions Horizon; whether the hosted engine will use it is **undetermined**.
- Owner: `PH2-E4-04`; alert `PH2-E4-05`.

**F10. Testnet reset.**
- Detection (Fatih, 2026-10-29, option 3): signal 1 is `observed_ledger` decreasing between consecutive `scheduler_ticks`; an equal ledger is a stall, not a reset. Signal 2 (decided by PM, 2026-10-29): the tick after the decrease still observes a ledger lower than or equal to the ledger before the decrease. Only then does the user email go out; a decrease on the latest tick waits for the next tick. Implemented as `testnetResetSignal` in `apps/api/src/alerts/failure-modes.ts`. Signal 1 is read by the API Worker cron in `apps/api/src/alerts/testnet-reset.ts` (`runTestnetResetCheck`, the newest `TESTNET_RESET_LOOKBACK_TICKS` rows; unset means no check, and the value is **undetermined**). Signal 2 feeds the user email through `testnetResetUserEvents` (`apps/api/src/alerts/dispatch.ts`, #526).
- User: required: protection state is reset. Sent only once signal 2 confirms.
- Operator: required, on signal 1: **the affected days drop out of DoD-2's 14-day window** (`phase-2/PHASE2-PLAN.md` § DoD-2; until 2026-11-02 a reset restarted a 30-day window).
- Money: testnet only.
- Owner: `PH2-E4-05`.

### Scheduler (`PH2-E4-04`)

**F11. Cron missed, or the gap too large.**
- Detection: `scheduler_ticks` (migration 0005, `apps/api/db/0005_scheduler_ticks.sql:7`, applied to preview per #481) shows a gap in ledgers. DoD-2 passes only if **4 × the worst gap is below the lowest act threshold in use** (`phase-2/PHASE2-PLAN.md:49`). Cloudflare's cron has no delivery guarantee (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:22`) and has never been measured here.
- User: when the gap puts one of their entries at risk: **ledgers left below 4 × the worst gap** (Fatih, 2026-10-29, option 1). The user channel is **undetermined**.
- Operator: required, from a trigger **independent of the scheduler** (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:61`). **Decided (PM, 2026-10-29):** a `scheduled` handler in the API Worker (`apps/api/src/alerts/heartbeat.ts`) reads the newest `scheduler_ticks` row and emails every `ALERTS_ALLOWLIST` operator through Resend when it is older than `HEARTBEAT_STALE_SECONDS`; it sends only when `ALERTS_SEND` is exactly `send`. Not live yet: the API Worker has no cron trigger (DevOps), the `eg_api` role has no SELECT on `scheduler_ticks` in 0008 (Rakha), and the staleness value is **undetermined** (unset means no check). Alert threshold in ledgers **undetermined**.
- Money: none; protection may be missed.
- Retry: the next tick. Ticks are never thinned to save compute (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:5`).
- Owner: `PH2-E4-04`; alert `PH2-E4-05`.

**F12. Overlapping ticks or duplicate queue delivery.**
- Detection: Queues delivery is at-least-once (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:24`); a duplicate is caught by `jobs_autopilot_uq` (`apps/api/db/schema.sql:162`) and the job ID as pull idempotency key (`docs/API.md:259`).
- User: none: a correctly absorbed duplicate is not an event for the user.
- Operator: count of duplicates absorbed; a duplicate **pull** reaching chain is a P0. Threshold for the count **undetermined**.
- Money: at most one pull per job by construction (ADR-007 step 2).
- Retry: n/a.
- Owner: `PH2-E4-04`, `PH2-E4-02`; alert `PH2-E4-05`.

**F13. Queue message dead-lettered or consumer stuck.**
- Detection: dead-letter queue depth; the dead-letter setting is not yet confirmed (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:104`).
- User: as the job's money state requires (F3 to F6).
- Operator: every dead-lettered message.
- Money: whatever state the job was in; resolved by resume.
- Retry: policy **undetermined** (open in the design, §7).
- Owner: `PH2-E4-04`, DevOps for config; alert `PH2-E4-05`.

### Platform

**F14. Database unavailable.**
- Detection: the API answers `503 UPSTREAM_UNAVAILABLE` (`apps/api/src/router.ts`, watchlist branch; `docs/API.md:331`); a tick cannot write its heartbeat, which shows as F11.
- User: the dashboard renders undetermined with a sentence that names no cause (§9a).
- Operator: required, from outside the database (F11's independent trigger). **Channel:** the target stays the operator's Telegram (Fatih's choice, option 3), and until that Telegram channel exists, operators get the alert by email (PM, 2026-10-30).
- Money: a money step whose state cannot be written must not start; one in flight resumes later (F3).
- Retry: next request or tick.
- Owner: `PH2-E4-04`; alert `PH2-E4-05`.

**F15. Neon spend.** The project has been on Neon **Launch** since 16:53 WIB, 2026-10-29, so the Free plan's 100 CU-hours cap no longer applies.
- Detection: **a Neon spending notification at $5**, set by DevOps in Neon Billing (Fatih, 2026-10-29). The earlier 70 CU-hours proposal is dropped. Nothing in the repo reads it.
- User: none until it becomes F14.
- Operator: required.
- Money: none directly.
- Retry: n/a. The design's last fallback (Neon Launch, `docs/PH2-E4-04-SCHEDULER-DESIGN.md:98`) is already in place.
- Owner: DevOps; alert `PH2-E4-05`.

**F16. Email send refused or unavailable.**
- Detection, sign-in: `502 EMAIL_NOT_SENT` (refused) or `503` (unavailable), and one `auth.email_send_failed` log line (`docs/API.md:333`, `:335`).
- Detection, alert email: the same failure on a user alert, once user alerts exist.
- User: the sign-in screen says so (§9a). **When the failed email is itself a user alert, the user gets no alert:** a second channel or a dashboard notice is required for DoD-2's "alerts the user"; which one is **undetermined**.
- Operator: required, for every failed user-alert send. Sign-in failures are logs only today.
- Money: none.
- Operator timing (Fatih, 2026-10-29, option 3): a **permanent** rejection alerts the operator immediately; a **transient** failure alerts once its retries run out. The retry count is **3 attempts** (PM, 2026-10-30; see *Alert retries* below). Detector: `emailFailureOperatorAlert` (permanent = provider 4xx other than 429, or a request that could not be built). Channel: the target stays the operator's Telegram (Fatih's choice, option 3), and until that Telegram channel exists, operators get the alert by email (PM, 2026-10-30).
- Retry: sign-in: the user retries; alerts: transient failures retry (at most 3 attempts with backoff), permanent rejections do not.
- Owner: `PH2-E2-04` (sign-in), `PH2-E4-05` (alerts).

**F17. `THRESHOLD_FLOOR_LEDGERS` unset or malformed.**
- Detection: turning autopilot on answers `503 UPSTREAM_UNAVAILABLE` (`docs/API.md:175`). Set-but-malformed makes the whole watchlist mount answer `503` (`apps/api/src/watchlist/mount.ts:47`).
- User: autopilot cannot be turned on; the dashboard's sentence names no cause.
- Operator: required: this is configuration. **Channel:** the target stays the operator's Telegram (Fatih's choice, option 3), and until that Telegram channel exists, operators get the alert by email (PM, 2026-10-30). The value is **undetermined**; it comes from Stage 0's measurement as `ceil(4 × worst gap)` (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:59`).
- Money: none.
- Owner: `PH2-E4-04`.

**F18. A required secret or setting missing** (`DATABASE_URL`, `EMAIL_API_KEY`, `SIGNIN_CODE_PEPPER`, `CHALLENGE_SIGNING_KEY`, `EMAIL_FROM`, `DASHBOARD_ORIGIN`; `docs/API.md:35`, `apps/api/src/auth/mount.ts:28`).
- Detection: the affected routes answer `503 UPSTREAM_UNAVAILABLE`. The scheduler's engine key does not exist yet; how its absence is detected is **undetermined**.
- Operator: **channel:** the target stays the operator's Telegram (Fatih's choice, option 3), and until that Telegram channel exists, operators get the alert by email (PM, 2026-10-30). If the missing setting is `EMAIL_API_KEY` or `EMAIL_FROM`, the email channel itself is down; a fallback for that case is **undetermined**.
- User: the affected screen renders undetermined.
- Operator: required. Production has no secrets today (`docs/ops/README.md`).
- Money: none moves without the engine key.
- Owner: DevOps (`docs/ops/secrets.md`); alert `PH2-E4-05`.

### Restore scenarios (`docs/ops/backup-and-restore.md`, #473)

**F19. Database loss or a bad migration, restored.** Today: option C, one manual snapshot before each production migration; option A (Neon Launch, daily snapshots, up to 7 days of history) with the production-secrets "ya" (`docs/ops/backup-and-restore.md:3`). The Free history window is 6 hours (`docs/ops/backup-and-restore.md:11`).
- (a) **Within the history window:** restore to a point in time. (b) **From the pre-migration snapshot:** loses everything after it. (c) **After the Launch upgrade:** daily snapshot or point in time within 7 days.
- Detection: the DB is gone or wrong (F14, failed `shape.sql`, counts or fee-ledger sum unlike the baseline, `docs/ops/backup-and-restore.md:63`).
- User: required: some of their recent changes may be lost; which ones depends on the restore point.
- Operator: required.
- Money: **jobs that moved money after the restore point are missing from the restored database while their transactions are on chain.** They must be reconstructed from the chain before the scheduler resumes; how is **undetermined** (it needs F3's column and F7's reconcile). The scheduler should stay paused until then; that rule is **proposed here, not decided**.
- Retry: n/a. The drill records RPO and RTO in `docs/evidence/` against this mode (`docs/ops/backup-and-restore.md:69`). Their values are **undetermined** until the first drill.
- Owner: DevOps (`PH2-E0-12`); alert and evidence `PH2-E4-05`.

## DoD-2 evidence: is each alert wired, proven and live? (2026-11-08)

DoD-2 asks that *every failure mode on this list is shown to raise an alert* (`phase-2/PHASE2-PLAN.md:51`). This table says what is shown and what is not, as of `origin/main` at `8166908` plus the tests in this change. On 2026-11-08, `GET /api/v1/health` on both `evergreen-stellar.pages.dev` and `preview.evergreen-stellar.pages.dev` reported that commit, environment `production` and `preview`. Three columns, each answered separately, because they come apart:

- **Wired:** a code path that runs in a deployed Worker and reaches an operator (**Op**) or a user (**User**). A detector function that nothing calls is **not** wired. A log line is not an alert (nobody is paged by Workers Logs).
- **Proven by:** a test that fails if the alert stops being raised, plus a mutation result, or a drill that was run. "Predicate only" means the test checks the decision function and there is no alert path to prove. A mutation count is only claimed where it was run.
- **Fires on production:** *yes* only when a real firing was observed there. *No* when nothing can fire. *Undetermined* when the code is live but no firing has been seen.

`CRON` below is `apps/api/test/cron-scheduled.pglite.test.ts`: the API Worker's real `scheduled()` handler on PGlite (real `LATEST_TICK_SQL`, `RECENT_TICKS_SQL`, `LATEST_OK_TICK_SQL`, the Resend request and `configCheck`; migrations 0005 and 0010; only the Neon driver and `fetch` are faked). The handler logs four checks: F17/F18, F11, F10 and F9. Before this file, the handler itself had no test: the unit tests faked everything around it, so removing the F10 call from `index.ts` would have passed. The first version of the file mutation-proved 22 of 22 (one survived the first run, the F10 sender address, and got an assertion); those 22 were not re-run after F9 landed. The assertions added or changed for F9: **20 of 20** mutants caught, each applied alone, the test re-run, then the source restored.

| Mode | Wired | Proven by | Fires on production |
|---|---|---|---|
| **F1** pre-flight failed | Op no · User no. `isPreflightFailed` has no caller; no job rows exist (Stage 1 writes none). | Predicate only: `failure-modes.test.ts` "F1 / F4". User template: `alerts-templates.test.ts`. No mutation run. | **No** |
| **F2** allowance missing or expiring | Op no · User no. No detector exists (`pending` in `FAILURE_MODE_ALERTS`). | Nothing. | **No** |
| **F3** pull outcome unknown | Op no · User no. Needs #466's submitted-hash column. | Nothing. | **No** |
| **F4** pulled then failed (and the per-user rate) | Op no · User no. Predicates and `pulledThenFailedBreaches` have no caller; no job rows. | Predicate only: `failure-modes.test.ts` "F1 / F4", `failure-modes-final.test.ts` "breaches at exactly 3 jobs and exactly 50%". No mutation run. | **No** |
| **F5** extend transient failure | Op no · User no. `isTryAgainLater` has no caller; retry counting is `PH2-E4-02`. | Predicate only: `failure-modes.test.ts` "F5". | **No** |
| **F6** refund fails | Op no · User no. `isRefundOwed` has no caller; no refund rows. | Predicate only: `failure-modes.test.ts` "F6". | **No** |
| **F7** ledger/reconcile mismatch | Op no · User no. `reconcileProblems` has no caller. | Predicate only: `failure-modes.test.ts` "F7". | **No** |
| **F8** float low | Op no · User no. `floatCheck` has no caller; the balance read is `PH2-E4-02`. | Predicate only: `failure-modes-final.test.ts` "F8 floatCheck". | **No** |
| **F9** RPC slow | Op: the check runs in the production API cron. `scheduled` on the Worker serving `8166908` (health, 2026-11-08) calls `runSlowTickCheck`. It emails only when the newest `ok` tick has `rpc_ms` > 3000 and `ALERTS_SEND` is exactly `send`. The production scheduler's last successful deploy (`e7fb0aa`, run 41168994480) does not write `rpc_ms`. User no (dashboard only, nothing built). The failed-tick half is F11's. | CRON "F9: a fresh tick slower than 3000 ms emails each operator once", "exactly 3000 ms is not slow", "a failed tick with a long rpc_ms is not the alert", "F9 kill switch", "no allowlist on a fresh slow tick"; a stale slow tick stays F11's. New and changed assertions: 20 of 20 mutants caught. #587's unit tests (`slow-tick.test.ts`, `slow-tick.pglite.test.ts`, 35 of 35 at `306687e`) were not re-run. A 5xx for one operator is `send_failed` and the other operator still gets the email (CRON "F9: a 5xx for one operator"). | **Undetermined.** No send was observed. Ticks written by the deployed production scheduler leave `rpc_ms` NULL, so they cannot cross 3000 ms. Whether any production row has a non-NULL `rpc_ms` was not re-read. |
| **F10** testnet reset | Op **yes**, API cron every 15 min. User no: `testnetResetUserEvents` has no caller (needs 0011 applied, #588 and a caller). | CRON "F10: a decreasing observed ledger emails each operator, even with a fresh heartbeat", "equal ledger is a stall", "older than the lookback"; mutants caught. Unit: `testnet-reset.test.ts`. A thrown fetch for one operator is `send_failed` and F9 still sends (CRON "F10: a thrown fetch for one operator"). | **Undetermined.** K4 says `ALERTS_SEND` is `send` (unreadable); no firing seen. |
| **F11** cron missed or gap | Op **yes**, same cron. User no (user channel undetermined). | CRON "F11: a heartbeat older than HEARTBEAT_STALE_SECONDS emails each operator once", "exactly at the threshold is still fresh", "an empty table is stale"; mutants caught. Unit: `heartbeat.test.ts`, `heartbeat.pglite.test.ts`. A thrown fetch and a 5xx for one operator are `send_failed`, the other operator is still mailed, and F10 still sends (CRON "F11: a thrown fetch", "F11: a 5xx"). | **Undetermined.** Healthy runs seen (2026-11-01 tail); no send seen. See D2. |
| **F12** overlapping ticks / duplicates | Op no · User none by design. `duplicatePulls` has no caller. | Predicate only: `failure-modes.test.ts` "F12". | **No** |
| **F13** dead-lettered message | Op no · User no. No queue exists. | Nothing. | **No** |
| **F14** database unavailable | Op **no**: the cron logs `read_failed` and sends nothing. User no. | CRON "F14 gap: a database that cannot be read logs read_failed and sends NOTHING" pins the gap; it proves there is no alert. | **No**: a database outage raises no alert today. |
| **F15** Neon spend | Outside the repo: a Neon Billing notification at $5 (DevOps). | Nothing in the repo can prove it. | **Undetermined** (D4). |
| **F16** email send refused | Op no: `auth.email_send_failed` is a log line; `emailFailureOperatorAlert` has no caller. User no. | Decision only: `failure-modes-final.test.ts` "F16 email failure"; the log: `email-send-failure.test.ts`. | **No** (log only) |
| **F17** threshold floor unset | Op **log only** (`alerts.f17_f18_config` each cron run). User no. | CRON "F17: THRESHOLD_FLOOR_LEDGERS unset is logged as a problem and sends NOTHING"; mutants "config check not logged" and "sees an empty env" caught. `config-check.test.ts`. | **No** alert. The check runs (2026-11-01 tail, `problem: false`). |
| **F18** required secret missing | Op **log only**, same line, names only. User no. | CRON "F18: a missing required secret is logged by name only, and sends NOTHING"; "no log line carries an operator address, the database URL or a key". | **No** alert, as F17. |
| **F19** restore lost changes | Op no · User no. Manual procedure. | Nothing. The K18 restore drill (DevOps, 2026-11-04) exercised a restore, not an alert. | **No** |

**Count.** Of 19 modes: an operator alert runs in the production API cron and is proven for **3** (F9, F10, F11). F9 emails only for a measured `rpc_ms` above 3000, and the production scheduler at `e7fb0aa` does not write `rpc_ms`. Log only for **3** (F16, F17, F18); no operator path for the other **13**, of which F15 is outside the repo. A user alert is wired for **0** of the 7 modes that have one (F1, F2, F4, F6, F7, F10, F19). The dispatcher is proven against an in-memory store (`alerts-dispatch.test.ts`) and, in #588 (`60f7cf4`, on `main`), against Postgres, but `scheduled()` does not call it. **DoD-2's alert clause is not met today.** The money-path modes (F1 to F8, F12, F13) cannot be met before `PH2-E4-02` and Stage 2 of `PH2-E4-04` exist: there is no data to detect on.

**A defect the cron test found (probe run 2026-11-05; reproduced on `852f11d`, then fixed).** If Resend answers 5xx, or `fetch` throws, while the heartbeat is stale, `scheduled()` on `852f11d` rejected at the first operator's request: the second operator was never tried, the `alerts.f11_heartbeat` line was never written, and F10 and F9 did not run. The same throw in F10 skipped F9, and the same throw in F9 rejected the invocation. **Fixed in `apps/api/src`:** the per-recipient `try/catch` in `runHeartbeatCheck`, `runTestnetResetCheck` and `runSlowTickCheck`, logged as `action: 'send_failed'` (see the update at the top of this file). Proven by `apps/api/test/cron-scheduled.pglite.test.ts` ("a failed operator send does not stop the cron"): removing any one of those three catches, or logging the thrown message, fails a test. **Fires on production: undetermined.**

**Drills that need a live system** (CEF does not run these: they need secrets or production):

| Id | What | Who | Needs |
|---|---|---|---|
| D1 | F10 and F11 end to end on **preview**: `wrangler dev --env preview --test-scheduled` on a shell holding the preview secrets, `ALERTS_SEND=send` and an allowlist of one test inbox for that run only; make `scheduler_ticks` stale for F11, insert one lower-ledger row for F10 (owner role, preview branch). Evidence: the two `alerts.*` log lines and the inbox. | DevOps | Fatih's "ya" for the send; secrets from the secret store, not typed |
| D2 | F11 on **production**: look in Resend's log and Workers Logs for an `alerts.f11_heartbeat` `action: sent` around the gap on 2026-11-03 08:00 to 08:45 UTC (45:02, 541 ledgers, `docs/ops/neon-migrations.md`): 2702 s against a 2700 s threshold, so an F11 email is possible only if a cron run landed in the last two seconds before the tick, which is unlikely at a 15-minute cadence; expect none. Costs nothing. If none is found and Fatih wants a real firing, the only drill is to lower `HEARTBEAT_STALE_SECONDS` for one cron run, which is a production deploy (Fatih approves). | DevOps reads; Fatih decides on the deploy | Resend dashboard access |
| D3 | The per-user templates: `docs/ops/alerts-test-send.md` (#545) on preview. Whether it has been run is undetermined. | DevOps | Fatih's "ya" |
| D4 | F15: the Neon spending notification exists and points at an operator inbox. A screenshot without the address is the evidence. | DevOps | Neon Billing access |
| D5 | F9 send: the API check is already on the Worker serving `8166908`. A firing needs a tick with `rpc_ms` > 3000. The production scheduler that writes `rpc_ms` was not deployed (run 41991457273 skipped production). | DevOps with CEF | a production scheduler deploy, or one stubbed row, then the inbox |

## Monitor coverage (2026-10-29, `main` at `85ac42d`)

**Superseded for state by the evidence table above (2026-11-08).** Kept for the detection signals. The *State* column and this paragraph are from 2026-10-29: F10 and F11 are live in production's cron since K4. F9's row below still says the check is a draft PR. That was the state when this table was written; on `origin/main` at `8166908` the check is in the deployed API cron, and the evidence table is the state.

Which monitor covers each mode today. **Live** means it can page someone now. Nothing in this table is live in production. On preview, the API Worker cron runs every 5 minutes (`apps/api/wrangler.jsonc:42`), but `ALERTS_SEND` is off, so the F10 and F11 checks only log `alerts.f10_testnet_reset` and `alerts.f11_heartbeat`. Their `scheduler_ticks` read also needs SELECT for `eg_api`, which is migration 0009 (Rakha, #385). Until 0009 lands, the read fails and the cron logs `read_failed`, which is not reported as healthy.

| Mode | How it is detected | Monitor | State |
|---|---|---|---|
| F1 pre-flight failed | job status `preflight-failed` (`isPreflightFailed`) | none wired; needs the scheduler job path (`PH2-E4-02`) | missing |
| F2 allowance missing/expiring | `allowance()` read in evaluation | none; pending in `PH2-E4-04` | missing |
| F3 pull outcome unknown | submitted-unconfirmed job past the bound | none; needs #466's submitted-hash column | missing |
| F4 pulled then failed, and per-user rate | `isPulledThenFailed`, `pulledThenFailedBreaches` (per-user rate: 30 days, ≥ 3 pulled, ≥ 50%, operator only) | none wired; needs job rows (0 in Stage 1 by design; reader waits on `PH2-E4-02`) | missing |
| F5 extend transient failure | `isTryAgainLater`, retry counts | none; retry counting pending on `PH2-E4-02` | missing |
| F6 refund fails | `isRefundOwed` | none wired; needs refund rows | missing |
| F7 ledger/reconcile mismatch | `reconcileProblems` | none wired; engine-tx-without-job pending on #466 | missing |
| F8 float low | `floatCheck` | none; balance read pending on `PH2-E4-02` | missing |
| F9 RPC unavailable or slow | `scheduler.evaluate` log, with `rpcMs`/`rpcBatches`/`rpcMaxMs` since #524 | API Worker cron `runSlowTickCheck` (operator): newest `ok` tick with `rpc_ms` > 3000 ms (PM, 2026-10-31). Code in a draft PR; needs 0010 applied, `ALERTS_SEND` on. Failed-tick rule (3 consecutive) closed as covered by F11 | log, and code in a draft PR; not live (needs 0010; `ALERTS_SEND` off) |
| F10 testnet reset | `observed_ledger` decrease (signal 1), confirmed by the next tick (signal 2) | API Worker cron `runTestnetResetCheck` (operator); `testnetResetUserEvents` (user event ids only; the outbox is 0011, applied 2026-11-05, and nothing calls `dispatchUserAlert`) | code; not live (`ALERTS_SEND` off; user recipients undetermined) |
| F11 cron missed / gap | newest `scheduler_ticks` row too old; `tickGaps` | API Worker cron `runHeartbeatCheck` (operator) | code; not live (0009, `HEARTBEAT_STALE_SECONDS` unset, `ALERTS_SEND` off) |
| F12 overlapping ticks / duplicates | `duplicatePulls` | none wired: no pull rows exist in Stage 1 (dry-run writes no `jobs`, `apps/scheduler/src/evaluate.ts:1-16`), and the reader waits on `PH2-E4-02` | missing |
| F13 dead-lettered message | queue DLQ | none; DLQ config pending in `PH2-E4-04` | missing |
| F14 database unavailable | trigger outside the database | none; the F11 cron logs `read_failed` but does not alert | missing |
| F15 Neon spend | Neon Billing spending notification at $5 | Neon (outside the repo, DevOps) | outside the repo; set state **undetermined** here |
| F16 email send refused | `auth.email_send_failed` log; `emailFailureOperatorAlert`; dispatch `failed`/`exhausted` | log only; operator channel not wired (target Telegram, email until it exists) | partial (log) |
| F17 threshold floor unset | `thresholdFloorProblem` via `configCheck` | API Worker cron logs `alerts.f17_f18_config` (log only, no send); operator channel: target Telegram, email until it exists (PM, 2026-10-30) | partial (log) |
| F18 required secret missing | `503 UPSTREAM_UNAVAILABLE` on auth routes; `missingApiSettings` via `configCheck` (names only) | API Worker cron logs `alerts.f17_f18_config` (log only, nobody paged); operator channel: target Telegram, email until it exists (PM, 2026-10-30) | partial (log) |
| F19 restore lost changes | manual restore procedure | none; manual | missing |

Operator monitors still missing whose code would sit in CEF's paths: F14 (alerting on `read_failed` needs a channel that does not depend on the database), F17 and F18 (logged by `configCheck`; operator delivery not wired). For F14, F16, F17 and F18: the target stays the operator's Telegram (Fatih's choice, option 3), and until that Telegram channel exists, operators get the alert by email (PM, 2026-10-30).

## Alert retries and Resend idempotency

- **Retries (PM, 2026-10-30):** a per-user alert is attempted at most **3** times (`DEFAULT_ALERT_MAX_ATTEMPTS`, `apps/api/src/alerts/dispatch.ts`). Backoff: attempt 2 no sooner than **5 minutes** after attempt 1, attempt 3 no sooner than **15 minutes** after attempt 2 (`300 s × 3^(n-1)`). The cron runs every 5 minutes, so a retry goes out on the first run past its wait. After attempt 3 the row is `exhausted` (F16).
- **Resend key retention:** "Idempotency keys are kept in the system for 24 hours." (https://resend.com/docs/dashboard/emails/idempotency-keys). Resend also returns `409 invalid_idempotent_request` when a key is reused with a different payload.
- **Consequence for per-user alerts:** all three attempts finish in about 20 minutes, inside the 24-hour window; the outbox's UNIQUE (user, event) row is the durable dedupe past 24 hours.
- **Consequence for F9/F10/F11 operator emails:** they have no outbox, so Resend's 24 hours is their only dedupe. F11's key is `f11-heartbeat-stale:<newest tick>`: while the scheduler stays down, every cron run reuses it, so operators get one email per 24 hours of the same outage. F10's key is per drop: a drop still inside the `TESTNET_RESET_LOOKBACK_TICKS` rows after 24 hours emails again. F9's key is `f9-slow-tick:<tick time>` (`apps/api/src/alerts/slow-tick.ts` on `origin/main`): later cron runs over the same slow tick reuse it. The operator key adds a short hash of the recipient, because one key across several operators differs in `to` and Resend would refuse the second with 409. The rest wait on `PH2-E4-02` (Rakha) or on schema.

## Undetermined, in one place

- The independent trigger for the heartbeat alert. (Operator channel for F14/F16/F17/F18: the target stays the operator's Telegram (Fatih's choice, option 3), and until that Telegram channel exists, operators get the alert by email; PM, 2026-10-30.)
- Every alert threshold: fleet failure rate, `preflight-failed` counts, retries, consecutive failed ticks, gap in ledgers, the F8 sweep buffer (decided at `PH2-E4-03`), dead-letter depth.
- Extend retry bound; refund retry cap and escalation; dead-letter policy.
- Lead time of the allowance-expiry warning.
- The per-step envelope expiry and the submitted-hash columns (#466 open).
- `THRESHOLD_FLOOR_LEDGERS`, and Cloudflare's real cron cadence.
- Whether the hosted engine uses Horizon.
- How money moved after a restore point is reconstructed, and RPO/RTO.
- The second user channel when an alert email fails.
