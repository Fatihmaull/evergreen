# Scheduler gap on production (DoD-2 check)

DoD-2's scheduler check (Fatih, 2026-10-28, `docs/PH2-E4-04-SCHEDULER-DESIGN.md` §4): **4 × the worst observed gap, in ledgers, is below the lowest act threshold in use.** This page is the dated measurement. It is re-read, not estimated.

## Reading of 2026-11-23 05:32 UTC (12:32 WIB)

Neon project `icy-sun-89705623`, branch `production` (`br-proud-mountain-aon0gpyl`), read-only `SELECT`s through the Neon connector as the owner role. Nothing was written.

| Measure | Value |
|---|---|
| Period | `scheduler_ticks` 2026-10-31 04:45:23 UTC to 2026-11-23 05:30:23 UTC (23 days) |
| Rows | 2,197 (2,195 `ok = true`, 2 `ok = false`) |
| Median gap between `ok` ticks | 180 ledgers (one 15-minute slot) |
| **Worst gap** | **541 ledgers** (45:07), seen twice: 2026-11-03 08:00 to 08:45 UTC (id 303) and 2026-11-06 20:30 to 21:15 UTC (id 636) |
| Gaps over 20 minutes | 15. Two of 541 ledgers (two missed slots), thirteen of 359 to 362 (one missed slot) |
| Last gap over 20 minutes | 2026-11-11 09:15 to 09:45 UTC (id 1062). None in the 12 days since |
| Failed ticks (`ok = false`) | 2: id 954 (2026-11-10 06:30 UTC) and id 968 (2026-11-10 10:00 UTC). Each sits inside one of the 30-minute gaps above, so the gaps already count them |

**Check:** 4 × 541 = 2,164, below `THRESHOLD_FLOOR_LEDGERS = 2165` (`apps/api/wrangler.jsonc`, production and preview). **Passes, with a margin of 1 ledger.** No production `watch_items` row has a threshold today (2 active rows, autopilot off, `threshold_ledgers` null), so the floor is the lowest threshold in use.

**What the margin means.** The floor was set from the 2026-11-03 gap (K19) and has not been beaten in 20 days since. A single gap of three missed slots (about 720 ledgers) would need a floor of 2,881. Whether to add headroom to the floor now is CEF's and Fatih's call; this page only measures.

**Missing slots write no row.** The gap rows have consecutive ids (634, 635, 636 on 2026-11-06), so a missed slot leaves nothing in the table: either the cron did not fire, or the tick failed before its insert (before 0010) or before the database. The 2 failed rows show the failed-tick row from 0010 does work.

## Queries

```sql
WITH t AS (
  SELECT id, ticked_at, observed_ledger,
         lag(ticked_at) OVER w AS pt, lag(observed_ledger) OVER w AS pl
  FROM scheduler_ticks WHERE ok WINDOW w AS (ORDER BY ticked_at))
SELECT count(*) AS ok_rows, min(ticked_at), max(ticked_at),
       max(observed_ledger - pl) AS worst_gap_ledgers,
       max(ticked_at - pt) AS worst_gap_time,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY observed_ledger - pl) AS median_gap_ledgers,
       count(*) FILTER (WHERE ticked_at - pt > interval '20 minutes') AS gaps_over_20m
FROM t;

-- the gaps themselves
WITH t AS (... as above ...)
SELECT id, pt, ticked_at, ticked_at - pt, observed_ledger - pl
FROM t WHERE ticked_at - pt > interval '20 minutes' ORDER BY ticked_at;

SELECT count(*), count(*) FILTER (WHERE autopilot_enabled), min(threshold_ledgers)
FROM watch_items WHERE removed_at IS NULL;
```

Re-run these weekly and after any scheduler deploy, and add a dated section above. The per-contract coverage gap (design §4, from `observations`) is a separate number and is not measured here.
