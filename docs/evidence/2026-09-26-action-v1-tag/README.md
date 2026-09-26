# W4-D25-03 — public evergreen-check v1 tag

The public Action reference is **`Fatihmaull/evergreen@v1`**, because `action.yml` is at the root of the existing Evergreen repository. The annotated remote tag `v1` was read back as tag object `ded0700270f31609e48667bfb39c50468d01e772`, peeled to commit **`2a4ab0a5a916ee156149c1f7e5a2ca8802c2fdc6`**. That is exactly the Action source commit independently tested by `W4-D25-02`; no action code changed between the SHA test and the tag test. No separate `Fatihmaull/evergreen-check` repository exists.

The external fixture's [commit `9893617`](https://github.com/rakhargo/evergreen-check-smoke/commit/9893617d8eac33b1a88cd93c1c89a87894217ad6) changed only its two `uses:` references from the tested SHA to `@v1` and updated its README. It kept guinea-pig A, its declared data keys, thresholds and published CLI `0.1.0` fixed. [Manual run 36255608415](https://github.com/rakhargo/evergreen-check-smoke/actions/runs/36255608415) shows:

| Job | Threshold | Result |
| --- | ---: | --- |
| [green · must pass](https://github.com/rakhargo/evergreen-check-smoke/actions/runs/36255608415/job/108441705926) | 17,280 ledgers | All four entries `HEALTHY`, job succeeded; Action step summary says exit **0** |
| [red · must fail at threshold](https://github.com/rakhargo/evergreen-check-smoke/actions/runs/36255608415/job/108441706040) | 2,000,000 ledgers | All four entries `CRITICAL`; Action log says **Process completed with exit code 1** |

The overall workflow is red by design. Both jobs resolved `Fatihmaull/evergreen@v1`, completed Node setup and ran the real npm CLI against Testnet A. A setup failure or exit 2/3 would not satisfy the red outcome. [`run-summary.json`](run-summary.json) records the run, jobs, tag readback and source revisions.

## Screenshots

- [`run-green-red.png`](run-green-red.png) is an original Brave/Spectacle screenshot of the public GitHub run page. It shows both job conclusions and the green Action summary with threshold 17,280 and exit 0.
- [`red-job.png`](red-job.png) is an original Brave/Spectacle screenshot of the red job page. It shows `Fatihmaull/evergreen@v1`, the failed scan step and CRITICAL Testnet A output. The job log linked above supplies the exact exit 1 line.
- [`screenshot-metadata.json`](screenshot-metadata.json) records the screenshot times and hashes. These are browser views of the completed CI run, not synthetic terminal images or transaction screenshots.

This is a separate repository still operated by Rakha; it does not claim an unrelated human installed the Action. No Stellar transaction, email or protected-contract write occurred. The GitHub Release for the npm CLI is separate `W4-D27-03` work; this `v1` tag names the Action.
