# W3 weekend readiness update — 2026-09-15

Published in PR #177 after reconciliation with main4db0352; installed runtime remains the verified main0f14d65 snapshot. Integrated pnpm check passed882 tests.

## Observer

Runtime main0f14d65 is installed separately under
`.evergreen/readiness-update-20260915/node_modules/evergreen-runtime/` with frozen
offline dependencies and a fresh build. Service now verifies its JS hashes and
reads the new watch.json (warn420, critical540, maxRun10). The private email-only
environment and persistent operational state remain at the original readiness root.
The historical runtime, config and checksummed evidence are unchanged.

Service was tested before the window: result success, exit0/inactive. Timer remains
enabled, first due Sep18 07:00 WIB. Its finite dated calendar ends after the B window
(Sep21 18:00 UTC / Sep22 01:00 WIB policy cutoff). There is no Stellar credential or
transaction path. New-code boundary checks reject warn30, remain quiet at419 minutes,
warn at421 and critical at541. Machine must stay awake for automatic observation.

## Deliverability

Ran the exact #170 provided-record scenario from the new runtime, preview first,
then one explicit send to rakhargo@gmail.com. Resend accepted email
`c4683ea6-d387-48c8-843e-c357ad620065`. No transaction was attempted; the record names
the disposable test contract, never B. Rakha confirmed inbox placement for this check; prior not-spam training was already reported. Provider acceptance and recipient confirmation are stored separately.

## Current operator commitments

The earlier handoff request was superseded by the explicit confirmations in #104
and #180. The following is generated from the canonical capture schedule; these
are capture times, not the earlier reminder times.

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

The app automation reminds before the applicable captures and does not run them,
publish commits or send GitHub messages. Its schedule was checked separately on
Sep16. Never hand-edit the table above; change ops/crossing-schedule.json and render.

[Evidence](evidence/2026-09-15-watcher-refresh/README.md) contains only public config,
service metadata and email result. No watch.env or API key is included.
