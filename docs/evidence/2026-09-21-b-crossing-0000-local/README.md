# guinea-pig B — decay reading, Mon 2026-09-21 00:00 UTC (slot 2 of 4)

**Secondary capture**, primary watcher on Fatih's machine. Rakha captures the same slot independently; duplicates are deliberate redundancy on the least repeatable evidence in the sprint.

## Measured

| | | how obtained |
|---|---|---|
| `observedAt` | **2026-09-21T00:05:07.067Z** | sealed bundle, `capture/result.json` |
| B `remaining` | **8584** ledgers | same |
| Observed ledger | **4785103** | same |
| `endsAt` | 4,793,687 | same |
| Health | `CRITICAL` | below the 17,280 action threshold |

Schedule table expected ~8,640 for this slot. **Measured 8584.** The difference is the deliberate five-minute offset from the slot time, not drift — no drift figure is claimed here, and none is measurable from a single reading.

## Verification

```
capture                      -> phase crossing-refused, qualifiesCrossing true, exit 0
verify --require-crossing    -> exit 0
re-verify with probe beside  -> exit 0
directory date == observedAt -> 2026-09-21 == 2026-09-21
```

`--require-crossing` applies to this slot: B is still **live** and below threshold. The exception is slot 4 only, where the criterion is phase `expiry-observed` rather than verifier exit 0.

## The refusal

```
REFUSED BY WRITE GUARD — Refusing to write: this would touch guinea-pig B
```

Nothing signed, nothing submitted. The shared `ContractCode` entry reads `HEALTHY` and is not refused — at the real threshold it is not a candidate, so the guard is never consulted for it. See the slot 1 bundle for the full contrast with the off-date rehearsals.

## Layout

`capture/` holds the sealed bundle; `probe.txt` sits **outside** it. A bundle's manifest lists its own files, so anything dropped inside takes verification from exit 0 to exit 2.
