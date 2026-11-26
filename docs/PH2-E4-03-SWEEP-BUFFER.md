# Sweep buffer proposal (PH2-E4-03)

**Status: not a decision.** A number for Fatih. The code does not use one. `SWEEP_BUFFER_STROOPS` stays unset, and `planSweep` sends nothing while it is unset.

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

## Proposal

No stroop value. One settled job, with no network-fee and no balance, cannot size a cushion. The tick leaves `SWEEP_BUFFER_STROOPS` unset, so it only logs.

Options for Fatih, none of them chosen here:

1. A fixed stroop amount he names, after a preview read of the engine balance and the `network-fee` rows.
2. N times the largest pull in a day, once more than one preview day exists. N is his.
3. Leave the buffer unset until the DoD-2 preview window (started 2026-11-23, about through 2026-12-07) has more than this one job. Recommended. The code already does nothing while the buffer is unset.
