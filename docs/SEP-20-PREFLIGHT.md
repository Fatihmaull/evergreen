# Sep 20 pre-flight — run this Friday, not Saturday

**B crosses its alert threshold ~2026-09-20 12:00 UTC and expires ~2026-09-21
12:00 UTC.** The expiry cannot be re-armed inside this sprint. C is the only
spare, five days later.

Most of Saturday is unattended by design, which is the point and also the risk:
**an unattended run that silently does not happen produces the same evidence as
one that ran and found nothing.** Everything below exists to tell those apart.

Run every item on **Friday Sep 19**. Nothing here should first be attempted on
the day.

---

## Who is watching, and what they do

| | |
|---|---|
| **On the day** | Fatih |
| **Backstop** | Rakha, if Fatih is unreachable |

**If no scheduled run appears between 12:00 and 14:00 UTC on Sep 20:**
dispatch one by hand —

```bash
gh workflow run engine-cron.yml --ref main
```

This is expected to be needed sometimes. The scheduler delivers ~10% of its
declared slots ([measurement](evidence/2026-09-14-scheduler-cadence/README.md)),
median gap ~132 minutes. A two-hour silence is normal; a four-hour silence is
still within observed behaviour. **Dispatch rather than wait.** A manual run at
13:00 is worth more than a scheduled one that never came.

---

## Friday checklist

### 1. The schedule covers the window

- [ ] `gh run list --workflow engine-cron.yml --json event` shows recent
      `schedule` runs succeeding
- [ ] worst observed gap is still well under 24h — recompute, do not assume
- [ ] **`timeout-minutes` is still below the cron interval** — `pnpm check`
      enforces this now, so a green check is sufficient

### 2. The engine detects B, distinguishably from finding nothing

- [ ] B is in `evergreen.config.dogfood.json` under `_doNotWatch` — **leave it
      there**; the engine still scans and decides, the guard still refuses
- [ ] a dispatched run now produces a record with `decisions` non-empty
- [ ] that record distinguishes *"saw no work"* from *"did not run"* — an absent
      artifact is the second, and it is a different failure

### 3. The guard refuses, and the refusal is in the record

- [ ] the run record contains `REFUSED BY WRITE GUARD` for B once it is below
      threshold
- [ ] the step summary shows it too, not only the JSON

### 4. The record is committed the same day

- [ ] download the run's artifact
- [ ] commit it under `docs/evidence/2026-09-20-b-crossing/`
- [ ] **an artifact is a log; a commit is evidence.** Artifacts expire; the
      grant submission is Oct 2

### 5. Verify the enforcement in BOTH directions

- [ ] **before committing**, run `node scripts/check-crossing-evidence.mjs` with
      `EVERGREEN_TODAY=2026-09-20` — it must go **RED**
- [ ] **after committing**, run it again — it must go **GREEN**

Checking only the green half proves nothing: a check that passes because it
cannot see the subject looks identical to one that passes because the subject is
correct.

### 6. 🔴 Nobody "fixes" the refusal

**The refusal is the evidence.** On Friday or Saturday, someone looking at a
`SKIP — REFUSED BY WRITE GUARD` line will think the demo is broken.

It is not. `W3-D18-02b` decided that **B expires and the engine does not save
it**. Three proofs come out of that sequence: detection works, the guard works
live against a real protected subject, and the decay is real.

Anyone adjusting the target list, editing `_doNotWatch`, or weakening
`write-guard.ts` to produce a save is **destroying evidence, not repairing a
bug**. If the engine genuinely needs either weakened, that is a conversation
before Saturday, not a patch during it.

---

## Sunday Sep 21 — the expiry

- [ ] confirm B's instance is actually expired: `pnpm cli scan <B>` reports it
      past its end, with `RestoreFootprintOp` guidance rather than extend
- [ ] capture that scan and commit it alongside the Saturday record
- [ ] `W1-D4-09`'s drift obligation closes here, whether or not drift was ever
      observed

## Then C, Sep 25–26

Identical sequence, five days later. C is the spare and the only second shot.
The shared code entry becomes extendable **Sep 26** (`W3-D18-02d`).
