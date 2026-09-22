# Guinea-pig B watch — raw operator logs, 2026-09-20/21

The two logs referenced by [`docs/W3-B-WATCH-CLOSING.md`](../../W3-B-WATCH-CLOSING.md).
They were produced by the **secondary** capture machine (Fatih's host). Rakha ran the
primary captures from his own host; those are the sealed bundles under
`2026-09-20-b-crossing`, `2026-09-21-b-crossing-{0000,0600,1200}`.

**These are operator logs, not a capture bundle.** They carry no manifest, no
`SHA256SUMS` and no runtime pin, and they are not evidence of the crossing — the sealed
bundles are. They exist so the watch's two gaps are auditable rather than merely
described.

| file | lines | first line | last line |
|---|---|---|---|
| `poll.log` | 230 | `2026-09-20T10:28:01Z` | `2026-09-21T18:00:05Z` |
| `fingerprint.log` | 319 | `2026-09-20T10:48:18Z` | `2026-09-21T18:01:15Z` |

## What they show

**`poll.log`** — one line per poll of guinea-pig B at a nominal 10-minute cadence,
`remaining` / `endsAt` / `observedAt` / `health`. Read-only `scan`; nothing was ever
signed or submitted.

Two things are visible in it and both are findings:

- **The exit-code gap.** The poller originally treated any non-zero exit from
  `scan` as a failed read. `EXIT_BELOW_THRESHOLD` is **1**, so at the exact moment
  B crossed, six consecutive successful reads were recorded as `SCAN_FAIL`. The loop
  was reading correctly and reporting blindness. Fixed mid-watch by accepting exit
  0, 1 and 3 and capturing `$?` immediately rather than through a pipeline.
- **The sleep.** The host slept on battery for **268 minutes** across the expiry
  window; the gap is visible directly in the timestamps. `caffeinate -dimsu` held
  all three assertions continuously on one pid throughout — the mechanism was
  working and the outcome was not. This is why slot 4 has only Rakha's capture.

**`fingerprint.log`** — one line per 5-minute re-verification of the 31-file capture
runtime fingerprint. `digest=8c17365f32f4c301…  files=31` on every one of the 319
lines: **the runtime never moved during the watch**, so no capture taken on this host
can have been produced by a different build than the one recorded at 10:47:55Z.

## Why the cadences differ

The fingerprint check ran every 5 minutes and the poll every 10. That asymmetry is the
defect, not the design: the continuity check that would have caught the sleep was read
at roughly six-hour intervals, so a watcher polling every ten minutes learned it had
stopped only hours later. Written up as a convention in `docs/CONVENTIONS.md` — *a
watcher must check its own continuity at the cadence it claims to run at.*
