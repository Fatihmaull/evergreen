# F9 (RPC unavailable or slow): 24 h of preview scheduler ticks (2026-10-31)

Input for the F9 thresholds in [`docs/PH2-E4-05-FAILURE-MODES.md`](../../PH2-E4-05-FAILURE-MODES.md). Measured by DevOps, read-only. #540 was closed because 8 samples were too few; this is the ~24 h set the PM asked for (2026-10-30).

**Source:** Workers Observability, service `evergreen-scheduler-preview`, events `scheduler.evaluate` and `scheduler.tick`. Window: 2026-10-30 13:05 WIB to 2026-10-31 13:10 WIB (slots */5). Cross-checked against the preview database table `scheduler_ticks`. Per-tick rows: [`f9-24h.csv`](f9-24h.csv) (times in WIB; no secrets or addresses).

## Results

- Slots expected: 290. Slots with `scheduler.evaluate`: **290** (all `dryRun`, Worker version `df539fbe`).
- Every tick: items 1, due 0, notDue 1, expired 0, undetermined 0. `rpcBatches` = 2 on all 290.
- Failed ticks: **0** (no `scheduler.evaluate_failed`, no tick with `ok: false`, no `undetermined > 0`). Longest run of failed ticks: **0**.
- One `scheduler.tick` log line is missing (slot 2026-10-30 20:50 WIB), but that slot's `evaluate` event exists and `scheduler_ticks` row id 274 exists. It is a dropped log, not a failed tick; the CSV leaves `failed` empty for that slot and explains it in the `note` column. `failed` is empty on all 290 rows.
- Database: 290 `scheduler_ticks` rows in the window, ids 181..470 contiguous, 0 gaps over 6 minutes.

| ms, n = 290 | min | p50 | p95 | p99 | max | mean |
|---|---|---|---|---|---|---|
| `rpcMs` (whole tick's RPC time) | 13 | 233 | 953 | 1723 | 2887 | 355.5 |
| `rpcMaxMs` (slowest single batch) | 7 | 136 | 682 | 1477 | 2782 | 238.2 |

Percentiles use linear interpolation between ranks. Re-computed from the CSV on 2026-10-31 and they match.

## Limits

- **One watched item, testnet, preview, dry-run.** Two RPC batches per tick. Mainnet RPC, more items, or more batches will change these numbers.
- **n = 290 over one day.** p99 rests on about 3 ticks; the max is one tick. No RPC outage happened, so this set says nothing about how failures look.
- The set shows what normal looks like. It does not, by itself, pick a threshold: that is a decision (PM / Fatih).
