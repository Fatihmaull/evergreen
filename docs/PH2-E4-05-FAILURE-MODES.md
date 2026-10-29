# PH2-E4-05: the failure-mode list (DoD-2)

**Status, 2026-10-29: a list, not wiring.** This is the deliverable DoD-2 checks: *"every failure mode on `PH2-E4-05`'s failure-mode list is shown to alert both user and operator"* (`phase-2/PHASE2-PLAN.md:51`). **No alert in this list is live.** The coverage table below says which ones have code. Every detection signal, user alert and operator alert below depends on `PH2-E4-04` (the scheduler; only Stage 0, the heartbeat, is merged, in #482 `65fa23e`, and it is not deployed) and, for the money path, on `PH2-E4-02` (Rakha's, not built). Where the repo does not define a threshold, a count or a behaviour, this page says **undetermined**. It invents no numbers.

Owner: CEF (`F · CEF`); Rakha reviews (`BACKLOG.md:654`). Nothing here changes code, schema or deployment.

## Decisions (Fatih, 2026-10-29, confirmed 17:03 WIB)

Final, no longer provisional. Each is applied in its row below.

| Item | Decision |
|---|---|
| F8 | **Option 2.** Refund headroom = the pulls in flight; float cap = headroom + a sweep buffer. The buffer is decided at `PH2-E4-03`. |
| F10 | **Option 3.** A ledger that decreases between consecutive ticks triggers the operator alert and restarts the DoD-2 window. Signal 2 (PM, 2026-10-29): the next tick still <= the pre-drop ledger confirms the user email. An equal ledger counts as a stall, not a reset. |
| F11 | **Option 1.** An entry is at risk when its ledgers left are below 4 × the worst gap (`belowGapMargin` in `packages/core/src/gap-margin.ts`). |
| F15 | **A Neon spending notification at $5**, set in Neon Billing by DevOps. **Not** a 70 CU-hours flag: the project has been on Neon Launch since 16:53 WIB, 2026-10-29 (preview and production share the project). No code. |
| F16 | **Option 3.** A permanent rejection of an email goes to the operator's Telegram immediately. A transient failure alerts only after its retries run out. |
| Pulled-then-failed rate | **Option 1.** 30-day rolling window; breach when a user has **≥ 3** pulled jobs **and** a rate **≥ 50%**. Operator alert only; no automatic action on the user. |

## Rules every row follows

1. **Both alerts are mandatory.** Every mode has a user alert and an operator alert (Fatih, 2026-10-20, `BACKLOG.md:654`). A mode where the user has nothing to do still tells them what happened to their money or their protection.
2. **Absence is not health.** A check that could not run is reported as undetermined, never as fine (`docs/API.md:390`).
3. **Money rule (#469 and #470).** When a pull succeeded and the extend finally failed, **the refund is the whole pull, fee included**, from the engine pool and never from treasury, under the same idempotency key. Evergreen absorbs that job's network cost (about 8,000 to 12,400 stroops) as an operating cost (`docs/adr/ADR-007-allowance-funded-hosted-engine.md:68`, `docs/API.md:295`, `BACKLOG.md:651`). DoD-2 needs **100%** of such pulls refunded (`phase-2/PHASE2-PLAN.md:47`).
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
- A fleet-wide counterpart follows from DoD-2's "≥99% of autopilot jobs succeed" (`phase-2/PHASE2-PLAN.md:47`). The alert threshold for it is **undetermined**; 99% is the DoD-2 pass mark over 30 days, not an alert level.

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
- Operator: **every occurrence, highest severity**: DoD-2 needs 100% of these refunds (`phase-2/PHASE2-PLAN.md:47`).
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
- Operator: consecutive failed ticks; count **undetermined**.
- Money: none moves during evaluation; a money step in flight is F3/F5.
- Retry: next tick. **Horizon:** no source under `packages/engine/src` on main mentions Horizon; whether the hosted engine will use it is **undetermined**.
- Owner: `PH2-E4-04`; alert `PH2-E4-05`.

**F10. Testnet reset.**
- Detection (Fatih, 2026-10-29, option 3): signal 1 is `observed_ledger` decreasing between consecutive `scheduler_ticks`; an equal ledger is a stall, not a reset. Signal 2 (decided by PM, 2026-10-29): the tick after the decrease still observes a ledger lower than or equal to the ledger before the decrease. Only then does the user email go out; a decrease on the latest tick waits for the next tick. Implemented as `testnetResetSignal` in `apps/api/src/alerts/failure-modes.ts`. Signal 1 is read by the API Worker cron in `apps/api/src/alerts/testnet-reset.ts` (`runTestnetResetCheck`, the newest `TESTNET_RESET_LOOKBACK_TICKS` rows; unset means no check, and the value is **undetermined**). Signal 2 feeds the user email through `testnetResetUserEvents` (`apps/api/src/alerts/dispatch.ts`, #526).
- User: required: protection state is reset. Sent only once signal 2 confirms.
- Operator: required, on signal 1: **DoD-2's 30-day window restarts** (`phase-2/PHASE2-PLAN.md:45`).
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
- Operator: required, from outside the database (F11's independent trigger).
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
- Operator timing (Fatih, 2026-10-29, option 3): a **permanent** rejection goes to the operator's Telegram immediately; a **transient** failure alerts once its retries run out. The retry count is **undetermined**. Detector: `emailFailureOperatorAlert` (permanent = provider 4xx other than 429, or a request that could not be built).
- Retry: sign-in: the user retries; alerts: transient failures retry (bound **undetermined**), permanent rejections do not.
- Owner: `PH2-E2-04` (sign-in), `PH2-E4-05` (alerts).

**F17. `THRESHOLD_FLOOR_LEDGERS` unset or malformed.**
- Detection: turning autopilot on answers `503 UPSTREAM_UNAVAILABLE` (`docs/API.md:175`). Set-but-malformed makes the whole watchlist mount answer `503` (`apps/api/src/watchlist/mount.ts:47`).
- User: autopilot cannot be turned on; the dashboard's sentence names no cause.
- Operator: required: this is configuration. The value is **undetermined**; it comes from Stage 0's measurement as `ceil(4 × worst gap)` (`docs/PH2-E4-04-SCHEDULER-DESIGN.md:59`).
- Money: none.
- Owner: `PH2-E4-04`.

**F18. A required secret or setting missing** (`DATABASE_URL`, `EMAIL_API_KEY`, `SIGNIN_CODE_PEPPER`, `CHALLENGE_SIGNING_KEY`, `EMAIL_FROM`, `DASHBOARD_ORIGIN`; `docs/API.md:35`, `apps/api/src/auth/mount.ts:28`).
- Detection: the affected routes answer `503 UPSTREAM_UNAVAILABLE`. The scheduler's engine key does not exist yet; how its absence is detected is **undetermined**.
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

## Monitor coverage (2026-10-29, `main` at `85ac42d`)

Which monitor covers each mode today. **Live** means it can page someone now. Nothing in this table is live in production. On preview, the API Worker cron runs every 5 minutes (`apps/api/wrangler.jsonc:42`), but `ALERTS_SEND` is off, so the F10 and F11 checks only log `alerts.f10_testnet_reset` and `alerts.f11_heartbeat`. Their `scheduler_ticks` read also needs SELECT for `eg_api`, which is migration 0009 (Rakha, #385). Until 0009 lands, the read fails and the cron logs `read_failed`, which is not reported as healthy.

| Mode | How it is detected | Monitor | State |
|---|---|---|---|
| F1 pre-flight failed | job status `preflight-failed` (`isPreflightFailed`) | none wired; needs the scheduler job path (`PH2-E4-02`) | missing |
| F2 allowance missing/expiring | `allowance()` read in evaluation | none; pending in `PH2-E4-04` | missing |
| F3 pull outcome unknown | submitted-unconfirmed job past the bound | none; needs #466's submitted-hash column | missing |
| F4 pulled then failed, and per-user rate | `isPulledThenFailed`, `pulledThenFailedBreaches` | none wired; needs job rows | missing |
| F5 extend transient failure | `isTryAgainLater`, retry counts | none; retry counting pending on `PH2-E4-02` | missing |
| F6 refund fails | `isRefundOwed` | none wired; needs refund rows | missing |
| F7 ledger/reconcile mismatch | `reconcileProblems` | none wired; engine-tx-without-job pending on #466 | missing |
| F8 float low | `floatCheck` | none; balance read pending on `PH2-E4-02` | missing |
| F9 RPC unavailable or slow | `scheduler.evaluate` log, with `rpcMs`/`rpcBatches`/`rpcMaxMs` since #524 | log only; no alert. Slow threshold **undetermined** | partial (log) |
| F10 testnet reset | `observed_ledger` decrease (signal 1), confirmed by the next tick (signal 2) | API Worker cron `runTestnetResetCheck` (operator); `testnetResetUserEvents` (user, needs the outbox) | code; not live (0009, lookback unset, `ALERTS_SEND` off) |
| F11 cron missed / gap | newest `scheduler_ticks` row too old; `tickGaps` | API Worker cron `runHeartbeatCheck` (operator) | code; not live (0009, `HEARTBEAT_STALE_SECONDS` unset, `ALERTS_SEND` off) |
| F12 overlapping ticks / duplicates | `duplicatePulls` | none wired | missing |
| F13 dead-lettered message | queue DLQ | none; DLQ config pending in `PH2-E4-04` | missing |
| F14 database unavailable | trigger outside the database | none; the F11 cron logs `read_failed` but does not alert | missing |
| F15 Neon spend | Neon Billing spending notification at $5 | Neon (outside the repo, DevOps) | outside the repo; set state **undetermined** here |
| F16 email send refused | `auth.email_send_failed` log; `emailFailureOperatorAlert`; dispatch `failed`/`exhausted` | log only; operator Telegram channel not wired | partial (log) |
| F17 threshold floor unset | `thresholdFloorProblem` | none wired; needs an operator channel | missing |
| F18 required secret missing | `503 UPSTREAM_UNAVAILABLE` on auth routes | none; nobody is paged | missing |
| F19 restore lost changes | manual restore procedure | none; manual | missing |

Operator monitors still missing whose code would sit in CEF's paths: F9 (slow threshold **undetermined**), F14 (alerting on `read_failed` needs a channel that does not depend on the database), F17 and F18 (both need the operator channel, which is **undetermined**: Telegram per F16, but no chat is configured). The rest wait on `PH2-E4-02` (Rakha) or on schema.

## Undetermined, in one place

- The operator alert channel, and the independent trigger for the heartbeat alert.
- Every alert threshold: fleet failure rate, `preflight-failed` counts, retries, consecutive failed ticks, gap in ledgers, the F8 sweep buffer (decided at `PH2-E4-03`), dead-letter depth.
- Extend retry bound; refund retry cap and escalation; dead-letter policy.
- Lead time of the allowance-expiry warning.
- The per-step envelope expiry and the submitted-hash columns (#466 open).
- `THRESHOLD_FLOOR_LEDGERS`, and Cloudflare's real cron cadence.
- Whether the hosted engine uses Horizon.
- How money moved after a restore point is reconstructed, and RPO/RTO.
- The second user channel when an alert email fails.
