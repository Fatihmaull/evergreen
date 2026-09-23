# Delivered scheduler cadence — 2026-09-23

Measured with `pnpm measure:cadence` against the real `engine-cron.yml` run
history. A dated record, so its numbers are frozen on purpose — that is why it
lives here rather than in prose, where `pnpm check:cadence` would refuse them.

Raw output: [`measure-cadence.txt`](measure-cadence.txt).

## The finding

**The worst observed gap has grown past the recorded constant, and past the
review trigger.** It is still below the floor.

| | value |
|---|---|
| sample | 72 scheduled runs, 2026-09-12T17:08:38Z → 2026-09-23T05:28:02Z (252.3 h) |
| worst gap | **403 min** |
| `WORST_OBSERVED_SCHEDULER_GAP_MINUTES` | 369 — **now stale** |
| review trigger (80% of floor) | 384 — **crossed** |
| `SCHEDULER_GAP_FLOOR_MINUTES` | 480 — not reached |
| worst six gaps | 324, 326, 333, 343, 369, 403 min |

## Why the constant was not updated

`WORST_OBSERVED_SCHEDULER_GAP_MINUTES` is pinned by `pnpm check:policy` and is
read by the engine's own floor warning. Changing it two days before guinea-pig
C's Sep 25–26 window means touching a pinned constant and its copies in the one
week where the engine's behaviour must not move for reasons unrelated to the
proof. Recorded here instead; **the decision belongs after C's expiry.**

## Why the margin still holds

C is below its action threshold for roughly 24 hours. At a 403-minute worst gap
(6.7 h) the engine still fires at least three times inside that window, and
`W3-D18-01` already records that the 24-hour margin comes from the two-tier
threshold rather than from the cadence — 17,280 ledgers is a full day of
warning, which absorbs a scheduler missing most of its slots.

The floor decision this triggers is a real one and it is not urgent: **below 480
the documented argument is unchanged.**
