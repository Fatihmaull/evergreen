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

### 🔴 Dispatch by hand at 12:00 UTC. Do not wait for the scheduler.

```bash
gh workflow run engine-cron.yml --ref main
```

**Corrected 2026-09-14.** An earlier draft said "dispatch if no scheduled run
appears between 12:00 and 14:00". That trigger was wrong: measured across two
workflows the scheduler delivers **~7.5%** of declared slots with a **median gap
of 136–212 minutes and a worst observed gap of 331 minutes**
([measurement](evidence/2026-09-14-scheduler-cadence/README.md)). A two-hour
silence is not a signal — it is the median. A trigger that fires on normal
behaviour is noise, and noise on the one day that matters is worse than no
trigger.

So the manual dispatch is the **primary action**, not the fallback. Any
scheduled run that also lands is a bonus.

Dispatch again at **~18:00** and **~00:00** to bracket the window. Three
deliberate runs across 24 hours cost nothing and do not depend on a scheduler
that misses nine slots in ten.

---

## Friday checklist

### 1. The schedule covers the window

- [ ] `gh run list --workflow engine-cron.yml --json event` shows recent
      `schedule` runs succeeding
- [ ] worst observed gap is still well under 24h — recompute, do not assume
- [ ] **`timeout-minutes` is still below the cron interval** — `pnpm check`
      enforces this now, so a green check is sufficient

### 2. The engine detects B, distinguishably from finding nothing

> **Corrected 2026-09-14.** This section previously said to leave B in
> `_doNotWatch` because "the engine still scans and decides, the guard still
> refuses". **That is false and it would have cost Saturday.** `_doNotWatch` is
> documentation — `config.ts` says so in as many words — and `runEngine`
> iterates `contracts`. Measured against the real dogfood config: **2 decisions,
> A's instance and the shared code entry, B absent, no refusal anywhere.** The
> scheduled cron cannot produce B evidence, and §3 below required it.

- [ ] **B stays in `_doNotWatch`. Do not move it into `contracts`** — that spends
      one of the two independent layers protecting it for the sake of a log line
- [ ] the scheduled `engine-cron` run is expected to show **A only**; that is
      correct and is not the B evidence
- [ ] a dispatched run still produces a record with `decisions` non-empty
- [ ] that record distinguishes *"saw no work"* from *"did not run"* — an absent
      artifact is the second, and it is a different failure

### 3. The guard refuses, and the refusal is in the record

**The refusal comes from `scripts/b-crossing-probe.mjs`, not from the cron.** It
builds its config in memory, so there is no file on disk the scheduler could ever
be pointed at, and it is read-only: no payer resolves, no secret is read, the
engine is decide-only and the guard refuses regardless.

```bash
node scripts/b-crossing-probe.mjs | tee /tmp/b-crossing.txt; echo "exit=${PIPESTATUS[0]}"
```

- [ ] run it with **no `BELOW`** — the point is that B is genuinely below the
      real 17,280 threshold. If it reports *"seen but still above the threshold"*,
      the crossing has not happened yet: **re-run later, do not lower the
      threshold to force it**
- [ ] the output contains `REFUSED BY WRITE GUARD` naming B
- [ ] A appears in the same record — a run containing only a refusal cannot show
      the engine was working, because *"refused everything"* and *"decided
      nothing"* look identical
- [ ] rehearsed in advance with `BELOW=1500000`, which forces candidacy off-date
      and was confirmed to produce the refusal on 2026-09-14

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
