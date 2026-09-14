# W3-D16-02 — across-run idempotency, proven in both directions

2026-09-14. ADR-003 deferred PostgreSQL, so this is not a lock. The claim is
that **overlapping engine runs are structurally impossible**, and the job was to
verify that for the real engine workflow and prove it *both* ways.

## The controlled experiment

Two runs dispatched ~3 seconds apart, twice — once against a workflow that
carries a concurrency group, once against one that does not. Same runner class,
same minute. Timings are **job**-level, not run-level (see the instrument note).

| workflow | concurrency group | first job | second job | result |
|---|---|---|---|---|
| `engine-cron.yml` | `engine-cron`, `cancel-in-progress: false` | 01:17:31 → 01:17:50 | **01:17:53** → 01:18:10 | **+3s — QUEUED** |
| `flake-hunt.yml` | *(none)* | 01:19:02 → 01:19:16 | **01:19:08** → 01:19:25 | **−8s — OVERLAPPED** |

The only difference between the two is the concurrency block. That is what makes
this a proof rather than an observation: without it they overlap, with it they
queue.

## ⚠️ Instrument note — the first measurement was wrong

Measured at the **run** level first, and it reported the guarded runs
overlapping by 18 seconds. `run_started_at` is when the run was *created and
queued*, not when a runner began executing it — so a queued run reports a start
time before the run ahead of it finished.

Job-level `started_at` / `completed_at` is the execution window and it reverses
the answer. Recorded because the wrong reading looked exactly like a broken
safety guarantee.

## Why the queue cannot grow without bound

`cancel-in-progress: false` queues rather than cancelling, which is correct —
cancelling a run mid-submission is how an unresolved hash is created. Queueing is
only safe while runs finish faster than they arrive:

```
engine-cron     timeout-minutes: 10   cron: every 15 minutes
scheduler-smoke timeout-minutes:  5   cron: every 15 minutes
```

**The timeout is the bound.** A run cannot exceed 10 minutes, so it cannot still
be running when the next two arrive. Raising the timeout above the cron interval
would silently convert this guarantee into an unbounded queue.

## The third clause: an in-flight transaction

"Handle an in-flight tx when overlapping scheduler runs collide."

`runEngineExecution` calls `recorder.assertReady()` before any live work, and an
existing attempt journal makes it throw `RECORDER_UNAVAILABLE`. A previous run's
unresolved hash therefore blocks the next run rather than being submitted over.

**That guard was untested.** Removing `assertReady()` left all 637 tests green —
the same shape as the three guard call sites found on 2026-09-13. Now covered:
an unready recorder must refuse live execution, send nothing, and not even read
the secret. Commissioned — removing the call fails exactly that test.
