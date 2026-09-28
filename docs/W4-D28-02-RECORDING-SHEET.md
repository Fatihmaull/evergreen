# Recording sheet — keep this open beside the terminal

**Everything here is transcribed from [`W4-D28-01-DEMO-SCRIPT.md`](W4-D28-01-DEMO-SCRIPT.md)**,
with its line ranges, so you can check any line against the source. **Nothing was
composed for this sheet.** Where the script gives no narration, this says so rather
than inventing some.

**Ordered in recording order, which is not script order.**

> ### ✅ Decided 2026-09-28 — four answers, and two of them change this sheet
>
> | | |
> |---|---|
> | **Dashboard** | **IN** — land #248 first and record the new UI. **This makes #248 a prerequisite**, see §0 |
> | **Narration** | **Live voice-over while recording** — so a fluffed line costs the video too, not just the audio |
> | **Frame** | **1080p** — geometry measured below, and beat 2 does not fit without wrapping |
> | **Runtime** | Record long, decide cuts after a first take. All beats stay in |
>
> 🔴 **A runtime figure I got backwards, corrected.** I told you the beats sum to 4:20
> *without* the dashboard. **4:20 is the total WITH it** — 40 + 50 + 60 + 45 + 45 + 20.
> **Without beat 5 it is 3:35.** Checked against the six headings.
>
> That error pushed against the decision you had already made: it made keeping the
> dashboard sound like it crowded the 5-minute ceiling. It does not. **4:20 leaves 40
> seconds of headroom inside §6.1's "3–5 minute demo"**, which is roughly what live
> narration adds over a silent read — and 3:35 is equally compliant. **Runtime does not
> decide this either way.** The figure is right in every committed file, which all mean
> the full script; the wrong claim was only in the question I put to you.
>
> Two consequences of keeping the dashboard: **it is a second live-ledger beat**, so it
> and beat 2 must be recorded adjacently and re-recorded as a pair; and it needed #248.
>
> ✅ **#248 is MERGED** — Rakha approved at 09:00Z on 2026-09-28 and it landed at
> 09:07Z. The reworked UI is deployed and smoke-tested: all eleven public routes answer,
> the scanner still returns `healthy` / `PARTIAL` / `undetermined`, and `/docs/ci/` now
> serves the corrected `evergreen@v1` workflow.
>
> **So there is no cutoff row here, and deliberately so.** A cutoff was the right
> instrument while the take sat behind someone else's review; writing one now would add
> a countdown against a condition that has already cleared — which is the stale-gate
> shape this project has spent two weeks removing. **Nothing external blocks the
> recording.**

> ## The one thing that must not be got wrong — script L29–46
>
> **This demo shows two contracts, and conflating them is a false claim to a funder.**
>
> | | Guinea-pig A | Guinea-pig B |
> |---|---|---|
> | What happened | the engine **saved** it, unattended | it **expired**, and the engine did not save it |
> | Why | the alert threshold was **raised above its remaining TTL** so the engine would fire | natural decay, on its own schedule |
>
> Say *"we raised the alert threshold above its remaining TTL so the engine would
> fire"* **out loud** for A. The combined story — *"a contract decayed naturally and
> was saved unattended"* — **did not happen on any single contract and must not be
> implied.**
>
> This is the only content risk in the whole recording that a retake cannot fix
> cheaply, because it is a claim rather than a number.

---

## 0 · Before the first take

```bash
# 1. Which version will npx actually serve? Must print 0.1.1.
npm view @evergreen-stellar/cli dist-tags.latest

# 2. npx caches. Force the published build rather than a stale one:
npx --yes @evergreen-stellar/cli@0.1.1 --help    # or clear: rm -rf ~/.npm/_npx

# 3. WARM the cache before recording — run the real beat 2 command once, off camera.
#    A cold cache makes npx print "package was not found and will be installed"
#    before the scan, which reads as an error. With live voice-over that is a retake
#    of the whole beat, not a blemish you can trim.
```

```bash
# 4. Optional but worth it: a clean prompt for the take
PS1='$ '
```

- [ ] `dist-tags.latest` prints **`0.1.1`** — not `0.1.0`
- [ ] **Network up.** Every scan is a live Testnet RPC read; there is no offline path
- [ ] **No env vars or logins needed.** Beat 2 is a permissionless read — no key, no
      account. Nothing in this recording signs or submits
- [ ] 🔴 **#248 is MERGED.** You chose to record the new UI, so this gates the whole
      session. It is `BEHIND` with Rakha's `CHANGES_REQUESTED` standing and CI green —
      **he has to clear the review; nothing you push does it.** Chased on the PR
      2026-09-27. Until it lands, the live site is the old UI and beat 5 would record
      something that stops being true the moment it merges
- [ ] **Terminal geometry — measured, not estimated.** Beat 2's real output is
      **53 lines, widest line 195 characters**:

      | | |
      |---|---|
      | lines over 100 chars | **11 of 53** |
      | lines over 80 chars | **18 of 53** |
      | the two worst | **195** and **186** — both contract-ID lists |

      **195 characters cannot fit legibly in 1920px** — it needs about a 10px font.
      So **wrapping is unavoidable at 1080p; choose it rather than discover it.**
      Suggested: **~100 columns × ~32 rows at 18–20px**. That wraps 11 lines, all of
      them harmlessly (the long ones are lists of contract IDs), and keeps everything
      readable. 53 lines still exceeds 32 rows, so **plan the scroll** — or let the
      scan finish and scroll back slowly for the camera
- [ ] 🔴 **LAST BEFORE THE FIRST TAKE — measure the cron cadence. This is the one
      prerequisite that cannot be done afterwards.**

      ```bash
      pnpm measure:cadence
      ```

      **Read the value off the `delivered:` line**, e.g. `delivered: 6.8% of a 15-min
      declared cron`. That percentage is beat 3's slot.

      **Why it is a slot and not a figure:** the script says so outright (L106–113,
      L190) — *"a value written today is wrong by the recording."* It moves, and our own
      measurements prove it: the median gap has gone **132 → 136 → 179 → 197 → 225
      minutes**. It is the only number in the whole script that is not final.

      **Say it as a measurement, not a property.** The script's own phrasing, which
      marks it correctly:

      > *"GitHub delivers ⟦figure⟧ of its declared cadence, so a local timer keeps what
      > the engine does separate from whether the platform fires."*

      Add *"measured today"* if you want it unambiguous. **What not to say:** "GitHub
      delivers about 7%" as though it were a fixed property of the platform.

      🔴 **With live voice-over, skipping this leaves a hole in the middle of a spoken
      sentence** — or a stale number in it. Either one is discovered in the edit, and by
      then it costs the beat rather than thirty seconds.

**Beat dependencies on prior state:** none between beats. Beat 5's CI half needs
workflow run `36095411235`, which already exists. Beat 4 reads committed bundles that
are already on `main`. **No beat depends on another beat's state.**

---

## ⛔ What must not be in frame

- **The `--json` output.** On the published `0.1.1` it still prints
  `"status": "known"`, `"endsAtLedger": 0` and a negative `"remainingLedgers"` for an
  archived entry — B and C both. It is disclosed in writing at walkthrough step 3,
  which is the right place for it. **On video nothing qualifies it.** Do not add
  `--json` to any beat.
- **Your shell prompt**, if it shows a machine name, a username, or a path that
  reveals anything. Consider `PS1='$ '` for the take.
- **`npm whoami` / any npm session.** Nothing here needs you logged in; a token in an
  error message is the risk.
- **Notification banners, other terminal tabs, the desktop, browser bookmarks.**
- **`.env` files, `evergreen.config.*`, any editor pane.** No secret is needed for any
  beat, so nothing should be open that holds one.

---

# Recording order — which is now script order, and that is a change

**Your voice-over answer changed this.** The original order here put the inert beats
first and the live one last, which is right for silent capture: bank the cheap takes,
leave the irreplaceable one for when you are warmed up.

**With live voice-over that is the wrong trade.** Narration recorded out of order has
to be delivered cold, beat by beat, with no run-up — and a fluffed line now costs the
video too, not just the audio. Continuity of voice is worth more than banking cheap
retakes.

**So: record in script order, 1 → 6, in one sitting.** That satisfies the only hard
technical constraint on its own — **beats 2 and 5 both read live chain state and land
within a few minutes of each other**, so their ledger numbers agree without you
managing it. See [§6](#6-continuity--the-one-hard-constraint).

---

## ① Beat 1 — the problem · 40s · **INERT, free retakes** · script L52–69

**No command. Narration only.**

Verbatim, the line the script wants you to open on (L61):

> *"Your forty vault contracts share one code entry, and it expires Thursday."*

**What has to land** (L63–65): contracts built from the same Wasm share **one**
`ContractCode` entry; a scan of one contract cannot tell you that, because the chain
does not index reverse dependencies, so the risk is invisible from inside any single
contract.

**Nice, not essential** (L54–56): persistent entries are archived and recoverable;
temporary entries are **deleted**. Nobody gets an email.

> ⚠️ **The script flags a gap here and I am leaving it as a gap** (L67–69): *"If
> `F-01` has measured how common shared code entries are, lead with that number
> instead. If `F-01` never happened, this beat still stands on its own."* **`F-01` has
> no measurement committed.** So open on the sentence, not on a number.

---

## ② Beat 2 — scan · 50s · 🔴 **LIVE CHAIN STATE** · script L71–123

**script L71–123.** Copy-paste exactly this. **The IDs are written out because `<A>`
in a shell is a redirection, not a placeholder** — the angle-bracket form fails with a
zsh parse error.

```bash
npx @evergreen-stellar/cli scan \
  CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L \
  CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ \
  CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL
```

A is the live working contract; **B and C are both archived** — B since 2026-09-21,
C since 2026-09-26.

**Output is ~45 lines and will scroll.** Check legibility before the take.

**The one line the beat exists for** (L115) — it appears *only* when all three are
passed together:

> `⚠ shared: this code entry is shared with 2 other contracts — they fail together`

**Then the contrast** (L117–119): show the single-contract scan saying
`sharing UNDETERMINED`, and say why: **absence of evidence is not evidence of absence,
and the tool refuses to pretend otherwise.**

```bash
npx @evergreen-stellar/cli scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
```

**Second thing, briefly** (L121–123): `PARTIAL — N issue(s)`. A clean result means
*everything I was asked to check is healthy*, never *this contract is healthy*.
**"Absence is not health"** is on screen already — say it.

### 🔴 Three things on screen that look like faults and are not

**1. The coverage notice appears six times** — three *"No data keys were supplied…"*
lines in the header, three `! coverage-limited` lines at the bottom, one per contract
both times. Counted in the committed output. **Do not stop the take.** Narration:

> *"It says that once per contract, because coverage is per contract."*

**2. It exits 1, and prints `Scan is PARTIAL — 3 issue(s)`.** A non-zero exit reads as
a broken tool to anyone who has used a terminal. One sentence fixes it:

> *"Partial is a verdict, not a failure. The tool is declining to report what it
> cannot determine — that is the whole argument of the product, and this is that
> argument executing."*

**3. `Worst entry health: CRITICAL`** — this comes from **B and C being archived**, not
from A. Say which contract it is about. A runs to December.

**4. On a cold cache `npx` prints, before the scan even starts:**

```
npm warn exec The following package was not found and will be installed: …
```

**"Not found" reads as an error and is not one** — it is npx saying it is about to
download the package. Measured at 101 characters, so it wraps too. Avoid it entirely by
warming the cache in §0 before you record.

Also possible: `npx` may print an **npm upgrade notice** after the output. Cosmetic.

---


---

## ③ Beat 3 — the save · 60s · **INERT** · script L125–152

### 🔴 READ THIS SENTENCE EXACTLY — do not paraphrase it

Script L129–130, verbatim. **This is the highest-risk line in the recording:**

> *"A is not close to expiry. We raised the alert threshold above its remaining TTL so
> the engine would fire — that is the trigger, not decay."*

**Why live voice-over makes this sharper than captions did.** The false version —
*"a contract decayed naturally and was saved unattended"* — **is the more impressive
one.** It is shorter, it is a cleaner story, and it is the sentence a narrator's mouth
reaches for under the pressure of a live take. That is not carelessness, so being
careful is not the countermeasure: **reading the line rather than delivering it is.**

It happened on **no contract.** A was saved because we raised its threshold; B decayed
naturally and was deliberately *not* saved. Two contracts, and the combined sentence is
a false claim to a funder.

📌 **Take beat 3 twice even if the first felt fine.** It is the one beat where the
first take feeling good is not evidence that it was — a fluent delivery of the wrong
sentence feels better than a careful delivery of the right one.

**Then the claim** (L134–139) — every figure verified against
`docs/evidence/2026-09-14-scheduled-a-save/README.md`:

| | |
|---|---|
| a timer fired with **nobody watching** | |
| the engine **decided, signed and submitted** | |
| transaction | `dae63da8…69128` |
| inclusion ledger | **4,670,261** ✓ |
| A's expiry moved | **6,026,591 → 6,370,261** ✓ |
| fee | **44,725** stroops against a 2,000,000 cap ✓ |
| **five protected control entries unchanged** | |

**What has to land** (L141–142): the engine extended exactly what it decided to, and
nothing else.

**Then the scheduler line** (L144–148), with the measurement you took in §0:

> *"GitHub delivers ⟦your `measure:cadence` figure⟧ of its declared cadence, so a
> local timer keeps what the engine does separate from whether the platform fires."*

**Say it is a local OS timer, not the GitHub cron.** Two claims proved separately
rather than one that quietly depends on both.

**On screen:** the script does not say. Your options are the committed record or the
explorer page for the transaction. **It does not require a terminal.**

---

## ④ Beat 4 — the refusal · 45s · **INERT** · script L154–184

**The beat most demos would cut, and the one that earns trust.**

**On screen, verbatim** (L162):

> `SKIP — REFUSED BY WRITE GUARD — Refusing to write: this would touch guinea-pig B`

**The decay sequence** (L168–173) — every figure from a sealed bundle:

| observed (UTC) | ledger | remaining |
|---|---|---|
| Sun 2026-09-20 12:00:29 | 4,776,408 | **17,279** |
| Mon 2026-09-21 00:00:19 | 4,785,046 | **8,641** |
| Mon 2026-09-21 06:00:30 | 4,789,368 | **4,319** |
| Mon 2026-09-21 12:00:35 | 4,793,689 | **expired** — `endsAt: 0` |

**Say the halving out loud** (L179–180) — 17,279 → 8,641 → 4,319 → gone. That is the
whole point of four captures rather than two endpoints.

**What has to land** (L182–184): B is the natural-decay proof, and extending it would
have destroyed the only evidence in the sprint that cannot be recreated. **"A tool
that knows what not to touch is the one you let near production."**

All four bundle paths verified present on `main`.

---

## ⑤ Beat 5 — dashboard and CI · 45s · 🔴 **DASHBOARD IS LIVE STATE** · script L186–222

> **You chose to keep the dashboard and record the new UI, so this beat cannot start
> until #248 merges.** See §0. The CI half below is inert; the dashboard half is not.

### The dashboard half — live

**Open [`/dashboard/`](https://evergreen-stellar.pages.dev/dashboard/), not the root**
(L213–214). The root is a landing page; the scanner is one level down.

**What it demonstrates:** paste a contract ID, **no wallet and no signup** (L188–189).

> 🔴 **CORRECTED 2026-09-28 — the dashboard DOES show rent, on request.** An earlier
> version of this note said it shows none, *"deliberately"*, because `estimateRent`'s
> quoter was not browser-safe. **That is no longer true**, and the note would have told
> you a figure could not appear moments before one did. Caught by Rakha in his #248
> approval; verified by running it.
>
> After a scan, a **`Estimate rent to extend`** button appears. Pressing it produces, on
> the live page today:
>
> ```
> Rent to extend by 518,400 more ledgers
> about 3.2 XLM (31,509,408 stroops)
>   AAAAB8flXw…y86Yv7   about 3.1 XLM    99%     ← the shared code entry
>   AAAABgAAAA…QAAAAB   about 0.027 XLM  <1%
> ```
>
> **Two things follow, and the second is the one that could embarrass the take.**
>
> **1. Do not narrate a fixed quote.** It is priced by simulating against live network
> config, so the number moves between runs. If you say a figure, say it is what the
> screen shows right now.
>
> **2. 🔴 The screen will say `99%` and beat 6's close says `98%`.** That is **not** a
> contradiction — it is the same entry with a different denominator, and it lines up
> exactly with the script's own two cases: the dashboard scanned A with **no data
> keys**, so it priced **instance and code only**, which is the `99%` scope. Beat 6's
> `98%` is the four-entry scope from the D1 capture.
>
> **So if you press that button, say the scope in the same breath** — *"ninety-nine per
> cent of the two entries this scan priced"* — or skip the button entirely and leave the
> rent claim to beat 2 on the CLI. **Either is fine; 99% on screen and "98%" in the
> narration with nothing joining them is not.**

**The page reads the chain live and prints its own ledger**, which is why this beat and
beat 2 must be in the same session.

### The CI half — inert

**One run, both colours** —
[run 36095411235](https://github.com/Fatihmaull/evergreen/actions/runs/36095411235):

| job | result | why |
|---|---|---|
| `green · must pass` | ✅ passes | A is above the 17,280-ledger default |
| `red · must fail` | ❌ fails, **exit 1** | every entry at or below a configured 2,000,000 |

**What has to land** (L197–199): **say that only the threshold differs.** Both jobs
scan the same contract. The claim is *"the job fails when an entry is at or below the
threshold you configured"* — **not** that A is decaying. A runs to December.

**Optional, one sentence if the Action comes up** (L207–211): its first ever run
failed *both* jobs with `Unable to locate executable file: pnpm`, because
`setup-node@v5` defaults to the caller's package manager. It would have broken
`evergreen-check` in any pnpm repository. Fixed, with a commissioned regression test.

---

## ⑥ Beat 6 — close · 20s · **INERT** · script L224–240

> **"98% of the rent bill is the one entry every contract depends on."**

🔴 **State the scope in the same breath** (L228–235), or the number contradicts our own
committed evidence:

- **98%** of a four-entry scan — instance, persistent, temporary and code
- **99%** if only the instance and code are priced

Both figures are in the D1 capture. Same entry, same absolute rent, different
denominator.
> 🔴 **If you pressed the rent button in beat 5, the screen said `99%`.** Say the scope
> joining them, or the two numbers read as a discrepancy: the dashboard priced
> **instance and code only** (no data keys), which is the `99%` case above; the `98%` is
> the four-entry scope from the D1 capture. **Same entry, same absolute rent, different
> denominator** — which is what this beat already says. Just say it out loud.

**Then the thesis** (L239–240), verbatim:

> *"The entry that N contracts depend on is simultaneously the biggest availability
> risk and the biggest line item."*


---

# §2 · Does the video need the dashboard?

**Answered from the requirement first, then the script.**

**§6.1, Deliverable 3, quoted** — its evidence is *five separate items*:

> *"Dashboard URL, GitHub Action, demo video, documentation, and npm links"*
>
> *"Live testnet dashboard, published `evergreen-check` GitHub Action, complete
> documentation, a 3–5 minute demo, and links to the published npm packages."*

**The dashboard URL is its own evidence item, and it is already Present** — satisfied
by the URL, not by the video. The demo is a *separate* item, and §6.1 specifies it only
as **"a 3–5 minute demo"**. It says nothing about contents.

**§6.2** assesses per deliverable whether evidence is *"present and sufficient"* —
three checkboxes per deliverable, no itemised demo-content list.

**So: no requirement obliges the video to show the dashboard, the web app, or a
browser at all.** The CLI is sufficient.

**And the script agrees** (L221–222), verbatim: *"Keep this short. It is the least
differentiated part of the product and the part a reviewer can most easily imagine."*

**Recordability, checked today:** `/`, `/dashboard/` and `/dashboard/scanner/` all
return 200 and the scanner works. **But #248, your UI rework (+11,103 lines), is not
merged** — `BEHIND`, with Rakha's `CHANGES_REQUESTED` still standing. So:

- record the dashboard now → the video shows the **old** UI, and diverges from the live
  site the moment #248 lands
- want the new UI in the video → **#248 must merge first**, which needs Rakha's
  re-review, and the gate closes Tuesday

**My recommendation was to cut it.** You decided to keep it and record the new UI,
which is a legitimate read of the same facts: the requirement does not demand it, and
a better-looking dashboard is worth something the requirement does not measure.

**What that decision costs, so it is priced rather than discovered:**

- **#248 must merge first**, and it needs Rakha's re-review — a dependency on someone
  else with the gate closing Tuesday.
- **The dashboard becomes a second live-ledger beat**, so it and beat 2 must be
  recorded in the same session and re-recorded as a pair.
- If #248 has not landed by the time you want to record, **the fallback is this
  recommendation** — cut the dashboard, keep the CI half, and nothing in §6.2 changes.
  That fallback is available at any point up to the take.

---

# §6 · Continuity — the one hard constraint

**Ledgers advance about every five seconds**, so anything showing a ledger number
cannot be re-cut against a different take without the numbers disagreeing.

| beat | reads | retake cost |
|---|---|---|
| 1 problem | nothing | **free** |
| 3 save | committed record, fixed history | **free** |
| 4 refusal | sealed bundles, all past | **free** |
| 5 **CI half** | a fixed workflow run from 2026-09-25 | **free** |
| 6 close | the D1 capture's figures | **free** |
| **2 scan** | 🔴 **live chain** — `observed: ledger N` on screen | **expensive** |
| **5 dashboard half** | 🔴 **live chain** — the page prints its own ledger | **expensive** |

**Two beats read live state, and keeping the dashboard is what made it two.**

**The one hard constraint: beats 2 and 5 must be recorded in the same session.** A
viewer can compare the ledger in beat 2's terminal with the ledger the dashboard
prints. Recorded hours apart they disagree by thousands and the video contradicts
itself. Recording in script order in one sitting satisfies this without you thinking
about it — which is the main reason script order is now the recommended order.

**The point of no return:** once beat 2 and the dashboard are recorded, **a retake of
either means re-recording both.** Everything else is independent.

**Afford to get wrong:** beats 1, 3, 4, 6 and beat 5's CI half — retake freely, the
only cost is re-narrating.
**Cannot afford:** beat 2's framing, the dashboard's ledger agreeing with it, and the
two-contracts distinction at the top of this sheet. The last one is a claim rather
than a number, and no retake makes a false claim true.

---

# §7 · What I changed in the script, and why

A stale demo script is the same defect class as a stale gate, and this one gets read
out loud. Verified against the repository:

| checked | result |
|---|---|
| beat 3's figures | ✓ 4,670,261 · 44,725 · 2,000,000 · 6,026,591 → 6,370,261 all present in the save record |
| beat 4's four bundle paths | ✓ all present on `main` |
| beat 6's 98% / 99% | ✓ both in the D1 capture |
| beat 5's run + job links | ✓ resolve, green/red as described |
| `F-01` | registered in the backlog, **no measurement committed** — left as a gap |

**Three things fixed:**

1. **Beat 2's command was `<A> <B> <C>`.** Real IDs substituted — the angle-bracket
   form is shell redirection and fails to parse.
2. **A block still said `@evergreen-stellar/cli@0.1.0` is what the registry serves,
   and that guinea-pig C was "in its own crossing window".** `0.1.1` is current and
   C's window closed on 2026-09-26. Replaced with a short, accurate history.
3. **Beat 4's heading still carried `⟦SLOT⟧`** though its slots were filled on
   2026-09-23.
