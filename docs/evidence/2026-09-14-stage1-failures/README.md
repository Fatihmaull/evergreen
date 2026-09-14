# W3 Stage 1 controlled failure delivery

2026-09-14. Actual runner/watcher and EmailChannel, synthetic Stellar RPC/history.
No signer access or Stellar network request. All subjects explicitly say E2E TEST.

| Case | Fault and result | Actual provider acceptance |
| --- | --- | --- |
| RPC timeout | Three bounded read failures; one critical run-failure alert, no BumpRecord | 5f432d73-ab70-497b-84e9-53f6e66552f0 |
| Insufficient balance | Injected simulation rejection; one failed record/critical alert, no hash or send | fa079cd0-3f13-41d4-a6cf-e2adb9302092 |
| Missing scheduled run | Empty seven-hour test history; one critical alert, second check deduplicated | 11c43d66-afbc-4e7a-a0cb-1bd2db63f732 |

The missed-run command was invoked by a one-shot user systemd timer after arming,
using an email-only environment. `timer-provenance.json` retains selected journal
fields; full local journal is private. The history is injected, not a claim that
the production workflow disappeared for seven hours. The timer service completed
successfully. No watcher or runner ever submits a replacement transaction.

Each JSON preserves the execution result and delivery receipt. Provider acceptance
is distinct from inbox arrival; Rakha confirmed timeout and missed-run in the inbox; insufficient-balance arrived
in spam and was marked not spam. See inbox-confirmation.json. This proves receipt,
not reliable inbox placement. No resend was made. No addresses,
keys or authorization headers are in this bundle. The balance rejection is a
simulation fixture, not a real insufficient-balance transaction on-chain.

Offline coverage also proves email-provider failure after a successful execution
preserves its original record/hash and executes only once. That test does not
manufacture another live transaction just to test transport failure.

The actual GitHub watcher also ran from a finite local timer: it observed the last
engine job start at 04:54:14 UTC, issued one late warning (provider ID
5a502113-d1ed-4920-8759-b2eacc0ad546), then deduplicated at the next five-minute
check. See github-watch/. This warning is observed production history, separate
from the injected missing-run test. Its inbox placement was not separately
confirmed. Both watcher and stop timers were stopped after capture; no monitoring
is left running. Temporary email/proof environment copies were removed.
