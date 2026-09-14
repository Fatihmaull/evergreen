# W3-D18-01 — the scheduler is deployed, and its real cadence is not the declared one

2026-09-14. ADR-003 selected **GitHub Actions, Node 24, nominal 15-minute
cadence**, and `engine-cron.yml` is that deployment. It has run unattended.

## 🔴 The declared schedule is not the delivered schedule

Measured on **two independent workflows** with different creation dates and
different windows. They agree, which is what makes this a property of the
platform rather than of one file.

| workflow | live since | window | expected @15min | actual | delivered | gap min/med/max |
|---|---|---|---|---|---|---|
| `engine-cron.yml` | 09-12 14:11Z | 2,487 min | 166 | 13 | **7.8%** | 102 / 136 / 294 |
| `scheduler-smoke.yml` | 09-07 05:20Z | 10,218 min | 681 | 50 | **7.3%** | 109 / 212 / **331** |

**~7.5% of declared slots. Worst observed gap 331 minutes — 5.5 hours.**

### Instrument checks, because a dramatic number is a claim about the instrument

- **Pagination**: the API reports `total_count` 13 and 50 and returned all of
  both. Nothing truncated.
- **Retention**: both workflows are days old against a 90-day retention. Nothing
  pruned.
- **Window boundary**: the denominator runs from the workflow's first commit on
  `main`, not from its first run — otherwise the throttling at the start is
  excluded and the figure flatters itself.
- **Timezone**: the first attempt reported a scheduled run *four hours before the
  workflow was committed*. Git emitted `+07:00` and it was parsed as UTC. The
  corrected window is 3 hours longer and the figure moved from 10% to 7.8%.
- **Second sample**: `scheduler-smoke` is an independent workflow with a week of
  data and lands within 0.5 points. One workflow could be unlucky; two agreeing
  is the platform.

GitHub does not guarantee scheduled workflows; it delays or drops them under
load, and low-activity repositories are throttled hardest. This is documented
platform behaviour, not a misconfiguration — but **the workflow file says every
15 minutes and reality is roughly every two hours.**

`W3-D18-01` asks for "a real cron cadence (5–15 min)". **We are not achieving
that, and the row is marked accordingly rather than claimed.** Raw data:
[`scheduled-runs.json`](scheduled-runs.json).

## What it means for Sep 20, which is the only deadline that cares

B crosses its alert threshold ~2026-09-20 12:00 UTC and **expires ~09-21 12:00**
— a **24-hour window**. At the worst observed gap of **331 minutes** the engine fires **at least 4 times**
inside it, and at the median roughly 7–10.

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
