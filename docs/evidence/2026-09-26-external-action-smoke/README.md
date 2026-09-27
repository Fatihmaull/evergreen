# W4-D25-02 — evergreen-check from a separate repository

The public [external fixture repository](https://github.com/rakhargo/evergreen-check-smoke) contains only a workflow, a declared Testnet A storage-key file and a README. It has no Evergreen monorepo packages, built CLI, signing key or secret. Commit [`721e5a1`](https://github.com/rakhargo/evergreen-check-smoke/commit/721e5a17661167a8630d5da5a51526ca3d6e4ffe) invokes the Evergreen Action at immutable source commit `2a4ab0a5a916ee156149c1f7e5a2ca8802c2fdc6` and pins the npm CLI to `0.1.0`.

[Manual run 36254970083](https://github.com/rakhargo/evergreen-check-smoke/actions/runs/36254970083) scanned guinea-pig A twice using the same declared instance, code, persistent and temporary scope:

| Job | Threshold | Observed result |
| --- | ---: | --- |
| [green · must pass](https://github.com/rakhargo/evergreen-check-smoke/actions/runs/36254970083/job/108439913066) | 17,280 ledgers | Four entries `HEALTHY`; job succeeded |
| [red · must fail at threshold](https://github.com/rakhargo/evergreen-check-smoke/actions/runs/36254970083/job/108439913195) | 2,000,000 ledgers | Four entries `CRITICAL`; Action exited **1** and job failed |

The overall workflow conclusion is `failure` because the red job is deliberately red. Its log reports `Process completed with exit code 1` after the real scan; both jobs completed checkout, Node setup and npm resolution. An install/setup failure or scan exit 2/3 would not count. [`run-summary.json`](run-summary.json) records the run and job IDs, conclusions, exact source revisions and source links.

**Limit:** this proves the Action works from a separate repository with no local workspace resolution. Rakha still owns that repository; an unrelated human has not yet followed the README in their own account. Accordingly this closes the technical external-repo path, while the stronger stranger-operated reading of READY outcome 3 remains to be checked. This run uses a commit SHA; the `v1` tag and screenshot evidence belong to `W4-D25-03`.

No Stellar transaction was signed or submitted. Guinea-pigs B and C and their shared evidence were not touched. The red outcome is produced by raising the reporting threshold on A, not by extending or ageing any contract.
