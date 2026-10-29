# PH2-E4-04 scheduler: design for agreement before code

**Status: PROPOSAL, 2026-10-27 (CEF).** No code, no Worker config and no migration exists for this yet. It is to be agreed with DevOps (deploy, queues, secrets) and Rakha (money path, schema) on #385 before anything is built. Fatih decided on 2026-10-27 to start with the design.

**Decided by Fatih, 2026-10-28:** (1) **15-minute ticks** are accepted. (2) **DoD-2's scheduler check is "4 × the worst observed gap, in ledgers, is below the lowest act threshold in use"** (§4). (3) **The Neon gate is lifted on DevOps' worst-case bound (§6), so scheduler code may start.** If DevOps' continuing measurement exceeds that bound, **the design changes, not the measurement:** the heartbeat is what DoD-2 and `THRESHOLD_FLOOR_LEDGERS` rest on, so it is never thinned out to save compute.

**The three questions Fatih set:** cron or Queues; how the scheduler gap DoD-2 needs is measured; and cancellation that is safe once money moves (the #446 review note: a timeout must stop the work it times out).

## 1. Recommendation in five lines

1. **Cron is the clock, Queues is the work.** A Cron Trigger fires, records a heartbeat, evaluates, and enqueues one message per payer that has something to do. A single queue consumer, capped at **one** invocation at a time, does the money path.
2. **Evaluate often, act rarely.** Evaluation is read-only, cheap and safe to repeat. An action (pull, extend, refund) is rare: an entry needs extending once per weeks or months. So the two are split, and only the rare half is serialised.
3. **Serialise the money path because one engine account signs everything.** RPC's `TRY_AGAIN_LATER` is the documented answer to a transaction submitted before the same account's previous one has settled.
4. **A timeout cancels reads, never an in-flight transaction.** After a deadline nothing *new* is signed or sent, and the next attempt **resumes** from persisted state instead of restarting.
5. **Stage it.** Stage 0 ships a measure-only cron with a heartbeat, with no money and no engine key. It produces the scheduler-gap number that `THRESHOLD_FLOOR_LEDGERS` and DoD-2 both need.

## 2. Facts this rests on (read 2026-10-27)

| Fact | Source |
|---|---|
| Cron Triggers: 250 per account on Paid (5 on Free). CPU per invocation: **30 s** when the interval is under 1 h, 15 min at 1 h or more. Wall clock: 15 min. Subrequests: 10,000. Simultaneous outgoing connections: 6. | developers.cloudflare.com/workers/platform/limits |
| Cron runs "on underutilized machines"; the docs give **no delivery guarantee** and say schedule changes can take up to 15 min to propagate. Time is UTC. | …/workers/configuration/cron-triggers |
| Queues: available on Free and Paid. 128 KB per message, batches of up to 100, consumer wall clock 15 min, CPU 30 s by default (configurable to 5 min), up to 250 concurrent invocations, retention up to 14 days (24 h on Free). Typically 3 operations per message; Paid includes 1,000,000 operations a month, then $0.40 per million. | …/queues/platform/limits, …/queues/platform/pricing |
| Queues delivery is **at-least-once**; "in rare occasions, may be delivered more than once". | …/queues/reference/delivery-guarantees |
| A consumer can be capped to one invocation: `max_concurrency = 1`. | …/queues/configuration/consumer-concurrency |
| `sendTransaction` answers `PENDING`, `DUPLICATE` (same hash as the original), `TRY_AGAIN_LATER` (submitted before the account's previous transaction has settled) or `ERROR`; `getTransaction` is the way to learn the outcome. The docs do **not** say that blindly resubmitting an envelope is side-effect free. | developers.stellar.org/docs/data/apis/rpc/api-reference/methods/sendTransaction |
| Neon Free: **100 CU-hours per project per month**; computes suspend after 5 minutes idle and this cannot be disabled on Free. | neon.com/docs/introduction/plans |
| Spike (#313): scan is 3 subrequests regardless of contract count; an extend dry run is 7; CPU 10–29 ms median per scan or extend dry run. | `docs/evidence/2026-10-15-workers-spike/README.md` |
| GitHub's scheduled cron delivered about **11% of its declared cadence** (median gap 136 min in the first sample, 2026-09-12 to 09-15; worst gap 403 min as of 2026-09-23). Cloudflare's cron has not been measured. | `packages/core/src/config.ts`; `BACKLOG.md` `B-D31-01` |

## 3. The shape

```
Cron tick (clock)
  ├─ heartbeat: write (ledger, time) to scheduler_ticks                [Stage 0]
  ├─ read the plan: planTenants / checkBudget (#440)                   [Stage 1]
  ├─ evaluate each payer's items, read-only, deadline-aborted (#446)   [Stage 1]
  └─ enqueue one message per payer with a due item                     [Stage 2]
Queue consumer (max_concurrency = 1)
  └─ resume-or-start the job: preflight → pull → extend → reconcile → refund   [Stage 2, PH2-E4-02]
```

**Why not cron alone.** One invocation would carry the heartbeat, every tenant's evaluation and every money step inside 15 minutes of wall clock. With #446's sequential runner and its 20 s per-tenant deadline, 45 pathological tenants fill that. And a money failure would sit in the same invocation as the heartbeat that measures whether the scheduler is alive.

**Why not Queues alone.** Something still has to fire on a schedule, and the gap measurement is a property of the clock, not of the queue.

**Why a message per payer, not per item.** The money path is sequenced per engine account in any case. A payer's items are planned together (`TenantPlan.payerAccount`), and one message keeps a payer's budget arithmetic in one place.

**At-least-once means duplicates.** The consumer must be idempotent. The schema already has the two keys it needs: `jobs.autopilot_window` with `jobs_autopilot_uq` (one live job per contract per window) and `jobs.id` as the pull's idempotency key. The window definition is this card's to decide (see §7).

## 4. Measuring the scheduler gap

**Definition.** A *tick* is one cron invocation that reached the point of writing its heartbeat. The **gap** is the number of **ledgers** between consecutive ticks' observed ledgers. Ledgers, not wall clock: the thresholds are ledgers, and the Worker's clock is not the chain's. Each heartbeat stores the latest ledger the tick read from RPC.

**Where it lives.** A small `scheduler_ticks` table (tick time, observed ledger), which needs a migration **0005 that is Rakha's**. Without it, nothing exists to measure before the first user does, and `THRESHOLD_FLOOR_LEDGERS` (which keeps autopilot at 503 until set) could not be published. The existing `observations` table can answer a *second* question with no new table: the **per-contract coverage gap** (consecutive `observed_at_ledger` per contract). A tick can fire and still cover nobody, so the two numbers are both reported.

**How DoD-2 gets its number.** Over the 30-day window, the worst tick gap and the worst per-contract gap are computed from those tables and recorded in `docs/evidence/` with their dates, as the 2026-09 cadence measurement was. Not an estimate, and not a declared cadence.

**What "below the threshold" has to mean.** DoD-2 says the worst gap must be below the 17,280-ledger act threshold. Core's own rule is stricter: a threshold needs four scheduler runs of margin (`MIN_ACTION_RUNS_IN_WINDOW = 4`, `packages/core/src/config.ts`). A gap of 17,000 ledgers would pass DoD-2 as written and still leave no margin. **I propose `THRESHOLD_FLOOR_LEDGERS = ceil(4 × worst measured gap in ledgers)`, published from this measurement, and that DoD-2's check read "4 × the worst gap is below the lowest threshold in use".** That edit to the DoD is Fatih's to make.

**Watching the watcher.** E4-05's alert on a missing heartbeat cannot run on the scheduler it watches, or an outage silences its own alarm. It needs an independent trigger; which one is open (§8).

## 5. Cancellation that stays safe once money moves

| Phase | Rule |
|---|---|
| **Evaluate (reads)** | Cancellable. Replace `Promise.race` with an `AbortController` whose signal is passed to every RPC `fetch`, so an abandoned tenant releases its connection. There are only 6 simultaneous outgoing connections. A tenant that times out has changed nothing. |
| **Act (pull, extend, refund)** | **Never abandoned mid-flight.** A deadline stops *starting* a step. The signal is checked **before every sign and every submit**, and never after a transaction is sent. |
| **Intent before effect** | Before sending, persist the signed envelope's **hash** on the job. If the worker dies after the send, the next attempt finds the hash and asks `getTransaction`. It does not build a second envelope. A new envelope for the same step is built only once the first is proven dead (its time bounds passed and `getTransaction` says not found). |
| **Resume, never restart** | At-least-once delivery plus `attempts` means a job is picked up again. It resumes from its persisted state, and the pull stays one-per-job (`pull_tx_hash UNIQUE`, `jobs.id` as the idempotency key). |
| **One signer at a time** | The consumer runs with `max_concurrency = 1`, so engine-account sequence numbers never race (`TRY_AGAIN_LATER`). If throughput ever demands more, the alternatives are channel accounts or one Durable Object per account; neither is needed at beta volume. |

**A schema gap this exposes, for Rakha (PH2-E4-02).** `jobs` has `CHECK ((pull_tx_hash IS NULL) = (pulled_at IS NULL))`, and `pulled_at` means *when the pull confirmed*. So a pull's hash **cannot be written before it confirms**, and "intent before effect" has nowhere to put it. A worker killed between submit and write would leave a pull on chain with no record: the user charged, no extend, no refund, and reconcile cannot find it. It needs a column for a submitted-but-unconfirmed hash per step (for example `pull_submitted_hash`, and one for the extend and the refund). This is a requirement of safe cancellation, not an optimisation.

**Status, 2026-10-28:** Rakha added the three columns in migration 0006 (#466) and `scheduler_ticks` in 0005 (#465). Both are approved and waiting for him to merge; DevOps applies them to Neon preview afterwards.

**A gap in this design's own rule, found while reviewing #466.** The table above says a new envelope may be built only once the first is "proven dead (its time bounds passed and `getTransaction` says not found)". A stored *hash* lets a recovering worker call `getTransaction`, but not decide **when "not found" becomes final**: `NOT_FOUND` is also what an envelope that may still land looks like. To know it can no longer land, the worker needs the bound the envelope was built with. So each money step also has to persist **when that envelope expires**, either as a column per step (for example `*_submitted_expires_at`, my recommendation: smaller, and it stores nothing extra) or by storing the signed envelope itself, which carries its own bounds and can be re-sent (the RPC answers `DUPLICATE` with the same hash for a copy; its documentation doesn't say blind resubmission is side-effect free, so the design never relies on it). Raised on #466; 0006 is additive, so this is either folded in before it is applied to Neon or follows as 0007.

## 6. Cadence is bounded by Neon Free (and the gate is lifted)

Every tick touches Postgres, which wakes the compute; it then idles 5 minutes before suspending. If the minimum compute is 0.25 CU (the assumption ADR-003 made; Neon's page doesn't state a minimum, so **undetermined**), a tick every N minutes keeps the database up `min(24, ticks per day × 5 min)` hours a day:

| Tick every | Awake per day | CU-hours per month at 0.25 CU | Against 100 |
|---|---|---|---|
| 5 min | always on (24 h) | 180 | **over** |
| 10 min | about 12 h | about 90 | borderline, with no room for API traffic |
| 15 min | about 8 h | about 60 | fits, with room |
| 30 min | about 4 h | about 30 | fits easily |

User traffic to the API wakes the same database on top of this. **Proposal: a 15-minute tick**, which is also the cadence the project has always declared. The alternative is Neon Launch ($0.106 per CU-hour; always-on at 0.25 CU is about $19 a month), which would allow a 5-minute tick. Whether that buys anything is only knowable from the measured gap.

**Outcome (Fatih, 2026-10-28, round 2): stay on Neon Free, and the gate is lifted.**

- **The cron runs on production only, every 15 minutes.** The preview scheduler runs on `workflow_dispatch` (manual) with **no cron**. Neon's allowance is **per project, not per branch** (100 CU-hours), so two branches ticking every 15 minutes would be 146 and not fit.
- **DevOps' worst-case bound** (read 2026-10-28 on #461; compute 0.25 CU, observed average 0.256 while active; billing period 2026-10-22 to 2026-11-01, **0.57 CU-hours used so far**): at a 15-minute tick, **73.0 CU-hours a month** if the 5-minute idle window is billed as active time and each tick does 60 seconds of work (62.8 at 10 seconds), and **2.0 to 12.2** if the idle window is not billed. So **73 of 100 in the worst case**, and the table above (about 60) was the conservative reading all along.
- **The API's beta traffic draws on the same 100 CU-hours.** That, not the scheduler alone, is the real pressure, and it is why **Neon Launch is scheduled for the moment production secrets get Fatih's "ya"** (the restore-drill proposal's option A, `docs/ops/backup-and-restore.md`; Fatih's decision K3). On Launch the cap disappears and cadence becomes a cost line (about $7 to $8 a month at 15-minute ticks on DevOps' figures).
- **DevOps keeps measuring** whether the idle window is billed, and reports on #461. The measurement decides which column of its table is true; it does not change the cadence unless it **exceeds the bound**.
- **If it does exceed the bound, the fallback order stands:** (1) 30-minute ticks, about 31 to 37 CU-hours a month, at the cost of a coarser gap measurement and a higher `THRESHOLD_FLOOR_LEDGERS` (four times the worst gap); (2) Neon Launch. Moving the heartbeat off Postgres is **not** on the list, because it would break the single place the measurement is read from.
- **Not decided, proposed by DevOps:** a daily read of the project's consumption (`neonctl projects get`) from Stage 0 on, flagging at 70 CU-hours. It is an operator signal, so it belongs with `PH2-E4-05`.

## 7. Open for decision

- **The autopilot window** (`jobs.autopilot_window`, "undetermined, PH2-E4-04"). Proposal: the window is `floor(observed ledger / W)` with `W` equal to the tick interval in ledgers (180 at 15 minutes), so each item has at most one live job per tick. Rakha's call on whether the schema wants anything else.
- **Retry and dead-letter policy** for the consumer. The Queues page I read doesn't cover dead-letter configuration; DevOps to confirm the setting.
- **`getLedgerEntries` key cap** per request, for batching many contracts into one read: not verified.

## 8. Asks

**DevOps** (it owns Worker config, queues and secrets):
1. A new Worker for the scheduler, with a 15-minute cron, a queue and its dead-letter queue, and a **preview environment with its own queue and no engine key** at first.
2. The consumer config with `max_concurrency = 1`.
3. The same `DEPLOY_COMMIT` injection as #460 on this Worker (head SHA on `pull_request`, `github.sha` on `main`).
4. Production stays behind the environment approval. **Agents never approve a deployment and never edit a workflow to get around that gate** (Fatih, 2026-10-27).

**Rakha** (schema, money path):
1. ~~Migration 0005: `scheduler_ticks`~~ (#465, approved, awaiting his merge).
2. ~~For `PH2-E4-02`: columns for a submitted-but-unconfirmed hash per money step~~ (#466, approved, awaiting his merge). **Still open:** the envelope's expiry per step (§5).
3. Confirm the autopilot window rule (§7).

**Fatih:** both decided on 2026-10-28 (see the top of this document): 15-minute ticks, and the DoD-2 check as "4 × the worst observed gap is below the lowest threshold in use".

**DevOps, before any code:** the measured Neon answer in §6.

## 9. Undetermined

- Cloudflare's actual cron delivery cadence. It has never been measured here, and the docs promise none. Stage 0 exists to measure it.
- Neon's minimum compute size on Free, and therefore the CU-hour figures in §6.
- Whether the dead-letter queue setting exists as I expect (§7).
- Real CPU for a full act step (sign, submit, poll). The spike measured dry runs only.
