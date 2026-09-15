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
> one line: *"GitHub delivers about 11% of its declared cadence, so a local timer
> keeps what the engine does separate from whether the platform fires."* Two claims
> proved separately, rather than one that quietly depends on both.

### 4 · The refusal — 45 seconds ⟦SLOT⟧

**The beat most demos would cut, and the one that earns trust.**

Guinea-pig B crossed its alert threshold on ⟦SLOT: date/time UTC⟧ with nobody
watching. The engine saw it and **refused**:

> `SKIP — REFUSED BY WRITE GUARD — Refusing to write: this would touch guinea-pig B`

Then B expired. That was the plan.

⟦SLOT: the decay sequence — three captures at 12:00, 18:00, 00:00 UTC, showing
remaining ledgers falling and the guard refusing each time.⟧

Say what the refusal is protecting: B is the natural-decay proof, and extending it
would have destroyed the only evidence in the sprint that cannot be recreated.
**A tool that knows what not to touch is the one you let near production.**

### 5 · Dashboard and CI — 45 seconds

⟦SLOT: dashboard URL — `W4-D26`⟧ and the `evergreen-check` Action ⟦SLOT: workflow
run link — `W4-D29`⟧.

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

| Slot | Source | Available |
|---|---|---|
| B crossing date/time | Sep 20 capture | Sun Sep 20 |
| B decay sequence (×3) | pre-flight §3b captures | Sun Sep 20 |
| B expiry confirmation | Sep 21 observation | Mon Sep 21 |
| C, if B is missed | `W3-D18-02c` | Fri Sep 25 |
| Dashboard URL | `W4-D26` | Week 4 |
| Action run link | `W4-D29` | Week 4 |

## Figures already final — do not re-derive

| Figure | Value |
|---|---|
| A save transaction | `dae63da8bd42dde7ca8a72ac9ff99f7d7179cc505819db337253843e60369128` |
| Inclusion ledger | 4,670,261 |
| A expiry before → after | 6,026,591 → 6,370,261 |
| Fee charged | 44,725 stroops (cap 2,000,000) |
| Shared code entry | 3 consumers, expires ~2026-10-20 |
| Code-entry share of rent | **98%** four-entry scope / **99%** instance-and-code scope |
| Measured cron cadence | 136-min median, 369-min worst, vs 15 declared (~11%) |

All four transaction figures were verified against the chain rather than against
the evidence bundle, on 2026-09-15.

## Claims this script deliberately does not make

- that the **production cron** performed the save — it has never run that path
- that **A decayed naturally** — its threshold was raised
- that **B was saved** — it was deliberately not
- that a scan proves a contract is **fully** healthy — it covers only what it was asked for
- that **provider acceptance** of an alert means it was read
