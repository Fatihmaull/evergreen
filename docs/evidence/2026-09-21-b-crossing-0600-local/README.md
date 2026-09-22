# guinea-pig B — decay reading, Mon 2026-09-21 06:00 UTC (slot 3 of 4)

**Secondary capture**, primary watcher on Fatih's machine. Rakha captures the same slot independently.

## Measured

| | | how obtained |
|---|---|---|
| `observedAt` | **2026-09-21T06:05:20.631Z** | sealed bundle `capture/result.json` |
| B `remaining` | **4261** ledgers | same |
| Observed ledger | **4789426** | same |
| `endsAt` | 4,793,687 | same |
| Health | `CRITICAL` | below the 17,280 action threshold |

Schedule table expected ~4,320. **Measured 4261** — the difference is the deliberate five-minute offset from the slot time. No drift figure is claimed; none is derivable from a single reading.

## The decay sequence so far, all measured from sealed bundles

| slot | UTC | `remaining` | ledger |
|---|---|---|---|
| 1 crossing | 12:06:59.653Z (Sun) | 17,201 | 4,776,486 |
| 2 | 00:05:07.067Z | 8,584 | 4,785,103 |
| **3** | **2026-09-21T06:05:20.631Z** | **4261** | **4789426** |
| 4 expiry | ~12:05 | 0 / absent | ≥ 4,793,689 |

## Verification

```
capture                      -> crossing-refused, qualifiesCrossing true, exit 0
verify --require-crossing    -> exit 0
re-verify with probe beside  -> exit 0
directory date == observedAt -> 2026-09-21 == 2026-09-21
```

`--require-crossing` applies here: B is still **live** and below threshold. Slot 4 is the exception — its criterion is phase `expiry-observed`, not verifier exit 0. See [`SEP-20-PREFLIGHT.md`](../../SEP-20-PREFLIGHT.md) § *What slot 4 actually looks like*.

## The refusal

```
REFUSED BY WRITE GUARD — Refusing to write: this would touch guinea-pig B
```

Nothing signed, nothing submitted. Shared `ContractCode` entry `HEALTHY` and not refused — at the real threshold it is not a candidate.

`capture/` is the sealed bundle; `probe.txt` sits outside it.
