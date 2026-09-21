# Sep 20 pre-flight — readiness Friday September 18

**B crosses its action threshold (17,280 ledgers) ~2026-09-20 12:00 UTC and expires ~2026-09-21
12:00 UTC.** The expiry cannot be re-armed inside this sprint. C is the only
spare, five days later.

A supplied the scheduled-save proof. B supplies natural decay and guard refusal,
observed through the read-only probe. A manual observation is recorded as manual;
a GitHub cron run cannot stand in for it because dogfood selects only A.

**If you are reading this ON the day — Sun Sep 20 or Mon Sep 21 — go straight to
§3, §3b and §4.** The "Friday checklist" below was the readiness pass; it ran on
Sep 18 and nothing in it has to be repeated tonight. Nothing on this page should
first be *attempted* on the day, which is what that pass was for.

---

## Who is watching, and what they do

<!-- BEGIN GENERATED: crossing-schedule (full) -->

**guinea-pig B is below its action threshold for 24 hours** — from ~2026-09-20 12:00 UTC to ~2026-09-21 12:00 UTC. Four captures across that window give a decay curve rather than two endpoints.

| Time (UTC) | WIB | B remaining | What it is | Primary | Backup — runs it if nothing is committed by |
|---|---|---|---|---|---|
| **Sun 2026-09-20 12:00** | Sun 19:00 | 17,280 | the crossing | **Rakha** | Fatih, 12:20 UTC |
| **Mon 2026-09-21 00:00** | Mon 07:00 | 8,640 | first decay reading | **Rakha** | Fatih, 00:20 UTC |
| **Mon 2026-09-21 06:00** | Mon 13:00 | 4,320 | second decay reading | **Rakha** | Fatih, 06:20 UTC |
| **Mon 2026-09-21 12:00** | Mon 19:00 | 0 | expiry — happens once | **Rakha** | Fatih, 12:20 UTC |

### The backup trigger is a wall clock, not a judgement

> **If no capture for that window is committed by the time in the last column, the backup runs it.** Not *"if it looks like it did not happen."*

**Being backup still means being present.** The backup has to look at that time to know whether to act. It reduces the precision required, not the attendance — two people on one task is how a task gets done zero times, and redundancy only works when the roles differ and the handover has a clock on it.

### Deliberately declined

- **Sun 2026-09-20 18:00 / Mon 01:00 WIB** — declined 2026-09-16. Not for want of a volunteer — it is the wrong place for a checkpoint. It would have made the sequence dense early and left a twelve-hour gap running into expiry, which is the interval a reader actually asks about. The 06:00 UTC slot fills that gap instead, and costs a lunchtime rather than a night.

Recorded rather than omitted: a slot that is simply missing reads as an oversight, and the next person re-proposes it.

<!-- END GENERATED: crossing-schedule -->

> 🔧 **The table above is generated from
> [`ops/crossing-schedule.json`](../ops/crossing-schedule.json). Do not edit it by
> hand** — `pnpm check:schedule` fails the build if it drifts from that file.
>
> It is generated because the hand-written version failed. On 2026-09-15 a §5b was
> added to this page naming Rakha, while the handoff table three screens above still
> named Fatih; the document contradicted itself about who was watching, on the one
> page where that question has a date attached. Two other operational pages said
> *"Fatih remains primary operator"* at the same time. Four documents, three answers.
>
> **A summary table restating the sections below it is a second source of truth**,
> and whoever edits a section has no reason to scroll up. So the sections below
> explain *why*, and deliberately do not restate who or when. If you are about to
> type a name or a time into this page, it belongs in the JSON instead.

### 🔴 Dispatch by hand at each checkpoint. Do not wait for the scheduler.

```bash
gh workflow run engine-cron.yml --ref main
```

**Corrected 2026-09-14.** An earlier draft said "dispatch if no scheduled run
appears between 12:00 and 14:00". That trigger was wrong: measured across two
workflows the scheduler delivers only a **small fraction** of its declared slots,
with a median gap measured in **hours**
([the dated measurement](evidence/2026-09-14-scheduler-cadence/README.md)).

**Recompute rather than quote — `pnpm measure:cadence`.** The figures in that
measurement were already superseded twice: its worst gap was recorded at 331, then
369 the next day, and the delivery share moved again inside a single session.
`WORST_OBSERVED_SCHEDULER_GAP_MINUTES` carries the recorded worst and the command
prints today's. A two-hour
silence is not a signal — it is the median. A trigger that fires on normal
behaviour is noise, and noise on the one day that matters is worse than no
trigger.

So the manual dispatch is the **primary action**, not the fallback. Any
scheduled run that also lands is a bonus.

**Dispatch by hand at every checkpoint in the generated table above** — that is
where the times live, and it is the only place they are written down. Actual ledger
state, not the clock estimate, determines whether the boundary has been crossed.

---

## Friday checklist

### 1. The schedule covers the window

- [ ] `gh run list --workflow engine-cron.yml --json event,status,conclusion,createdAt`
      shows recent `schedule` runs succeeding. *(`--json event` alone cannot show
      success — it emits only the trigger. Corrected 2026-09-20.)*
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

### 3b. 🔴 Capture at every checkpoint. The window is a day, not a moment.

**Being below the alert threshold is a STATE, not an event.** Once B is under
17,280 remaining it stays under until expiry — roughly twenty-four hours. It does
not pass by while you are fixing something.

That changes what to do when a capture fails. **A capture that dies on a flaky RPC
at 12:00 is a retry, not a lost proof.** Somebody who believes they have one shot
at noon will improvise under pressure; somebody who knows they have a day will
re-run. The failure mode this page most needs to prevent is a person inventing a
workaround because they think the evidence is escaping.

**So capture at every checkpoint in the generated table, not once.**

- [ ] one capture per row of the table, into its own **new** directory under the
      gitignored `.evergreen/crossing/` — e.g.
      `pnpm capture:crossing --subject B --output .evergreen/crossing/B-20260921-0600`
- [ ] the three captures **while B is still live** verified with
      `--require-crossing`; the **expiry capture is the exception** — see the box
      below. Each committed (§4 — **the committed directory's date must be that
      capture's own UTC date**)

> 🔴 **`--require-crossing` is for the three captures while B is BELOW the
> threshold and still live. Do NOT use it on the Monday 12:00 expiry capture.**
> It exits 2 unless the capture qualifies as `crossing-refused`, and at expiry it
> will not — so the flag fails on a perfectly good observation, on the one event
> that happens once. Verified on this build 2026-09-20: plain `pnpm verify:crossing
> <dir>` **exit 0**, the same directory with `--require-crossing` **exit 2**.
>
> 🔴 **But exit 0 is NOT the expiry acceptance criterion. Require phase
> `expiry-observed`.**
>
> **For expiry, use an earlier verified live B baseline, run plain
> `pnpm verify:crossing <dir>` without `--require-crossing`, and require phase
> `expiry-observed`.** That phase already exists on this build —
> `scripts/crossing-capture-common.mjs:171`, with its own `EXPIRY_NOT_PROVEN` and
> `BASELINE_OR_CONTROL_CHANGED` guards. **A live `before-action` or
> `crossing-refused` bundle also verifies with exit 0**, so an operator treating
> exit 0 as the criterion could declare the expiry proven *before it happened*.
>
> TTL zero is still live: retain boundary observations and retry after both the
> instance and persistent expiry ledgers have passed.
>
> *Corrected 2026-09-20 after review. An earlier version of this box said
> `expiry-observed` was unpublished and coming in a separate change. That was
> wrong — it is on `main` and has been. The claim came from grepping
> `capture-crossing-probe.mjs`, finding the baseline-validation list
> `['before-action', 'crossing-refused']`, and reading it as the full phase set.
> The phase is assigned in a different file.*

This costs nothing extra: the dispatches are already scheduled. What it buys is
**a decay sequence rather than a single reading** — B measurably closer to expiry
at each observation, with the guard refusing at each one. That is the difference
between *"we observed this state"* and *"we watched it happen"*, and it is the
stronger claim for the same effort.

The spacing is weighted toward the end on purpose. A reader of the evidence asks
*"what happened between the last reading and expiry"*, not *"what happened in the
first six hours"* — which is why one evenly-earlier slot was declined rather than
taken, and the reason is recorded in the table above rather than left to look like
an oversight.

It is also redundancy on the least repeatable thing in the sprint. **If any one
capture fails, the others still carry the proof.**

The crossing gate is satisfied by any one qualifying bundle, so the later
captures are belt-and-braces rather than more chances to get it wrong. *(This
sentence said "three" until 2026-09-19, when the table had held four for three
days — the same summary-versus-table drift this page is generated to prevent,
in the one paragraph an operator reads immediately before acting. It no longer
states a count: the table does.)*

### 4. The record is committed the same day

- [ ] commit the **verified capture bundle** as the crossing artifact. Download the cron artifact separately only as scheduler context — it cannot contain the B refusal
- [ ] 🔴 **Use exactly this layout. One committed directory per capture, named for
      THAT capture's own UTC date, with the bundle in a `capture/` subdirectory and
      the probe output beside it — not in it.**

```
docs/evidence/2026-09-20-b-crossing/          <- Sunday 12:00
                 capture/                     <- the whole verified bundle
                     manifest.json
                     …
                 probe.txt                    <- OUTSIDE capture/
docs/evidence/2026-09-21-b-crossing-0000/     <- Monday 00:00, its own directory
docs/evidence/2026-09-21-b-crossing-0600/     <- Monday 06:00
docs/evidence/2026-09-21-b-crossing-1200/     <- Monday 12:00, the expiry
```

Verify the bundle by its own path: `pnpm verify:crossing docs/evidence/<dir>/capture`.
Copy each bundle out of `.evergreen/crossing/`, which is gitignored and commits
nothing on its own.

> 🔴 **Measured 2026-09-20 — the two layouts are not equivalent.** Bundle and
> `probe.txt` flat in one directory: `verify:crossing` **exit 2**. Bundle in
> `capture/` with `probe.txt` in the parent: **exit 0**. A capture bundle's manifest
> lists its own files, so any extra file dropped inside fails verification.
>
> Until this morning §4 carried both shapes in adjacent bullets — one bullet said
> "beside `…/capture/`" and the next named `2026-09-20-b-crossing/` as the directory
> itself. Each was correct alone; followed in the order written they produce the
> flat layout, which is the failing one. Two fixes made hours apart on 2026-09-19,
> each closing a real defect, together opening this one.

> 🔴 **Why the date is not cosmetic.** `check-crossing-evidence.mjs` requires the
> directory's date to EQUAL the bundle's own `observedAt` date
> (`dated[1] === result.observedAt.slice(0, 10)`, line 120). **Three of the four
> captures happen on Sep 21.** A Monday bundle committed under a `2026-09-20-…`
> path is silently not counted — the file is there, it verifies, and the gate
> still reports the evidence missing.
>
> This instruction previously named a single `2026-09-20-b-crossing/` directory,
> which contradicted [`W3-D18-03-CAPTURE.md`](W3-D18-03-CAPTURE.md) — *"use the
> actual UTC capture date in the eventual published evidence path"* — on exactly
> this point. The Sunday capture alone would still have turned the gate green, so
> nothing would have looked wrong; but in §3b's own planned failure mode, where
> Sunday's capture dies on a flaky RPC and Monday's is the proof, following this
> page literally left a correct capture uncounted and a red gate to debug at
> midnight. Corrected 2026-09-19.
- [ ] **an artifact is a log; a commit is evidence.** Artifacts expire; the
      grant submission is Oct 2

### 5. Verify the enforcement in BOTH directions

- [ ] **before committing**, run `node scripts/check-crossing-evidence.mjs` with
      `EVERGREEN_TODAY=2026-09-20` — it must go **RED**
- [ ] **after committing**, run it again — it must go **GREEN**

Checking only the green half proves nothing: a check that passes because it
cannot see the subject looks identical to one that passes because the subject is
correct.

> ⚠️ **The RED output tells you to run `node scripts/b-crossing-probe.mjs`. §3
> demotes that tool.** The gate accepts either a verified capture bundle or probe
> text carrying the refusal, so its advice is not wrong — but **§3 is the current
> path**: capture first, probe as the readable record beside it. The gate's message
> predates the capture tool and has not been rewritten, because changing a script
> today is not worth the risk. Ignore that one line; follow §3. Flagged 2026-09-20.

### 5b. 🔴 Who is at a terminal — the rules behind the table

**Names, times and triggers are in the generated table at the top of this page.**
This section is the reasoning, and holds no schedule of its own.

**An assignment is a notification, not a commitment.** Every slot needs an explicit
*yes* from the named person, per slot — not one yes for "the weekend", and never an
absence of objection. The crossing and the expiry are two different jobs with two
different failure modes: the crossing window is hours wide, so a late start is
recoverable; **the expiry happens once**, and the whole natural-decay proof is that
moment. A single yes covering both hides that difference.

**A slot still being asked about is marked as such and is not coverage.** A table
that quietly lists a name somebody never agreed to is worse than a blank, because
it stops anyone looking for a replacement.

**What the backup does.** §3 of this page, unchanged. The probe is read-only, the
guard refuses B regardless, and nothing here requires a signer — so **the backup
needs no credentials and can do no harm**. The only way to lose the evidence is for
nobody to run it.

**What the backup must not assume.** The trigger in the table is a wall clock, not
an appraisal: if no capture for that window is committed by that time, run it.
"Someone is probably on it" is how a task with two owners gets done zero times.

### 5d. The watcher config that actually starts

**Use [`ops/weekend-watch.json`](../ops/weekend-watch.json).**

```bash
pnpm scheduler:watch --config ops/weekend-watch.json --send-alerts
```

The readiness bundle's `watch.json` sets `warnMinutes: 30`, which the floor added
in #169 rejects — the watcher **throws on startup** and does not run, for the whole
window including Sunday. Verified: that config exits 2, this one exits 0.

> ⚠️ **`inactive` is no longer what you will see.** That was the expected output
> before the window opened. The window runs **Sep 18 00:00 → Sep 21 18:00 UTC** and
> is open now, so this command reports an **active** assessment with a live
> `overdueMinutes` — which is correct, not a fault. Corrected 2026-09-20.

Only `warnMinutes` differs (30 → 420, between the measured worst gap and the
agreed bound). Everything else — window, `criticalMinutes`, `maxRunMinutes`,
repository, workflow, job — is unchanged from the readiness config, and its
`stateRoot` is repo-relative so the fallback operator in §5b can run it too.

It is a **stand-in**, written so nobody had to wait for a config to be corrected.
Rakha's installed watcher now runs the same policy (warn 420 / critical 540,
published in #177), verified at the boundaries: the transitions are at exactly 420
and 540, inclusive. The evidence bundle is untouched.

### 5e. 🔴 If the watcher fails, its message will not name the cause

**The installed watcher runs a pinned runtime that predates #175.** The pin stays —
re-pinning it would invalidate the verification already done against that exact
build — so this is a translation, not a defect to fix on the day.

A failure will print a **generic** line naming no guard. The exact wording depends
on which build is running:

```
Watcher failed; inspect retained state
```

> ⚠️ **That literal string is what Rakha's pinned runtime emits, not what this
> repository builds today.** Do not pattern-match on it. The point survives either
> way: **the message will not name the cause**, whichever of the two you are
> looking at. Checked 2026-09-20.

**#175 would have named which guard refused. This build will not.** So: *if you see
that line, check the watcher policy first.* It covers a config the floor rejected at
startup — the failure mode that would otherwise take a night of reading source to
find, on a night when nobody is reading source.

`ops/weekend-watch.json` is the config that starts; the readiness bundle's
`watch.json` is the one that does not (§5d).

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

> ## 🔴 What slot 4 actually looks like — read this BEFORE 19:00 WIB
>
> **No capture in this repository has ever observed an absent instance.** This code path
> has not run on real data, so "something unexpected appeared" and "it worked" are
> otherwise indistinguishable under time pressure. Derived from
> `scripts/crossing-capture-common.mjs:125–172` and `packages/core/src/ttl.ts:72`,
> 2026-09-21.
>
> ### The numbers that decide it
>
> B has **two** entries that must both expire, one ledger apart:
>
> | entry | ends at ledger |
> |---|---|
> | instance | **4,793,687** |
> | persistent | **4,793,688** |
>
> `hasExpired(r)` is `r < 0`, so **`remaining: 0` is still live.** Both entries must be
> *past* their end, so `expiry-observed` needs an observed ledger of **4,793,689 or
> higher**. Not 4,793,687.
>
> ### ✅ Success — what you should see
>
> ```
> pnpm capture:crossing --subject B --baseline <sunday-bundle>/capture --output <dir>
>   -> {"phase":"expiry-observed", ...}
> pnpm verify:crossing <dir>          # NO --require-crossing
>   -> exit 0, phase expiry-observed
> ```
>
> A manual `scan` at that point reports `entry-not-found` for B's instance and persistent,
> with *"Absence is not proof of archival or deletion"*, and **exits 3**
> (`EXIT_INCOMPLETE`). **Exit 3 is correct here**, not a failure.
>
> ### ⏳ Wait and retry — B has not fully expired
>
> | You see | Why | Do |
> |---|---|---|
> | `crossing-refused` | B still resolves. Remaining 0 is still live | wait, re-run |
> | `EXPIRY_NOT_PROVEN` | **the most likely one** — instance gone but persistent not yet past 4,793,688 | wait until the observed ledger is ≥ 4,793,689, re-run |
> | `before-action` | should not happen while B is below threshold | re-run once; if it repeats, escalate |
>
> **None of these is a failure and none needs a workaround.** The window after expiry does
> not close — retry is always correct.
>
> ### 🔴 Stop and escalate — do not retry
>
> | You see | What it means |
> |---|---|
> | `SUBJECT_EXPIRY_CHANGED` | **B's `endsAt` moved — B was extended.** The proof is destroyed |
> | `BASELINE_OR_CONTROL_CHANGED` | **the shared `ContractCode` entry's `endsAt` changed — someone extended it.** Destroys C's proof too |
> | `CONTROL_UNAVAILABLE` | A or the shared entry no longer live |
> | `UNPINNED_RUNTIME` | the capture runtime changed under the baseline |
>
> ### One that is neither
>
> `BASELINE_REQUIRED` means `--baseline` was omitted. Fix the command and re-run — it is a
> typo, not an incident.


> 🔴 **TONIGHT'S CAPTURE IS A PREREQUISITE FOR THIS, NOT INSURANCE AGAINST IT.**
> The expiry capture takes `--baseline` pointing at an earlier capture of B taken
> while it was **still live**, and `capture-crossing-probe.mjs` refuses a baseline
> that is a rehearsal, that carries its own baseline, or whose phase is not
> `before-action` / `crossing-refused` (lines 57–61). **No live baseline, no expiry
> proof** — "we observed it gone" without a verified reading of it alive is not the
> claim.
>
> ```bash
> pnpm capture:crossing --subject B \
>   --baseline docs/evidence/2026-09-20-b-crossing/capture \
>   --output .evergreen/crossing/B-expiry
> ```
>
> **So do not clear `.evergreen/crossing/` between Sunday and Monday**, and if you
> do, point `--baseline` at the committed copy under
> `docs/evidence/2026-09-20-b-crossing/capture` instead — which is the reason §4
> says to commit it the same day rather than at the end of the weekend.
>
> Neither this page nor `W3-D18-03-CAPTURE.md` stated the dependency; the flag
> appears in a code block there with no explanation. Found by Rakha's audit,
> written here 2026-09-20.

- [ ] compare a current read with the recorded instance/persistent expiry ledgers. Remaining TTL zero is still live. If RPC no longer returns an entry after its known expiry, retain the actual missing-entry output and a successful A/shared control read; do not invent a CLI verdict or restore B to check it
- [ ] 🔴 commit that scan in **its own dated directory**,
      `docs/evidence/2026-09-21-b-crossing-1200/`, under the §4 layout — **not**
      inside the Sunday directory. *(This bullet read "commit it alongside the
      Sunday crossing record" until 2026-09-20. The gate requires the directory's
      date to equal the capture's `observedAt` date, so a Monday capture filed
      under a `2026-09-20-…` path is silently not counted — the same defect §4 was
      corrected for on 2026-09-19, surviving in this section.)*
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
