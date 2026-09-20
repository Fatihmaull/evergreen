# guinea-pig B — alert-threshold crossing, 2026-09-20

**Captured by the primary watcher on Fatih's machine.** Duplicate by design: Fatih captures the same slot independently from a second machine, and two bundles of the same state are redundancy, not a conflict.

## The moment

**B crossed at `2026-09-20T12:00:23Z` — 19:00:23 WIB — at ledger 4,776,407.**

Derived from ledger arithmetic, not read directly, because the poller was blind across the crossing (see below):

```
threshold ledger  = endsAt 4,793,687 − 17,280 = 4,776,407
last good reading = 11:58:28Z, ledger 4,776,384, remaining 17,303
delta             = 23 ledgers × 5s = 115s
                  → 12:00:23Z
```

The projection from `write-guard.ts` was `alertThresholdOn: 2026-09-20`. Observed crossing: **12:00:23Z on 2026-09-20**. Drift measured all morning at **+0.0h**.

## What is here

| File | What it is |
|---|---|
| `capture/` | the verified capture bundle — `phase: crossing-refused`, `qualifiesCrossing: true` |
| `probe.txt` | read-only probe output, **outside** the bundle so it cannot break manifest verification |
| `crossing-moment.txt` | the arithmetic above |
| `transcript.txt` | plain-text record for a non-technical reader |

`pnpm verify:crossing capture --require-crossing` → **exit 0**, re-run after every file was placed beside it.

## The refusal is the evidence

```
REFUSED BY WRITE GUARD — Refusing to write: this would touch guinea-pig B
```

The engine saw B below the action threshold, decided, and the guard refused. **Nothing was signed and nothing was submitted.** A is in the same record reading `HEALTHY` — a run containing only a refusal cannot show the engine was working.

The shared `ContractCode` entry reads `HEALTHY` here rather than refused, unlike the off-date rehearsals: at the real 17,280 threshold it is not a candidate, so the guard is never consulted for it. That is the correct difference between this and a forced rehearsal.

## 🔴 A defect in the watcher, recorded because it happened at the worst moment

**The poller reported three consecutive `SCAN_FAIL`s from 12:00:29Z — starting within seconds of the crossing.** The chain was fine. `EXIT_BELOW_THRESHOLD = 1`, and the poll loop treated any non-zero exit as a failed scan. **The instrument broke precisely because the event it was watching for happened.**

Last good reading before it went blind: **11:58:28Z, remaining 17,303** — 23 ledgers above the threshold. Fixed at 12:07; exit codes 1 and 3 are now read as signal. The gap is why the crossing moment above is derived rather than observed, and it is recorded rather than smoothed over.

## Limits

- The capture ran at **12:06:55Z**, about six minutes after the crossing, not at the 12:05 target — the poller defect cost that time.
- **No terminal screenshot.** `screencapture` fails with *"could not create image from display"* — screen-recording permission is not granted to this process. `transcript.txt` is a text fallback and is **not** a substitute; a human still needs to take one if the deliverable requires an image.
