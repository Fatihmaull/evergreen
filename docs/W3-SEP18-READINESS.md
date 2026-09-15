# W3 readiness — verified September 15, gate September 18

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
3. Confirm **Fatih primary, Rakha backup** and the manual crossing/expiry windows.
   This is the existing runbook assignment, not a new acknowledgment from Fatih.
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

No new request has been posted by this readiness turn; publication remains separate.

## B/C handoff — use the existing runbook

- **Sep20 ~12:00 UTC / 19:00 WIB:** Fatih performs the manual primary checkpoint;
  Rakha backs up if unreachable. Use [SEP-20-PREFLIGHT](SEP-20-PREFLIGHT.md), including
  A-only workflow context and the separate B capture. Repeat around18:00/00:00 UTC
  as specified there; rerun to a new capture path if B has not crossed.
- **Sep21 ~12:00 UTC / 19:00 WIB:** observe B expiry against the verified baseline.
  Actual ledger state is decisive; TTL0 remains live. Never restore B to inspect it.
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
