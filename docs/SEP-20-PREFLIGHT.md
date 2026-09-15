# Sep 20 pre-flight — readiness Friday September 18

**B crosses its action threshold (17,280 ledgers) ~2026-09-20 12:00 UTC and expires ~2026-09-21
12:00 UTC.** The expiry cannot be re-armed inside this sprint. C is the only
spare, five days later.

A supplied the scheduled-save proof. B supplies natural decay and guard refusal,
observed through the read-only probe. A manual observation is recorded as manual;
a GitHub cron run cannot stand in for it because dogfood selects only A.

Run every item on **Friday Sep 18**. Nothing here should first be attempted on
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

Dispatch again at **~18:00** and **~00:00** to bracket the window. These
three checkpoints cover the first twelve hours. Check expiry separately at about
12:00 UTC on September 21; actual ledger state, not the clock estimate, determines
whether the boundary has been crossed.

---

## Friday checklist

### 1. The schedule covers the window

- [ ] `gh run list --workflow engine-cron.yml --json event` shows recent
      `schedule` runs succeeding
- [ ] worst observed gap is still well under 24h — recompute, do not assume
- [ ] **`timeout-minutes` is still below the cron interval** — `pnpm check`
      enforces this now, so a green check is sufficient

> **Before Saturday, read [`W3-SEP18-READINESS.md`](W3-SEP18-READINESS.md).** It
> records what was verified at the September 18 gate — cadence, observer, the B and
> C preflight captures — so this page starts from a known state rather than an
> assumed one.
>
> Linked from here deliberately. The readiness record referenced this page as soon
> as it was written, because its author knew this page existed; this page had no
> reason to reference it, because its author did not know it would be written. That
> asymmetry means the link that gets written is the one nobody needs, and the
> operator opens the *older* page. Superseding or complementing a document means
> editing the other one.

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

> **Rehearsed 2026-09-15.** This whole procedure was walked end to end with
> `EVERGREEN_TODAY=2026-09-20`, and it found two defects — a command that breaks
> on the re-run this section tells you to do, and a capture tool this document
> never mentioned. Both are fixed below. The gate was confirmed RED → GREEN →
> RED, with C staying RED independently.

**Use the capture tool. It is verified; the probe output is not.**

`pnpm capture:crossing` writes a manifest that
[`verify-crossing-capture.mjs`](../scripts/verify-crossing-capture.mjs) checks,
and `check-crossing-evidence.mjs` accepts such a bundle only when it genuinely
qualifies: phase `crossing-refused`, the **real** 17,280 threshold, and an
observation dated on or after the alert threshold. A rehearsal cannot satisfy it
even if filed under the right date.

```bash
pnpm capture:crossing --subject B --output .evergreen/crossing/B-crossing
pnpm verify:crossing .evergreen/crossing/B-crossing --require-crossing
```

- [ ] `--require-crossing` exits non-zero unless the capture actually qualifies.
      **That exit code is the check** — do not read the JSON and decide for yourself
- [ ] full operator detail, including the C and expiry captures, is in
      [`W3-D18-03-CAPTURE.md`](W3-D18-03-CAPTURE.md). Read it alongside this page

**The probe stays as the fast human-readable look**, and as the fallback if the
capture tooling itself fails on the day. It builds its config in memory, so there
is no file on disk the scheduler could ever be pointed at, and it is read-only:
no payer resolves, no secret is read, the engine is decide-only and the guard
refuses regardless.

```bash
probe_capture=$(mktemp /tmp/w3-b-crossing.XXXXXX)
env -u BELOW node scripts/b-crossing-probe.mjs > "$probe_capture" 2>&1
probe_exit=$?
cat "$probe_capture"
printf 'probe_exit=%s capture=%s\n' "$probe_exit" "$probe_capture"
```

> The template must end in the `X`s. It previously read
> `/tmp/w3-b-crossing.XXXXXX.txt`, which **BSD/macOS `mktemp` does not
> substitute** — the first run wrote a literally-named file and the second failed
> with `mkstemp failed … File exists`, returning an empty path so the redirect
> broke. On the one day this page exists for, and on the re-run it tells you to
> do.

- [ ] run it with **no `BELOW`** (the command explicitly removes inherited overrides) — the point is that B is genuinely below the
      real 17,280 threshold. If it reports *"seen but still above the threshold"*,
      the crossing has not happened yet: **re-run later, do not lower the
      threshold to force it**
- [ ] validate the subject, real 17,280 threshold, actual read/decisions and `REFUSED BY WRITE GUARD` naming B. Exit 0 alone is not qualifying evidence: the probe also exits 0 when the subject is above threshold or absent
- [ ] A appears in the same record — a run containing only a refusal cannot show
      the engine was working, because *"refused everything"* and *"decided
      nothing"* look identical
- [ ] rehearsed in advance with `BELOW=1500000`, which forces candidacy off-date
      and was confirmed to produce the refusal on 2026-09-14

### 3b. 🔴 Capture three times. The window is a day, not a moment.

**Being below the alert threshold is a STATE, not an event.** Once B is under
17,280 remaining it stays under until expiry — roughly twenty-four hours. It does
not pass by while you are fixing something.

That changes what to do when a capture fails. **A capture that dies on a flaky RPC
at 12:00 is a retry, not a lost proof.** Somebody who believes they have one shot
at noon will improvise under pressure; somebody who knows they have a day will
re-run. The failure mode this page most needs to prevent is a person inventing a
workaround because they think the evidence is escaping.

**So capture at each of the three dispatches — 12:00, 18:00 and 00:00 UTC — not
once.**

- [ ] `pnpm capture:crossing --subject B --output <dir>-1200` at ~12:00 UTC
- [ ] again at ~18:00 into `…-1800`
- [ ] again at ~00:00 into `…-0000`
- [ ] each verified with `--require-crossing`, and each committed

This costs nothing extra: the dispatches are already scheduled above. What it buys
is **a decay sequence rather than a single reading** — B measurably closer to
expiry at each observation, with the guard refusing at each one. That is the
difference between *"we observed this state"* and *"we watched it happen"*, and it
is the stronger claim for the same effort.

It is also redundancy on the least repeatable thing in the sprint. **If any one
capture fails, the others still carry the proof.**

The crossing gate is satisfied by any one qualifying bundle, so three is
belt-and-braces rather than three chances to get it wrong.

### 4. The record is committed the same day

- [ ] commit the **verified capture bundle** as the crossing artifact; keep the probe output beside it as the readable record. Download the cron artifact separately only as scheduler context — it cannot contain the B refusal
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

### 5b. 🔴 Who is at a terminal, and what happens if they are not

**Assigned 2026-09-15: Rakha watches Sunday Sep 20 and Monday Sep 21.**

They are two different jobs and need separate confirmation:

| Day | What it is | Repeatable? |
|---|---|---|
| **Sun Sep 20** | dispatch, run the probe, capture the refusal, commit it | the crossing window is hours wide |
| **Mon Sep 21** | be present for B's expiry | **no** — it happens once |

An assignment is a notification, not a commitment. **This needs an explicit yes
for each date**, not an absence of objection.

**If the named watcher does not appear.** Fatih has stepped back from watching, so
as written there is a single point of failure on the least repeatable evidence in
the sprint. The fallback is therefore stated rather than assumed:

- **Reachable on the day:** Fatih, by the channel already used for coordination.
  If Rakha has not posted to the tracking issue by **12:00 UTC on the day**,
  assume he is unavailable and proceed.
- **What the fallback person does:** §3 of this page, unchanged. The probe is
  read-only, the guard refuses B regardless, and nothing here requires a signer —
  so the fallback needs no credentials and can do no harm. **The only way to lose
  the evidence is for nobody to run it.**

### 5d. The watcher config that actually starts

**Use [`ops/weekend-watch.json`](../ops/weekend-watch.json).**

```bash
pnpm scheduler:watch --config ops/weekend-watch.json --send-alerts
```

The readiness bundle's `watch.json` sets `warnMinutes: 30`, which the floor added
in #169 rejects — the watcher **throws on startup** and does not run, for the whole
window including Sunday. Verified: that config exits 2, this one exits 0 and
reports `inactive` until the window opens.

Only `warnMinutes` differs (30 → 420, between the measured worst gap and the
agreed bound). Everything else — window, `criticalMinutes`, `maxRunMinutes`,
repository, workflow, job — is unchanged from the readiness config, and its
`stateRoot` is repo-relative so the fallback operator in §5b can run it too.

It is a **stand-in**, written so nobody had to wait for a config to be corrected.
If Rakha ships his own, use that and delete this one. The evidence bundle is
untouched.

### 5c. 🔴 If Sunday is missed — C is the only second shot

Written here because somebody discovering this on Sunday night will improvise,
and somebody reading it beforehand will act.

**Guinea-pig C crosses ~2026-09-25 12:00 UTC and expires ~2026-09-26.** It is the
*only* backup. There is no third subject, and a new one cannot be deployed and
aged inside this sprint — the measured floor is about seven days, which is why B
was deployed on Day 4.

Three things must stay true for C to still work, and two of them are things
somebody could helpfully break:

1. **C is never extended.** `write-guard.ts` refuses it unconditionally, and it
   stays in `_doNotWatch`. Neither is a date check — both hold regardless.
2. **The shared `ContractCode` entry is not extended before C's capture.**
   `W3-D18-02d` is dated **Sat Sep 26, after C's crossing**, and is blocked until
   `W3-D18-02b` and `W3-D18-02c` are captured. A, B and C share **one** code
   entry, so it cannot be extended for one contract only — doing it early to be
   helpful destroys the remaining proof. The row says so; this is the second
   place it is said.
3. **Somebody is at a terminal on Sep 25 and Sep 26**, under the same rules as
   §5b. Sep 25 is a **Friday** — a working day, which is a point in C's favour and
   an argument for treating B as the proof that may be observed imperfectly.

The crossing gate already enforces the capture for both subjects independently:
it is RED at Sep 20 for B and RED at Sep 25 for C, and satisfying one does not
satisfy the other.

### 6. 🔴 Nobody "fixes" the refusal

**The refusal is the evidence.** On Friday or Sunday, someone looking at a
`SKIP — REFUSED BY WRITE GUARD` line will think the demo is broken.

It is not. `W3-D18-02b` decided that **B expires and the engine does not save
it**. Three proofs come out of that sequence: detection works, the guard works
live against a real protected subject, and the decay is real.

Anyone adjusting the target list, editing `_doNotWatch`, or weakening
`write-guard.ts` to produce a save is **destroying evidence, not repairing a
bug**. If the engine genuinely needs either weakened, that is a conversation
before Sunday, not a patch during it.

---

## Monday Sep 21 — the expiry

- [ ] compare a current read with the recorded instance/persistent expiry ledgers. Remaining TTL zero is still live. If RPC no longer returns an entry after its known expiry, retain the actual missing-entry output and a successful A/shared control read; do not invent a CLI verdict or restore B to check it
- [ ] capture that scan and commit it alongside the Sunday crossing record
- [ ] `W1-D4-09`'s drift obligation closes here, whether or not drift was ever
      observed

## Then C, Sep 25–26

C has two distinct obligations. **Minimum read-only crossing/refusal capture is
required on September 25**, because the current date gate covers both subjects
and the shared-code handoff needs C evidence. Run the same probe with `SUBJECT=C`
and `BELOW` unset. If B succeeded, record C as unused for the *full backup decay
proof*, with its minimum control capture attached. Full expiry observation on
September 26 is required if C is used as the replacement proof.

This preserves the existing gate rather than inventing a synthetic refusal or
making C disappear from it. Shared-code extension remains Fatih's task on the
September 26 gate, after the required B/C evidence is accepted. The date does not
automatically unlock the write guard or authorize an override.

## What the September 18 gate means

The allowed B/C observation and capture path, operator/backstop and negative/positive
rehearsal checks must be ready by Friday September 18. The unattended *save* claim
belongs to A's separately reviewed proof (#130/#147). These manual B/C instructions
do not claim unattended B execution. If a reviewer additionally requires unattended
B observation, schedule the same read-only producer in an agreed bounded window;
do not enable a live B config to obtain that claim. Shared acceptance remains explicit.
