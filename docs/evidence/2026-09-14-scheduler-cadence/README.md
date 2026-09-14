# W3-D18-01 — the scheduler is deployed, and its real cadence is not the declared one

2026-09-14. ADR-003 selected **GitHub Actions, Node 24, nominal 15-minute
cadence**, and `engine-cron.yml` is that deployment. It has run unattended.

## 🔴 The declared schedule is not the delivered schedule

```
cron declared            3,18,33,48 * * * *   -> every 15 minutes
window observed          2026-09-12 17:08 -> 2026-09-14 00:11  (1,862 min)
expected fires           124
ACTUAL fires              12      -> 10% of schedule
median gap               132 min
worst gap                294 min  (4.9 hours)
```

GitHub does not guarantee scheduled workflows; it delays or drops them under
load, and low-activity repositories are throttled hardest. This is documented
platform behaviour, not a misconfiguration — but **the workflow file says every
15 minutes and reality is roughly every two hours.**

`W3-D18-01` asks for "a real cron cadence (5–15 min)". **We are not achieving
that, and the row is marked accordingly rather than claimed.** Raw data:
[`scheduled-runs.json`](scheduled-runs.json).

## What it means for Sep 20, which is the only deadline that cares

B crosses its alert threshold ~2026-09-20 12:00 UTC and **expires ~09-21 12:00**
— a **24-hour window**. At the observed worst gap of 294 minutes the engine
fires **at least 4–5 times** inside it, and at the median roughly 11.

**Detection is safe.** The margin comes from the two-tier threshold, not from
the cadence: 17,280 ledgers is a full day of warning, which absorbs a scheduler
that misses 90% of its slots. A tighter threshold would not have survived this.

⚠️ It is safe *on observed behaviour*, not guaranteed. The Saturday pre-flight
therefore includes a **manual dispatch inside the window** as a backstop, because
an unattended run that silently does not happen produces the same evidence as one
that ran and found nothing.

## Why the cadence is not being "fixed"

The obvious repairs are worse than the problem for a 30-day grant:

- **A keepalive to defeat throttling** games the platform to make a number in a
  YAML file true. The number is not the requirement; detecting the crossing is.
- **Moving to Cloudflare Workers** reopens a decision ADR-003 closed, and its
  Stellar SDK compatibility is still unresolved. Six days before the crossing is
  the wrong moment.

So: the cadence is measured, published, and shown to be sufficient for the one
window that matters — rather than asserted and quietly wrong.

## What this does not change

`timeout-minutes: 10 < 15` still holds and is now enforced by
`scripts/check-workflow-timeouts.mjs`. Throttling makes the queue-growth hazard
*less* likely, never more: fewer arrivals cannot overflow a queue that already
drains faster than its declared interval.
