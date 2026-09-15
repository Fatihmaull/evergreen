# W3 weekend readiness update — 2026-09-15

Local update after merged #169/#170; publication remains separate.

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

## Four reminders (WIB)

- Sunday Sep20, 18:30 — open terminal/agent and prepare for the19:00 crossing checkpoint.
- Monday Sep21, 01:00 — extra checkpoint or arrange handoff if unavailable.
- Monday Sep21, 07:00 — extra checkpoint or arrange handoff if unavailable.
- Monday Sep21, 18:30 — prepare for the19:00 expiry observation.

One app automation holds these four occurrences and stops afterward. It sends
reminders only: it does not run capture/workflows, publish commits, send GitHub
messages or assert Rakha's availability. Checkpoint ownership still needs explicit
human coordination. Fatih's latest chat says he will also help watch; do not infer
which late-night checkpoint he has taken.

[Evidence](evidence/2026-09-15-watcher-refresh/README.md) contains only public config,
service metadata and email result. No watch.env or API key is included.
