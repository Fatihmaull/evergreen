# guinea-pig B — alert-threshold crossing, 2026-09-20

**Captured by the primary watcher on Fatih's machine.** Duplicate by design: Fatih captures the same slot independently from a second machine, and two bundles of the same state are redundancy, not a conflict.

## What was observed, and what is calculated

**Observed, from the sealed bundle:** B already actionable at **2026-09-20T12:06:59.653Z**, ledger **4,776,486**, `remaining` **17,201**. Capture started 12:06:58.250Z.

**Calculated, not observed:** the first actionable ledger is **4,776,407** — `endsAt 4,793,687 − 17,280`, and `needsAction` compares `remainingLedgers <= thresholdLedgers` (`packages/core/src/ttl.ts:117`), so remaining of exactly 17,280 is already actionable. That ledger number is arithmetic and is sound.

🔴 **Its wall-clock time is an ESTIMATE, not a measurement.** An earlier version of this file stated "B crossed at 12:00:23Z" as fact. That figure came from multiplying 23 ledgers by an assumed constant five-second cadence, starting from a reading at 11:58:28Z. **Ledger close times vary; a constant cadence is an assumption, not an observation.** Corrected 2026-09-20 after review.

The estimate, kept because it is useful and now labelled:

```
first actionable ledger = 4,793,687 − 17,280 = 4,776,407        (arithmetic, sound)
last reading above      = 11:58:28Z, ledger 4,776,384, rem 17,303
23 ledgers × ~5s        ≈ 12:00:23Z                             (ESTIMATE — assumes constant cadence)
```

Rakha's independent capture in `2026-09-20-b-crossing/` observes ledger **4,776,408** at **12:00:29.335Z** with `remaining` 17,279. That **confirms the state at 4,776,408**. It does not timestamp ledger 4,776,407, and neither bundle does.

**No drift claim is made here.** An earlier version said "drift +0.0h"; that came from the projection-comparison tool, not from any measurement of when the crossing actually occurred, and it is withdrawn.

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

## Why the shared `ContractCode` entry is HEALTHY here and refused in the rehearsals

Both records are correct, and the contrast is what explains them.

| | shared code entry | why |
|---|---|---|
| **This capture** — real 17,280 threshold | `HEALTHY`, 514,340 remaining. **No refusal** | it has ~514k ledgers left, so it is **not a candidate**. The engine never proposes writing to it, so the guard is never consulted |
| **Off-date rehearsals** — `BELOW=1500000` | **`REFUSED BY WRITE GUARD`**, by ledger key | the forced threshold made it a candidate, so the engine proposed it and the guard refused |

A reader comparing this record against a rehearsal sees a refusal in one and not the other, and would reasonably conclude something is missing here. **Nothing is missing.** The guard refusing requires something to refuse, and at the real threshold there was only B.

That is also why B's refusal is the stronger evidence: it happened without anyone tilting a threshold to produce it.

## This directory is the secondary capture

Taken on Fatih's machine by the primary watcher, in a **git worktree** of the repository — so the path is `…/.claude/worktrees/week-2-execution-1258fa`, not the repository root. Same repo, same remote, same commit. The `-local` suffix in the directory name marks it as the second independent record; Rakha's is at `2026-09-20-b-crossing/` and was taken one ledger after the crossing.

## Limits

- The capture ran at **12:06:55Z**, about six minutes after the crossing, not at the 12:05 target — the poller defect cost that time. Rakha's capture at ledger 4,776,408 covers the moment itself.
- 🔴 **No terminal screenshot, and I stopped trying.** The first attempt failed outright (no screen-recording permission). After permission was granted, `screencapture -x` succeeded and captured **the wrong window** — an unrelated browser page with personal content in frame. It was deleted unstaged and never committed. A full-screen capture cannot be scoped from here, and window-targeted capture needs a `CGWindowID` this environment cannot obtain. **A human must take this one.** `transcript.txt` is a plain-text record and is explicitly not a substitute.
