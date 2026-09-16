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

**guinea-pig B is below its action threshold for 24 hours** — from ~2026-09-20 12:00 UTC to ~2026-09-21 12:00 UTC. Four captures across that window give a decay curve rather than two endpoints.

| Time (UTC) | WIB | B remaining | What it is | Primary | Backup — runs it if nothing is committed by |
|---|---|---|---|---|---|
| **Sun 2026-09-20 12:00** | Sun 19:00 | 17,280 | the crossing | **Rakha** | Fatih, 12:20 UTC |
| **Mon 2026-09-21 00:00** | Mon 07:00 | 8,640 | first decay reading | **Rakha** | Fatih, 00:20 UTC |
| **Mon 2026-09-21 06:00** | Mon 13:00 | 4,320 | second decay reading | **Rakha** | Fatih, 06:20 UTC |
| **Mon 2026-09-21 12:00** | Mon 19:00 | 0 | expiry — happens once | **Rakha** | Fatih, 12:20 UTC |

### The backup trigger is a wall clock, not a judgement

> **If no capture for that window is committed by the time in the last column, the backup runs it.** Not *"if it looks like it did not happen."*

**Being backup still means being present.** The backup has to look at that time to know whether to act. It reduces the precision required, not the attendance — two people on one task is how a task gets done zero times, and redundancy only works when the roles differ and the handover has a clock on it.

### Deliberately declined

- **Sun 2026-09-20 18:00 / Mon 01:00 WIB** — declined 2026-09-16. Not for want of a volunteer — it is the wrong place for a checkpoint. It would have made the sequence dense early and left a twelve-hour gap running into expiry, which is the interval a reader actually asks about. The 06:00 UTC slot fills that gap instead, and costs a lunchtime rather than a night.

Recorded rather than omitted: a slot that is simply missing reads as an oversight, and the next person re-proposes it.

<!-- END GENERATED: crossing-schedule -->

The app automation reminds before the applicable captures and does not run them,
publish commits or send GitHub messages. Its schedule was checked separately on
Sep16. Never hand-edit the table above; change ops/crossing-schedule.json and render.

[Evidence](evidence/2026-09-15-watcher-refresh/README.md) contains only public config,
service metadata and email result. No watch.env or API key is included.
