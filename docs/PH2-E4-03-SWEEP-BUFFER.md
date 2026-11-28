# Sweep buffer proposal (PH2-E4-03)

**Status: provisional.** Fatih, 2026-11-27, #689: `SWEEP_BUFFER_STROOPS` = 20,000,000 (2 XLM) on the preview scheduler only. `SWEEP_MODE` stays dry-run, so nothing is sent. Revisit after the DoD-2 window (about 2026-12-07). The tick reads that env var. Unset, the plan is `buffer-unset` and nothing is swept. There is no code default.

## What the buffer is

Refund headroom is the sum of pulls still in flight (`status = 'pulled'`). The float cap is that headroom plus the buffer. Only the stroops above the cap can be swept to the testnet treasury. The sweep does not use the treasury key.

## What was measured

One preview job is written down. Source: `BACKLOG.md` PH2-E4-02 and `phase-2/PHASE2-PLAN.md` (first autopilot extend, 2026-11-23 13:30 UTC, job `15f87fd6-2860-42cd-89ae-427d2bf68962`).

| part | stroops |
| --- | ---: |
| pull | 11,693,278 |
| rent charged | 9,883,312 |
| evergreen fee | 197,667 |
| refund | 1,612,299 |

Those four add up: 9,883,312 + 197,667 + 1,612,299 = 11,693,278. The job was balanced and no longer in flight, so it does not say what the headroom was.

Not in the repo, and not read for this note:

- how many preview jobs have run since that one
- `fee_ledger` rows for `network-fee` on that job (the engine's own cost)
- the engine account balance
- the sum of pulls still `pulled`

This session has no preview database credential, so those were not queried.

## What Fatih set

A fixed 20,000,000 stroops (2 XLM) on preview: 1 XLM for the account reserve and 1 XLM of operating fees. The published network fee per job since #661 is 10,464 stroops, so 1 XLM covers about 95 jobs (`phase-2/PHASE2-PLAN.md`). `SWEEP_MODE` is not set, so the sweep stays dry-run. Production has no buffer.
