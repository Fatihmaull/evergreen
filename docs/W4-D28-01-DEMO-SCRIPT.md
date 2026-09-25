# `W4-D28-01` — demo video script (3–5 min)

**Status: structure written 2026-09-15, figures pending.** Every `⟦SLOT⟧` is a number
the Sep 20–21 crossing produces. Written now, before the crossings, because the
*reasoning* is fresh and the numbers are mechanical — doing it the other way round
means writing the whole thing after Sep 21 under a submission deadline.

**Fill the slots; do not rewrite the beats.** The beats encode decisions that were
expensive to reach, and several of them are about what we must *not* claim.

---

## 🔴 The one thing that must not be got wrong

**This demo shows two contracts, and conflating them is a false claim to a funder.**

| | Guinea-pig A | Guinea-pig B |
|---|---|---|
| What happened | the engine **saved** it, unattended | it **expired**, and the engine did not save it |
| Why it happened | the alert threshold was **raised above its remaining TTL** so the engine would fire | natural decay, on its own schedule |
| What it proves | detect → decide → submit, with no human | the guard refuses a protected subject, and decay is real |

**Narrate it as two contracts.** Say *"we raised the alert threshold above its
remaining TTL so the engine would fire"* out loud for A. The combined story —
*"a contract decayed naturally and was saved unattended"* — did not happen on any
single contract and must not be implied.

`W3-D18-02b` records why B is not saved: a save and an expiry on the same contract
are mutually exclusive, and the repo asked for both. B expiring **is** the intended
outcome, not a failure to demo around.

---

## The arc

### 1 · The problem — 40 seconds

Soroban ledger entries expire. An expired `persistent` entry is archived and
recoverable; an expired `temporary` entry is **deleted**. Nobody gets an email
about it.

Open on the trap rather than the mechanism, because the trap is what makes tooling
worth installing:

> *"Your forty vault contracts share one code entry, and it expires Thursday."*

Contracts built from the same Wasm share **one** `ContractCode` ledger entry. A
scan of one contract cannot tell you that — the chain does not index reverse
dependencies — so the risk is invisible from inside any single contract.

> **If `F-01` has measured how common shared code entries are, lead with that
> number instead.** If `F-01` never happened, this beat still stands on its own —
> it is a non-obvious operational trap, and it does not need a survey to be true.

### 2 · Scan — 50 seconds

```bash
npx @evergreen-stellar/cli scan <A> <B> <C>
```

> 🔴 **VERIFIED FAILING 2026-09-17 — this exact line exits 1 with `E404`**, because
> `@evergreen-stellar/cli` is not published yet (`W4-D27-02`, Rakha, planned Sep 29;
> he has been asked in #104 to bring it to Sep 22–23).
>
> **Do not record this beat until the package is published.** Everything else in
> this section works today and was re-run to confirm: the three-contract scan emits
> the shared-entry line, the single-contract scan emits `sharing-undetermined`, and
> the result reads `PARTIAL — 3 issue(s)`. Only the install line is blocked.
>
> If the publish slips past the recording, the honest fallback is `pnpm cli scan …`
> from a clone **narrated as such** — not an `npx` line edited to look like it ran.

Show the real terminal. The point of passing three contracts together is the line
that appears only then:

> `⚠ shared: this code entry is shared with 2 other contracts — they fail together`

Then show the single-contract scan saying `sharing UNDETERMINED`, and say why the
difference exists: **absence of evidence is not evidence of absence, and the tool
refuses to pretend otherwise.**

Second beat, briefly: `PARTIAL — N issue(s)`. A clean result means *everything I
was asked to check is healthy*, never *this contract is healthy*. **"Absence is not
health"** is on screen already; say it.

### 3 · The save — 60 seconds

Guinea-pig A, and **say the trigger out loud**:

> *"A is not close to expiry. We raised the alert threshold above its remaining
> TTL so the engine would fire — that is the trigger, not decay."*

Then the unattended part, which is the actual claim:

- a timer fired with nobody watching
- the engine decided, signed and submitted
- transaction `dae63da8…69128`, inclusion ledger **4,670,261**
- A's expiry moved **6,026,591 → 6,370,261**
- fee **44,725** stroops against a 2,000,000 cap
- **five protected control entries unchanged**

That last bullet is worth a sentence: the engine extended exactly what it decided
to, and nothing else.

> Say that the scheduler was a local OS timer, not the GitHub cron — and why, in
> one line: *"GitHub delivers ⟦SLOT: delivery share — run `pnpm measure:cadence` on
> the recording day⟧ of its declared cadence, so a local timer keeps what the engine
> does separate from whether the platform fires."* Two claims proved separately,
> rather than one that quietly depends on both.
>
> **This is a slot, not a fixed number, for the same reason the crossing figures
> are.** The delivered cadence moves; a value written today is wrong by the
> recording. Quote what the command prints on the day, and say it is a measurement.

### 4 · The refusal — 45 seconds ⟦SLOT⟧

**The beat most demos would cut, and the one that earns trust.**

Guinea-pig B was first observed below its 17,280-ledger alert threshold at
**2026-09-20 12:00:29 UTC**, ledger 4,776,408, with **17,279** left — nobody
watching. The engine saw it and **refused**:

> `SKIP — REFUSED BY WRITE GUARD — Refusing to write: this would touch guinea-pig B`

Then B expired, on 2026-09-21. That was the plan.

**The decay sequence, every figure measured from a sealed bundle:**

| observed (UTC) | ledger | remaining |
|---|---|---|
| Sun 2026-09-20 12:00:29 | 4,776,408 | **17,279** |
| Mon 2026-09-21 00:00:19 | 4,785,046 | **8,641** |
| Mon 2026-09-21 06:00:30 | 4,789,368 | **4,319** |
| Mon 2026-09-21 12:00:35 | 4,793,689 | **expired** — `endsAt: 0` |

Instance ended at ledger 4,793,687, persistent at 4,793,688. Guard refused at
every one of the first three. Bundles: `docs/evidence/2026-09-20-b-crossing/`,
`…-0000/`, `…-0600/`, `…-1200/`.

> 📌 **Say the halving out loud — it is the whole point of four captures rather
> than two endpoints.** 17,279 → 8,641 → 4,319 → gone.

Say what the refusal is protecting: B is the natural-decay proof, and extending it
would have destroyed the only evidence in the sprint that cannot be recreated.
**A tool that knows what not to touch is the one you let near production.**

### 5 · Dashboard and CI — 45 seconds

**[evergreen-stellar.pages.dev/dashboard/](https://evergreen-stellar.pages.dev/dashboard/)**
— paste a contract ID, no wallet and no signup — and the `evergreen-check` Action
⟦SLOT: workflow run link — `W4-D29`⟧.

> 🔴 **DO NOT dispatch the `evergreen-check demo` workflow to fill that slot
> until `0.1.0` is on the registry.**
>
> `action.yml:129` installs the CLI with `npx --yes "@evergreen-stellar/cli@…"`,
> so **both jobs fail on E404** before the publish — including the one named
> *"red · must fail"*. A red job that failed for the wrong reason is
> indistinguishable from a working demonstration to anyone who does not open the
> log, and this artifact exists for a reviewer who will not open the log. That is
> a false green placed in the evidence by us.
>
> The workflow has **zero runs to date** for this reason, not because it is
> broken. After the publish, one dispatch produces both colours.

> **Open `/dashboard/`, not the root.** The root is a landing page; the scanner
> is one level down. Verified live 2026-09-24.
>
> **The dashboard shows no rent figure, and that is deliberate** — `estimateRent`'s
> quoter is not browser-safe, so the page renders rent as unavailable rather than
> as `0`. Do not narrate a cost number over this beat; the cost claim belongs to
> beat 2, on the CLI.

Keep this short. It is the least differentiated part of the product and the part a
reviewer can most easily imagine.

### 6 · Close — 20 seconds

> **"98% of the rent bill is the one entry every contract depends on."**

**State the scope in the same breath**, or the number contradicts our own committed
evidence:

- **98%** of a four-entry scan — instance, persistent, temporary and code
- **99%** if only the instance and code are priced

Same entry, same absolute rent, different denominator. The D1 capture shows 98%, so
the demo saying 99% without its scope reads as a discrepancy.

Then the thesis, which is one sentence carrying both halves:

> *"The entry that N contracts depend on is simultaneously the biggest availability
> risk and the biggest line item."*

---

## Slots, collected

**Walked and re-classified 2026-09-23.** Three slots that read as pending were
already final — B's event finished on Sep 21 and its figures cannot move again.
They are now filled in beat 4 rather than left as slots.

| Slot | State |
|---|---|
| B crossing date/time | ✅ **filled** — first observed below threshold 2026-09-20 12:00:29 UTC, ledger 4,776,408 |
| B decay sequence (×4) | ✅ **filled** — 17,279 → 8,641 → 4,319 → expired, measured from the sealed bundles |
| B expiry confirmation | ✅ **filled** — instance ended 4,793,687, persistent 4,793,688 |
| C, if B is missed | ⛔ **VOID — B was not missed.** C is captured Sep 25–26 as the documented spare; the demo does not need it and should not wait for it |
| Cron delivery share | 🔄 **moves** — run `pnpm measure:cadence` on the recording day and read it off. Do not quote a figure from here; `check:cadence` refuses one, and it has already been wrong twice. The 2026-09-23 reading is recorded in [`docs/evidence/2026-09-23-scheduler-cadence/`](evidence/2026-09-23-scheduler-cadence/README.md) |
| Dashboard URL | ✅ **filled 2026-09-24** — [`/dashboard/`](https://evergreen-stellar.pages.dev/dashboard/) is live and scans. **The root is a landing page; the scanner is one level down.** Shipped by the web track in #234/#236/#237 |
| Action run link | ⏳ unblocks the moment `0.1.0` publishes — the demo workflow produces red and green in one dispatch |

> 🔴 **TWO slots wait on something outside the recording, and they are the same
> thing.** An earlier version of this line said one, which under-counted the
> publish: `action.yml:129` installs the CLI with
> `npx --yes "@evergreen-stellar/cli@…"`, so **the Action cannot run either**
> until `0.1.0` is on the registry. The publish gates beat 2's install line *and*
> beat 5's run link.
>
> **The warning about dispatching that workflow early lives in beat 5**, where
> the operator is standing when the temptation arrives — not here. Nothing in
> this script waits on C.

## Figures already final — do not re-derive

| Figure | Value |
|---|---|
| A save transaction | `dae63da8bd42dde7ca8a72ac9ff99f7d7179cc505819db337253843e60369128` |
| Inclusion ledger | 4,670,261 |
| A expiry before → after | 6,026,591 → 6,370,261 |
| Fee charged | 44,725 stroops (cap 2,000,000) |
| Shared code entry | 3 consumers, expires ~2026-10-20 |
| Code-entry share of rent | **98%** four-entry scope / **99%** instance-and-code scope |
| Measured cron cadence | ⟦read `pnpm measure:cadence` on the recording day⟧. **Not final**, unlike every other row here: the chain figures are fixed forever, this one moves. ⚠️ On 2026-09-23 the worst gap passed the recorded `WORST_OBSERVED_SCHEDULER_GAP_MINUTES` **and** the review trigger, staying below `SCHEDULER_GAP_FLOOR_MINUTES` — dated record and the reason the constant was not changed before C's window in [`docs/evidence/2026-09-23-scheduler-cadence/`](evidence/2026-09-23-scheduler-cadence/README.md). |

All four transaction figures were verified against the chain rather than against
the evidence bundle, on 2026-09-15.

## Claims this script deliberately does not make

- that the **production cron** performed the save — it has never run that path
- that **A decayed naturally** — its threshold was raised
- that **B was saved** — it was deliberately not
- that a scan proves a contract is **fully** healthy — it covers only what it was asked for
- that **provider acceptance** of an alert means it was read
