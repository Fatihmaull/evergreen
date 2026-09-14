# W3 Stage 1 execution and alerts — implementation

Implementation, internal review and relevant e2e evidence are complete and published
in task PRs #142–#147. [Publication report](W3-NOTIFICATIONS-PUBLICATION.md) records
heads, tracking and acceptance boundaries. Fatih review/merge remains separate.
The existing core execution, Signer, guards, confirmation and templates are reused.

| Task / component | Published PR | Behavior |
| --- | --- | --- |
| W3-D17-05: event mapping | [#142](https://github.com/Fatihmaull/evergreen/pull/142) | Truthful success/unconfirmed/failure/liveness events with per-key precedence |
| W3-D17-05: alert runner | [#143](https://github.com/Fatihmaull/evergreen/pull/143) | Execute once; persist result before notification intent and receipt |
| W3-D17-05: scheduler observer | [#144](https://github.com/Fatihmaull/evergreen/pull/144) | Actual job timestamps, finite local window, durable incident dedup |
| W3-D18-02a: proof harness | [#145](https://github.com/Fatihmaull/evergreen/pull/145) | Committed runtime/config, A-only bounded campaign, retained attempt and RPC capture |
| W3-D17-05 / W3-D16-01: failure validation | [#146](https://github.com/Fatihmaull/evergreen/pull/146) | Real failure emails through injected RPC/history; deterministic fixture clock |
| W3-D16-01 / W3-D17-04 / W3-D18-02a: save evidence | [#147](https://github.com/Fatihmaull/evergreen/pull/147) | Scheduled Testnet A save, verified receipt/TTL, success and liveness inbox confirmation |

PR #142 targets main. The remaining task PRs use their predecessor's branch as a
base to keep review scope narrow; retarget children before merging/deleting parents.
All three [internal-review corrections](W3-D17-05-REVIEW.md) are included. Fatih's
merged #137/#138 and #139 are reconciled without dropping either export set or docs.

## Observed outcomes

[Failure evidence](evidence/2026-09-14-stage1-failures/README.md): bounded RPC timeout,
injected insufficient-balance simulation failure, and missed-run detection each
produced one real labelled email. Rakha confirmed timeout/missed-run in inbox;
balance arrived in spam and was marked not spam. No resends or Stellar writes in
the fault cases. The missed-run check ran from a one-shot OS timer. A separate real
GitHub watcher sent one late-job warning and deduplicated its next five-minute check;
that additional warning's inbox placement remains unverified.

[Save evidence](evidence/2026-09-14-scheduled-a-save/README.md): a user-systemd timer
started the pinned runner one minute after arming. Exactly one A-instance extension
succeeded: `dae63da8bd42dde7ca8a72ac9ff99f7d7179cc505819db337253843e60369128`.
Expiry increased 343,670 ledgers; 44,725 stroop was charged. Five B/C/shared control
expiries were unchanged. Success and separate shared-code liveness emails arrived
in Rakha's inbox. Exit 1 preserves the shared-entry alarm.

The signed envelope, signature, receipt and metadata TTL change agree with the
recorded result; an actual explorer screenshot is retained. The verifier checks
hashes before semantic assertions and rejects altered result/intent/control/timer
claims even after recomputing checksums. Reusing the original campaign refuses in
the readiness gate and a fresh command process. No second transaction occurred.
The original executing source remains 32670fe; later fixes and dependency merges
are not retroactively claimed as that execution build.

## Validation and remaining work

Fresh full integrated `pnpm check`: **743 Vitest + 95 Node = 838 tests**, unchanged
gates. Each published integration head also passed the same full CI pipeline.
The fixture-clock correction in #146 reproduces the local #128 recurrence with a
1.1-second boundary delay and fixes only the test clock, preserving signer policy.

D16-01 and D17-03/04/05 have completed implementation/e2e evidence. D18-02a remains
In progress for Fatih Shared acceptance of the local OS-timer proof in #130 and
merge. Production GitHub cron stays decide-only, without a signer; ephemeral
recurring live execution still needs durable pre-send state. A's threshold was
raised deliberately, so it is never called natural decay. B/C ageing is protected.

Timers/helper processes were stopped; temporary env copies removed. Original intent
and raw evidence remain intact. Seven affected Notion rows and the Knowledge Base
were synchronized and verified; notes distinguish published work from merged work.
No new email, transaction or timer activation occurred during publication.
See the [runbook](W3-D17-05-RUNBOOK.md) for operation and reconciliation rules.
