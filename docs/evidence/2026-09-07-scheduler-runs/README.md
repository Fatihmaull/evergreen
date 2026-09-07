# W1-D5-03 — GitHub scheduler runtime evidence

**Status:** manual and genuine `schedule` runs both verified. The task's runtime proof is complete; this evidence is published for review in [PR #27](https://github.com/Fatihmaull/evergreen/pull/27), awaiting merge.

The read-only workflow from [PR #24](https://github.com/Fatihmaull/evergreen/pull/24) is merged and active on `main`. [Issue #23](https://github.com/Fatihmaull/evergreen/issues/23) remains open until PR #27 merges.

## Verified manual run

| Field | Recorded value |
|---|---|
| GitHub run | [34110254224](https://github.com/Fatihmaull/evergreen/actions/runs/34110254224) |
| Event | `workflow_dispatch` |
| Conclusion | `success` |
| Branch / commit | `main` / `5509c44e37be3bf51d1ef2ec0c8e8f109f605eb2` |
| Run created | 2026-09-07 10:12:47 UTC / 17:12:47 WIB |
| Job started → completed | 10:12:52 → 10:13:07 UTC (15 seconds, including setup/cleanup) |
| Probe started | 2026-09-07 10:13:04.091 UTC |
| Runner | Ubuntu 24.04.4, Node 24.20.0, pnpm 11.25.0, SDK 17.0.1 |
| Network / protocol | Testnet / 28 |
| Contract instance | `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L` (guinea-pig A) |
| Latest ledger | 4,550,479 |
| Live until ledger | 4,712,648 |
| Remaining TTL | 162,169 ledgers |
| Probe result / duration | `ok` / 273 ms |

The GitHub event, run ID, commit, and conclusion were cross-checked against the job metadata and structured output. The TTL is calculated from the same SDK response: `4712648 - 4550479 = 162169`. The job installed the merged lockfile successfully and the TTL-read step exited successfully.

## Verified scheduled run

| Field | Recorded value |
|---|---|
| GitHub run | [34111732199](https://github.com/Fatihmaull/evergreen/actions/runs/34111732199) |
| Event | `schedule` |
| Conclusion | `success` |
| Branch / commit | `main` / `5509c44e37be3bf51d1ef2ec0c8e8f109f605eb2` |
| Run created | 2026-09-07 10:29:44 UTC / 17:29:44 WIB |
| Job started → completed | 10:29:58 → 10:30:14 UTC (16 seconds, including setup/cleanup) |
| Probe started | 2026-09-07 10:30:10.590 UTC |
| Runner | Ubuntu 24.04.4, Node 24.20.0, pnpm 11.25.0, SDK 17.0.1 |
| Network / protocol | Testnet / 28 |
| Contract instance | `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L` (guinea-pig A) |
| Latest ledger | 4,550,684 |
| Live until ledger | 4,712,648 |
| Remaining TTL | 161,964 ledgers |
| Probe result / duration | `ok` / 375 ms |

GitHub identifies this run as `schedule`, and the script independently logs `trigger: "schedule"` and the matching run ID. The TTL-read step succeeded; `4712648 - 4550684 = 161964`. Only the earlier manual run was dispatched by the operator. This run proves automatic invocation of the hosted read path.

## Captured files

- [`workflow-before.json`](workflow-before.json): unedited GitHub REST response for workflow `352007774`, confirming `active` state.
- [`runs-before.json`](runs-before.json): unedited workflow-run listing before dispatch, with zero runs.
- [`main-before.json`](main-before.json): unedited GitHub REST response for `main` at preflight.
- [`manual-dispatch-request.json`](manual-dispatch-request.json): operator-authored timestamp and request parameters, not a GitHub response.
- [`manual-run.json`](manual-run.json): unedited GitHub REST run metadata.
- [`manual-jobs.json`](manual-jobs.json): unedited GitHub REST job and step metadata.
- [`manual-run.log`](manual-run.log): complete, unedited `gh run view --log` export, including runner setup, probe output, and cleanup. GitHub's credential masking remains intact.
- [`scheduled-run.json`](scheduled-run.json), [`scheduled-jobs.json`](scheduled-jobs.json), and [`scheduled-run.log`](scheduled-run.log): equivalent unedited metadata and full log export for the genuine `schedule` run.
- [`schedule-runs-observed.json`](schedule-runs-observed.json): unedited GitHub REST listing filtered to `event=schedule`, containing the successful run.
- [`schedule-observation.json`](schedule-observation.json): operator-authored capture time for that listing (2026-09-07 10:30:32 UTC), not a GitHub response.

The probe output is a derived SDK summary, **not full raw Stellar RPC JSON**. No transaction was submitted, so there is no transaction hash or explorer screenshot. This is scheduler infrastructure evidence; it does not demonstrate TTL extension, engine decisions, locking, or unattended bumps.

## Capture commands

Run from the repository root. Preserve this dated capture when reproducing it.

```bash
gh workflow run scheduler-smoke.yml --repo Fatihmaull/evergreen --ref main
gh api repos/Fatihmaull/evergreen/actions/runs/34110254224 > docs/evidence/2026-09-07-scheduler-runs/manual-run.json
gh api repos/Fatihmaull/evergreen/actions/runs/34110254224/jobs > docs/evidence/2026-09-07-scheduler-runs/manual-jobs.json
gh run view 34110254224 --repo Fatihmaull/evergreen --log > docs/evidence/2026-09-07-scheduler-runs/manual-run.log
gh api repos/Fatihmaull/evergreen/actions/runs/34111732199 > docs/evidence/2026-09-07-scheduler-runs/scheduled-run.json
gh api repos/Fatihmaull/evergreen/actions/runs/34111732199/jobs > docs/evidence/2026-09-07-scheduler-runs/scheduled-jobs.json
gh run view 34111732199 --repo Fatihmaull/evergreen --log > docs/evidence/2026-09-07-scheduler-runs/scheduled-run.log
```

Dispatch was requested once. A repeated manual dispatch would produce a different run and still would not prove the `schedule` trigger.

## Local validation

On 2026-09-07, `pnpm check` passed typecheck, lint, formatting, and all **25 tests** (5 package placeholders, 11 TTL verifier tests, 9 scheduler tests). These tests use fixtures/stubs and do not call Testnet. No implementation or workflow changes were needed for either GitHub success. A targeted scan of the new evidence found no Stellar signing seeds, GitHub tokens, private-key blocks, or unmasked authorization headers.

## Schedule observation and limits

The workflow requests minutes `7,22,37,52` of every hour in UTC. Preflight found an active workflow on the default branch but no run history. A poll at 10:29 UTC still returned no scheduled run; the final snapshot at 10:30:32 UTC contained the successful run created at 10:29:44 UTC. No workflow edit or enable/disable operation was needed during this observation.

GitHub documents that [scheduled workflows may be delayed or dropped under load](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). The capture does not establish why earlier runs were absent, or which nominal cron slot produced this run. One successful scheduled execution proves automatic invocation, **not a guaranteed 15-minute response time**. Missed-run handling and the actual unattended-bump proof remain Week 3 work.
