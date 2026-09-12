# Evidence snapshot #2 — Week 2 close, 2026-09-12

Captured at Testnet ledger **~4,625,132–4,625,157**. All commands were run, not
transcribed. Raw stdout is committed beside this file; the exit status of each
is recorded below because a pipe reports the *last* command's status, not the
one you care about — a trap this repo has now fallen into more than once.

| Artifact | Command | Exit |
|---|---|---|
| [`scan-a-human.txt`](scan-a-human.txt) | `evergreen scan <A>` | 0 |
| [`scan-a.json`](scan-a.json) | `evergreen scan <A> --json` | 0 |
| [`blast-radius-three-contracts.txt`](blast-radius-three-contracts.txt) | core `scanContracts` over A, B, C | 0 |
| [`scan-abc-cli-refuses.txt`](scan-abc-cli-refuses.txt) | `evergreen scan <A> <B> <C>` | **2** — the gap below |
| [`drift-check.txt`](drift-check.txt) | `python3 scripts/check-decay-drift.py` | 0 |

## The Week 2 finding, demonstrated on live chain

`W2-D10-01` claims that a shared `ContractCode` entry's severity depends on how
many contracts a scan was given, and that a single-contract scan **cannot**
establish the entry is unshared. Both halves are visible here, on one ledger key:

| scan input | consumers | sharing | blastRadiusAtLeast | issue raised |
|---|---|---|---|---|
| A alone | 1 | `undetermined` | 1 | `sharing-undetermined` |
| A + B + C | **3** | **`shared`** | **3** | — resolved |

Same entry — `AAAAB8flXwrYnvsGALwVBIsVUJn6TZfO4WRm+hJEs9y86Yv7` — same ledger,
same moment. The only thing that changed is how much the scan was told.

This is why `sharingStatus` has three values rather than a boolean. Reporting
`isShared: false` from the left-hand row would not be *merely* unverified; it
would be **unverifiable by construction on that code path**, asserted in the
machine channel while the human channel printed a caveat saying the opposite.

## ⚠️ The CLI cannot reproduce the right-hand column

`scan` accepts exactly one contract ID. The advice it prints —

> *"pass them together to see the real blast radius"*

— **cannot be followed using the CLI.** The capability is not missing from the
product: `scanContracts` in `packages/core/src/scan-contract.ts` takes an array
and does the deduplication correctly, and `scanContract` is a thin wrapper over
it. Only the argument parser is singular.

`blast-radius.mjs` here is what the CLI's own advice requires, written against
core directly. To run it, copy it into `packages/cli/` first — the repo root
cannot resolve workspace dependencies. That inconvenience is the finding.

Filed as `W2-D10-01c`.

## "Crosses" names two events, 24 hours apart

The drift check and the CLI disagreed by exactly 24.0 h on both B and C. Neither
is wrong:

| instrument | B | what it projects |
|---|---|---|
| `check-decay-drift.py` | 2026-09-20 12:00 UTC | the **alert threshold**, `live_until - 17,280` |
| `evergreen scan` | 2026-09-21 12:00 UTC | **expiry**, `live_until` |

`THRESHOLD_LEDGERS = 17_280` is exactly one day, so the gap between the two is
24 h **by construction**. An error of exactly 24.0 h on both contracts should
point at that constant immediately; it was first read here as an off-by-one, and
first-principles arithmetic is what settled it.

`crossesOn` in `write-guard.ts` carries the *threshold* date. It is message text
only — the guard refuses unconditionally and never compares against a date, so
nothing lapses on Sep 20. But anyone scheduling evidence capture from that field
alone would arrive a day early for the expiry, and **the expiry is the
unrepeatable event.**

## What is NOT in this snapshot

**The extend transaction hash.** `W2-D11-02` requires a live `extendTTL` on the
guinea-pig contract, and no live transaction has been run — the Sep 10 evidence
is an unsigned simulation. It needs a signing key, so it is Rakha's, tracked in
[#103](https://github.com/Fatihmaull/evergreen/issues/103).

Deliverable 2 evidence is therefore **incomplete**, and this snapshot does not
claim otherwise.
