# W3 readiness — verified September 15, gate September 18

> Operational update after #169/#170: see [weekend update](W3-WEEKEND-UPDATE.md).
> The installed watcher now uses warn420/critical540 and a new runtime; warn30 below
> records the earlier preparation only. The latest #104 assignment names Rakha for
> Sep20/21, with Fatih reachable as fallback; each day still needs human confirmation.


Operational preparation for W3-D17-04, W3-D18-01/02a/02b/02c/03. This is an early
readiness check, not acceptance by Fatih and not evidence of a future crossing.
Full `pnpm check` passed (753 Vitest +112 Node =865 tests). No new Stellar transaction or email was sent. [Recorded checks](evidence/2026-09-15-readiness/README.md).

## Completed now

- Main source refreshed to 5998862. #145–#147 and #155–#159 are merged; #160/#162
  remained open when checked. Stage2 blocker does not prevent Stage1 readiness.
- Installed an independent user-systemd watcher from a separate main5998862 runtime
  with its own frozen offline dependency install/build. Runtime JS hashes are checked
  before every invocation. It has an email-only environment, no Stellar credentials,
  and cannot read the repository .env through the service sandbox.
- Timer `evergreen-readiness-watch.timer` is **enabled and armed**: every five minutes
  from **Sep18 00:00 UTC / 07:00 WIB**, last scheduled invocation **Sep21 17:55 UTC /
  Sep22 00:55 WIB**. Policy ends Sep21 18:00 UTC / Sep22 01:00 WIB. Calendar rules
  contain explicit dates, so they do not recur after this window. User lingering was
  enabled for logout survival. The machine still needs to stay powered on and awake.
- Critical threshold540 minutes, warning30, max job runtime10. The old360-minute
  proof config remains untouched. Warning means departure from requested cadence,
  not proof of scheduler outage. Critical policy minimum is480.
- Real service invocation before the window: inactive, result success/exit0, no
  email. Independent current-window preview observed the real GitHub late job and
  produced an unsent warning; the second run in the service sandbox deduplicated it
  and verified journal/state access. Exit1 is expected for an alarm, accepted by
  systemd `SuccessExitStatus=1`.
- Email environment validates with the real channel constructor, without delivery.
  Prior inbox evidence remains valid; no repeat mail was needed for this setup.
- Real B/C preflight captures on Sep15 passed strict offline verification and both
  reported before-action / qualifiesCrossing=false. The16 capture tests passed,
  including real-date rehearsal exclusion and positive/negative gate tests in /tmp.

## Fresh cadence measurement

For **engine-cron.yml only**, all18 scheduled runs visible in the query were read
(no truncation), then the actual `decide` job start timestamps were fetched.
Window: Sep12 17:08:40 UTC → Sep15 01:31:45 UTC.
Median inter-start gap **174.37 minutes**, maximum **368.58 minutes**.
These are completed gaps in that sample; the ongoing gap must be checked on Sep18.
This is not a replacement for earlier measurements of multiple workflows or a
future service guarantee. The watcher does not improve GitHub's delivery cadence.

## September 18 checkpoint — still must occur that day

1. Confirm the machine is awake and the timer is firing; inspect watcher.log and
   systemd state. Check both fresh successful jobs and any new maximum gap.
2. Verify the runtime checksum and email-only configuration remain usable. Preserve
   the protected subjects and action threshold17,280. Do not force B candidacy.
3. Confirm the assignment against the generated table below — **Rakha is primary on
   all four checkpoints and Fatih is backup on all four**, per
   [`ops/crossing-schedule.json`](../ops/crossing-schedule.json) and Rakha's
   per-date confirmations in #104. *(This step read "Fatih primary, Rakha backup"
   until 2026-09-19 — the inverted assignment, in the step whose whole job is
   confirming it. The prose sat outside the generated markers, so
   `pnpm check:schedule` could not see it.)*
4. Obtain explicit acceptance for the evidence below. Do not close those gates
   just because code merged or this watcher is armed.

## Acceptance still outstanding

| Gate | Available evidence | Required decision |
| --- | --- | --- |
| D17-04 | Success/liveness receipts #147, failure receipts #146, inbox confirmations | Fatih acceptance; no replay of A needed |
| D18-02a / #130 | Bounded Linux timer, signed A receipt/TTL change, inbox confirmation | Shared acceptance of local-timer proof; GitHub remains decide-only |
| #141 observer acceptance | Merged #144/#146 and current armed-runtime checks | Accept observer scope separately from cadence guarantees |

D17-03 remains recorded In progress/Fatih in the backlog; reconcile its acceptance
with the above without asserting ownership or completion on Fatih's behalf.

Prepared coordination text for the publication checkpoint:

> A save and alert evidence are merged (#146/#147); the A transaction is not being
> repeated. Please explicitly accept or identify the remaining gap for D17-04 and
> the bounded local OS-timer D18-02a proof in #130. The independent GitHub observer
> is armed Sep18–21, critical540, email-only; it neither submits transactions nor
> supplies B crossing evidence. Please confirm the existing primary/backup handoff.

Published in [PR #163](https://github.com/Fatihmaull/evergreen/pull/163); the explicit acceptance/handoff request has been posted in #130. Responses remain pending.

## B/C handoff — use the existing runbook

> ⚠️ **Superseded 2026-09-16, and the change is an inversion.** This section
> previously read *"Fatih performs the manual primary checkpoint; Rakha backs up if
> unreachable"*, with the window as three captures at 12:00/18:00/00:00 UTC. That was
> accurate when written on Sep 15 — and Rakha's per-date confirmation in #104 later
> the same day reversed the roles. The record of what was true on Sep 15 is preserved
> in this note; **the schedule itself is no longer written here**, because two other
> pages held their own copies and the three disagreed.
>
> The table below is generated from
> [`ops/crossing-schedule.json`](../ops/crossing-schedule.json) and is the only place
> the schedule exists. `pnpm check:schedule` fails if this copy drifts.

<!-- BEGIN GENERATED: crossing-schedule (full) -->

*guinea-pig B's watch is complete (2026-09-20 → 2026-09-21). The table below is the NEXT one.*

🔴 **guinea-pig C has two dates, one day apart, and they are not interchangeable.** The **alert threshold** is ~2026-09-25 12:00 UTC; the **expiry is ~2026-09-26 12:00 UTC**, and the expiry is the unrepeatable one. Scheduling from the threshold alone arrives a day early — `write-guard.ts` owns both as `alertThresholdOn` and `expiresOn`.

**guinea-pig C is below its action threshold for 24 hours.** 4 captures across that window give a decay curve rather than two endpoints. Its instance entry ends at ledger 4,880,097 and its persistent entry at 4,880,099 — an expiry assessment needs a ledger above the **later** of the two.

| Time (UTC) | WIB | C remaining | What it is | Primary | Backup — runs it if nothing is committed by |
|---|---|---|---|---|---|
| **Fri 2026-09-25 12:00** ❓ | Fri 19:00 | 17,280 | the alert threshold | **Rakha** — *unconfirmed* | Fatih, 12:20 UTC |
| **Sat 2026-09-26 00:00** ❓ | Sat 07:00 | 8,640 | first decay reading | **Rakha** — *unconfirmed* | Fatih, 00:20 UTC |
| **Sat 2026-09-26 06:00** ❓ | Sat 13:00 | 4,320 | second decay reading | **Rakha** — *unconfirmed* | Fatih, 06:20 UTC |
| **Sat 2026-09-26 12:00** ❓ | Sat 19:00 | 0 | EXPIRY — Saturday, happens once, nothing comes after it | **Rakha** — *unconfirmed* | Fatih, 12:20 UTC |

### The backup trigger is a wall clock, not a judgement

> **If no capture for that window is committed by the time in the last column, the backup runs it.** Not *"if it looks like it did not happen."*

**Being backup still means being present.** The backup has to look at that time to know whether to act. It reduces the precision required, not the attendance — two people on one task is how a task gets done zero times, and redundancy only works when the roles differ and the handover has a clock on it.

### ❓ 4 slot(s) are REQUESTED, not assigned — this table does not yet claim coverage

Assigning someone work they have already declined, through an issue comment, is how it does not get done — and finding that out on the day is finding it out too late. So these were asked as a request, with a yes or a no wanted on **each one separately**:

- **Fri 2026-09-25 12:00 / Fri 19:00 WIB** — asked of Rakha in #104, 2026-09-22. Same shape as B's slot 1. Nobody has accepted it yet.
  **If declined:** primary reverts to **Fatih**, with Rakha as backup at 12:20 UTC. Stated up front so a "no" needs no second round trip.
- **Sat 2026-09-26 00:00 / Sat 07:00 WIB** — asked of Rakha in #104, 2026-09-22. 07:00 WIB. B's equivalent slot was accepted as a standalone morning slot.
  **If declined:** primary reverts to **Fatih**, with Rakha as backup at 00:20 UTC. Stated up front so a "no" needs no second round trip.
- **Sat 2026-09-26 06:00 / Sat 13:00 WIB** — asked of Rakha in #104, 2026-09-22. Fills the twelve-hour gap running into expiry, which is the interval a reader asks about.
  **If declined:** primary reverts to **Fatih**, with Rakha as backup at 06:20 UTC. Stated up front so a "no" needs no second round trip.
- **Sat 2026-09-26 12:00 / Sat 19:00 WIB** — asked of Rakha in #104, 2026-09-22. A WEEKEND SLOT, against the weekends-are-not-working-days assumption. B's expiry produced only one bundle because the secondary machine slept; this is the last chance at two. Assessment needs a ledger above the PERSISTENT entry's 4,880,099, not the instance's 4,880,097.
  **If declined:** primary reverts to **Fatih**, with Rakha as backup at 12:20 UTC. Stated up front so a "no" needs no second round trip.

<!-- END GENERATED: crossing-schedule -->

Use [SEP-20-PREFLIGHT](SEP-20-PREFLIGHT.md) for the procedure at each checkpoint,
including A-only workflow context and the separate B capture; rerun to a new capture
path if B has not crossed. At the expiry checkpoint, observe B against the verified
baseline — actual ledger state is decisive, TTL0 remains live, and **B is never
restored to inspect it**.
- **Sep25:** minimum C crossing/refusal capture remains required, even if B succeeded.
  Full C expiry Sep26 is the replacement proof only if needed.
- **Sep26:** Fatih's shared-Wasm handoff remains conditional on required evidence
  acceptance. Calendar arrival does not grant a write override.
- Commit real event evidence the same day. This watcher covers the B window only;
  C uses the explicit manual handoff unless a later bounded observer window is set.

## Local operator locations and teardown

Operational root: `/home/rakhargo/projects/evergreen/.evergreen/readiness-20260918/`.
`watch.json` and `state/` are operational; `preview-state/` is isolated rehearsal.
`watch.env` is private and must never be published. `watcher.log` captures output.
Runtime lives below `node_modules/evergreen-runtime/` inside that root to keep a
vendored operational copy outside source lint/format traversal.

```sh
systemctl --user list-timers evergreen-readiness-watch.timer
systemctl --user show evergreen-readiness-watch.service -p Result -p ExecMainStatus
systemctl --user disable --now evergreen-readiness-watch.timer
```

The last command is manual teardown, not a step to run during the proof window.
Linger is now enabled; do not disable it while relying on user services after logout.
No perpetual timer, B/C write scheduler or automatic workflow dispatch was installed.
