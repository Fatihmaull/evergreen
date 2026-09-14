# Paket A implementation — 2026-09-14

Implementation and relevant e2e proof are complete locally. [Internal review](W3-PAKET-A-REVIEW.md) subsequently reproduced and fixed three P2 defects; 826 tests now pass. Publication remains separate. Nothing from Paket A has been pushed, published or merged.
Base is the existing EmailChannel #137, not a rebuild of it. Core execution,
Signer, guards, confirmation and truthful templates are reused.

## Delivered slices

| Slice | Local branch | Delivered |
| --- | --- | --- |
| A1 | feat/W3-D17-05-alert-events | Outcome/liveness event mapping, severity, per-key dedup |
| A2 | feat/W3-D17-05-alert-runner | Execution once; persisted result before notification intent/receipt; explicit sends |
| A3 | feat/W3-D17-05-scheduler-watch | GitHub actual-job observer, finite local timer, persistent incident dedup |
| A4 | feat/W3-D18-02a-proof-runner | Pinned code/config, A-only bounded campaign, retained attempt and RPC capture |
| A5 | test/W3-D17-05-failure-proof | Real failure emails through injected RPC/history and the actual runner/watcher |
| A6 | evidence/W3-D18-02a-live-alert-proof | Scheduled Testnet A save, success/liveness inbox proof, full evidence |

Branches are stacked in that order on #137. Tests and docs belong with each slice;
follow-up verification fixes are separate meaningful local commits. Before publishing,
reconcile current GitHub heads and choose parent retargeting without rewriting Fatih's
work. Current parent branches may need the later verification fix applied when their
PRs are prepared. This is an implementation report, not an internal-review approval.

## Observed outcomes

[Failure evidence](evidence/2026-09-14-paket-a-failures/README.md): bounded RPC timeout,
injected insufficient-balance simulation failure, and missed-run detection each
produced one real labelled email. Rakha confirmed timeout/missed-run in inbox;
balance arrived in spam and was marked not spam. No resends or Stellar writes in
the fault cases. The missed-run check ran from its own one-shot OS timer. A separate
real GitHub watcher observed a late job, sent once, and deduplicated on the next
five-minute timer invocation. That warning's inbox placement is unverified.

[Save evidence](evidence/2026-09-14-paket-a-save/README.md): the user-systemd timer
started the pinned runner one minute after arming. Exactly one A-instance extension
succeeded: `dae63da8bd42dde7ca8a72ac9ff99f7d7179cc505819db337253843e60369128`.
Expiry increased 343,670 ledgers; 44,725 stroop was charged. Five B/C/shared control
expiries were unchanged. Both the success message and separate shared-code refusal
message arrived in Rakha's inbox. Exit 1 preserves the shared-entry liveness alarm.

The actual signed envelope, signature, receipt and metadata TTL change agree with
the recorded result. A real explorer screenshot was captured and inspected.
The verifier checks hashes before semantic assertions; altered result, intent,
control expiry and timer identity are rejected even after recalculating checksums.
The same retained campaign is refused by readiness and a fresh command process;
no second transaction was submitted. A second OS-timer refusal test was blocked by
automatic reviewer capacity, so it is explicitly not claimed as executed.

## Validation and remaining boundaries

Fresh full `pnpm check` passed: 731 Vitest + 91 Node = 822 tests, unchanged gates.
Offline tests cover preflight/journal failures, unknown provider results, no resend,
queued versus actual starts, late/missing/stalled/failed/observer-error cases,
recovery/dedup, finite windows, changed runtime/config and retained attempts.
The failure harness invokes the real built command in an offline subprocess.

- D16-01, D17-03/04/05 have local completion evidence; task ownership is unchanged.
- D18-02a remains In progress for Shared acceptance of the local timer and publication. Its live proof has been banked; another A transaction
  is not needed merely to repeat it.
- Production GitHub cron remains decide-only, without a signer. Ephemeral runners
  still need a reviewed durable pre-send journal before repeated live execution.
- No live A proof is called natural decay. B/C ageing and shared Wasm stay protected.
- All test timers/helper processes were stopped; temporary env copies removed.
  Private original intent and capture remain. No ongoing watcher is promised.
- Notion sync and coordination on #104/#130 are pending publication. No new issue
  or comment was sent during implementation. The local package plans remain local.

See [runbook](W3-PAKET-A-RUNBOOK.md) for commands, artifacts and reconciliation rules.

The final gate reproduced the known execution-suite flake tracked by #128. A
controlled 1.1-second delay exposed mismatched fixture/SDK clocks. Freezing Date
for that suite makes the same delayed test pass; the diagnostic delay was removed.
Only the test fixture changed, with real timers restored after each test. See
[failure and fix](evidence/2026-09-14-paket-a-failures/clock-fixture/README.md).
No production signer validity bound or assertion was relaxed; #128 remains open
for publication/CI verification.
