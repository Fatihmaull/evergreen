# Deliverable 1 — CLI screenshots (SOW §6.1, row 3)

**Captured 2026-09-14 by Fatih**, on `main` at `00ba2a9`, against **guinea-pig A**
(`CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L`) on Stellar Testnet.

SOW §6.1 asks for *"CLI screenshots showing TTL/archive prediction/cost"*. All three are
here, in both output modes the SOW names, as real terminal photographs rather than
rendered images of saved stdout.

| # | Folder | What it shows |
|---|---|---|
| 0 | [`step-0-build/`](step-0-build/1.png) | `git checkout main && git pull && pnpm install && pnpm build` — the build these captures ran against |
| 1 | [`step-1-discovery/`](step-1-discovery/1.png) | `scan --help`, the data-keys contract, and the health-state vocabulary |
| 2 | [`capture-1-four-entry-types/`](capture-1-four-entry-types/1.png) | **The main one.** All four entry types + TTL + archive prediction + cost, human-readable |
| 3 | [`capture-2-json/`](capture-2-json/1.png) | The same scan as `--json` — the complete machine-readable record |
| 4 | [`capture-3-storage-advice/`](capture-3-storage-advice/1.png) | `--optimize`: conditional storage advice with its evidence and stated limits |
| 5 | [`capture-4-blast-radius/`](capture-4-blast-radius/1.png) | **The most valuable one.** Three contracts scanned together; the shared code entry resolves to `shared with 2 other contracts` |
| 6 | [`capture-5-error-handling/`](capture-5-error-handling/1.png) | An unknown argument is refused with usage and exit 2 |

---

## Three things that look wrong and are not

A reviewer scanning these images will hit three apparent inconsistencies. Each one is the
tool being accurate, and each is explained here rather than left to be discovered.

### 1. The blast-radius capture says `PARTIAL — 3 issue(s)`

That is **not a failure, and not a fault in the contracts.** It is the scanner refusing to
overstate its own coverage.

The three-contract scan was run without `--keys-file`, so it read each contract's instance
and the shared code entry, and nothing else. Soroban does not let a scan enumerate a
contract's storage, so the tool cannot know whether further entries exist. It raises one
`coverage-limited` issue per contract saying exactly that, and marks the scan `PARTIAL`.

The design rule is printed in the output itself: **"Absence is not health."** A clean
result means *everything I was asked to check is healthy*, never *this contract is healthy*.
A scanner that reported `COMPLETE` here would be claiming knowledge it does not have — and
that claim is the failure mode this project exists to avoid.

`capture-1` shows the same mechanism from the other side: supplied with `--keys-file`, it
reports `2 explicit data key(s)`, reads all four entries, and still says `PARTIAL — 1
issue(s)` — because a single-contract scan cannot determine whether the code entry is
shared. `capture-4` is what resolves that one.

### 2. The ledger numbers differ between images

Each capture is a **separate live run against a moving chain**, so each observes a different
ledger. Testnet closes roughly one ledger every 5 seconds.

| Capture | Observed at ledger | Gap from previous |
|---|---|---|
| `capture-1` (human) | 4,672,255 | — |
| `capture-2` (`--json`) | 4,672,344 | +89 (~7 min) |
| `capture-3` (`--optimize`) | 4,672,389 | +45 (~4 min) |
| `capture-4` (blast radius) | 4,672,415 | +26 (~2 min) |

About 160 ledgers, ~13 minutes, across the whole session.

**`endsAtLedger` never moves** — it is the entry's actual expiry and is identical in every
image (A instance `6,370,261`; code `5,290,829`). Only `remaining` changes, because
`remaining = endsAtLedger − observedAtLedger` and the observation point advanced. That is
the correct behaviour, and it is why the CLI prints `(estimate — ledgers are the truth)`
next to every wall-clock date.

There is also a **one-ledger difference inside `capture-2`**: the instance reads
`observedAtLedger 4672344` while the other three read `4672345`. The chain closed a ledger
mid-read. Entries are observed individually and each records the ledger it was actually
read at, rather than back-dating all of them to a single number that was only true for some.

### 3. One capture says 98%, and `STATUS.md` says 99%

Both are correct. **They are shares of different denominators, and the number is meaningless
without its scope.**

The line reports the largest entry's share of *the rent in that scan*:

| Scope | Entries priced | Code-entry share |
|---|---|---|
| **This capture** — with `--keys-file` | instance + persistent + temporary + code | 8,116,648 / 8,264,289 = **98%** |
| **A no-data-keys scan** | instance + code only | 8,116,648 / 8,188,781 = **99%** |

Same code entry, same absolute rent. Adding the persistent (49,254) and temporary (26,254)
entries to the denominator moves the share from 99.1% to 98.2%.

**State the scope wherever the number appears.** The underlying claim survives either way and
is the point worth making: *the one entry that every contract depends on is also almost all
of the bill.*

---

## Capture 5 shows an unknown argument, not a rejected network

Worth stating plainly, because the command reads like a mainnet refusal and is not one.

Both `--network mainnet` **and** `--network testnet` fail identically — `Unknown or repeated
argument`, usage, exit 2 — because **`scan` has no `--network` option at all.** The command
is Testnet-only by construction, as its help says: *"Reads instance/Wasm and supplied
persistent/temporary keys on Stellar Testnet."* There is no network to choose and therefore
no wrong one to pick.

What the capture does demonstrate is that an unrecognised flag is refused rather than
ignored, with a non-zero exit a script can act on. Do not cite this image as evidence that
the tool refuses mainnet.

---

## How these were verified before being accepted

The previous capture set was taken on a build 36 commits stale. Nothing about the images
looked wrong; it was caught only by comparing the output against what the CLI actually
emits. The same method was applied here, and it is recorded so the check is repeatable.

**Build-freshness markers** — every one present:

| Marker | Stale build would show | These show |
|---|---|---|
| Sharing field in JSON | `isShared` | `sharingStatus` ✅ |
| Blast radius in JSON | absent | `blastRadiusAtLeast` ✅ |
| `issues` array | `[]` | non-empty (`sharing-undetermined`, `coverage-limited`) ✅ |
| Expiry label | `approx:` | `expires ~:` ✅ |

**Arithmetic, cross-checked against the printed values.** `endsAtLedger − observedAtLedger`
must equal `remaining`, in every entry of every capture:

| Capture | Entry | Computed | Printed |
|---|---|---|---|
| 1 | instance | 6,370,261 − 4,672,255 = 1,698,006 | 1,698,006 ✅ |
| 1 | persistent | 6,025,595 − 4,672,255 = 1,353,340 | 1,353,340 ✅ |
| 1 | temporary | 6,025,598 − 4,672,255 = 1,353,343 | 1,353,343 ✅ |
| 1 | code | 5,290,829 − 4,672,255 = 618,574 | 618,574 ✅ |
| 4 | A instance | 6,370,261 − 4,672,415 = 1,697,846 | 1,697,846 ✅ |
| 4 | B instance | 4,793,687 − 4,672,415 = 121,272 | 121,272 ✅ |
| 4 | C instance | 4,880,097 − 4,672,415 = 207,682 | 207,682 ✅ |
| 4 | code | 5,290,829 − 4,672,415 = 618,414 | 618,414 ✅ |

**Cost arithmetic**, `rent + fees = total`, in both output modes:

- Human (`capture-1`): 8,264,305 + 47,235 = **8,311,540** = printed total ✅
- JSON (`capture-2`): 8,264,289 + 47,251 = **8,311,540** = `totalStroops` ✅

The rent/fee split differs slightly between the two because they are separate runs priced at
different ledgers; the totals agree because the quote is for the same work.

**Independently confirmed against the chain.** B's `4,793,687` and C's `4,880,097` in
`capture-4` match a scan run separately at ledger 4,672,529 while reviewing this bundle.

---

## The threshold line changed after these were captured

**These images are what `00ba2a9` produced on 2026-09-14.** That is the point of naming the
commit: it turns a difference between the screenshots and today's binary from a discrepancy
a reviewer has to resolve into a dated fact they can check out and reproduce.

These captures print:

```
Worst entry health: HEALTHY (threshold 17,280 ledgers)
```

Running the same command today prints both tiers:

```
Worst entry health: HEALTHY (warn below 120,960 · act below 17,280 ledgers)
```

`scan` graded every entry against the action threshold alone, so it could never
say `WARNING` — it had the word and no path to it, and the two-tier model that
reached the engine had not reached the display. Fixed in #154 the same day, after
`scan` and an engine run were observed disagreeing about guinea-pig B minutes
apart: `HEALTHY` from one, `WARNING` from the other, same entry, same chain state.

**Nothing in these images is wrong, and no verdict changes.** Guinea-pig A sits at
~1,698,000 ledgers remaining, far above both tiers, so it reads `HEALTHY` under
either model — the label beside it is what gained a second number. Every TTL,
ledger, cost and blast-radius figure is unaffected; they are chain readings, not
health verdicts.

Not recaptured. A recapture costs a scarce thing — Fatih's terminal, and these
were taken on the second attempt after the first set was disqualified — to change
one line that does not alter a single claim the evidence makes. If Deliverable 1
is recaptured for another reason before Oct 2, this line comes along with it.

## Scope and limits

- **Testnet only.** Nothing here was submitted; `scan` and `--cost` never sign or send. The
  cost figure is produced by simulation.
- **Cost is an estimate, not a quote.** Rent pricing varies with network state and has
  differed by ~18% between days; the output says so.
- **Coverage is only what was asked for.** Storage is never enumerated. `capture-1` covers
  four entries because two data keys were supplied; `capture-4` covers instances and code
  because none were.
- **A's TTL reflects a deliberate extension.** A's instance was extended on 2026-09-14 during
  the `W3-D18-02a` save proof, which is why it runs to ledger 6,370,261 (~2026-12-21). That
  extension used a threshold raised to 1,500,000 for the purposes of the proof; **it is not
  natural decay.** Guinea-pigs B and C are untouched and continue to decay naturally.
