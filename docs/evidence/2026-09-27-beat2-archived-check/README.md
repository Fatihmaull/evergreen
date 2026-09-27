# Beat 2 against archived B and C — checked before recording, not after

**2026-09-27.** The demo script's beat 2 is, verbatim:

```bash
npx @evergreen-stellar/cli scan <A> <B> <C>
```

`npx` with no version pins resolves `latest`, which is **`0.1.0`**. Guinea-pig B
archived on 2026-09-21 and C on 2026-09-26, and `0.1.0` is the build that prints a
projected expiry date for an archived entry ([#235](https://github.com/Fatihmaull/evergreen/issues/235)).

So the question was whether the demo video — the one artifact built to make the
whole submission reviewable by a non-technical reader — would record a fabricated
date. It was worth answering by running it rather than by reasoning about it.

**It would. The date appears twice.**

---

## What `0.1.0` prints today

Run from a directory that had never seen this repository, with an isolated npm
cache so nothing local could be resolved instead. Full output:
[`beat2-published-0.1.0.txt`](beat2-published-0.1.0.txt).

```
CRITICAL  instance  AAAABgAAAA…
  contracts:  CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ
  remaining:  -4,895,822 ledgers — EXPIRED (archived)
  ends at:    ledger 0
  expires ~:  2025-12-18T02:06:30.470Z (estimate — ledgers are the truth)
  observed:   ledger 4,895,822
  health:     CRITICAL — Already archived. Restore it with RestoreFootprintOp — extendTTL cannot reach it.

CRITICAL  instance  AAAABgAAAA…
  contracts:  CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL
  remaining:  -4,895,822 ledgers — EXPIRED (archived)
  ends at:    ledger 0
  expires ~:  2025-12-18T02:06:30.470Z (estimate — ledgers are the truth)
  observed:   ledger 4,895,822
  health:     CRITICAL — Already archived. Restore it with RestoreFootprintOp — extendTTL cannot reach it.
```

**Two `expires ~` dates in December 2025**, nine months before this project began,
on screen in the demo's opening technical beat.

## The thing the script did not predict, and it is worse in a three-contract scan

**B and C report the identical `remaining` and the identical `expires ~`, despite
dying five days apart.**

That is not a coincidence — it is the arithmetic of the defect. `remainingLedgers`
is `0 − observedLedger`, so *every* archived entry in a single scan yields the same
number, whatever date it actually expired on. `endsAtLedger` is 0 for both, so the
projection lands on the same instant for both.

In a one-contract scan this is a wrong number. **Side by side in a three-contract
scan it is a visibly wrong number**: two contracts, five days apart, sharing an
expiry date to the millisecond. A reviewer who cannot check *why* it is wrong can
still see that it cannot be right — which is the worst version of this for an
artifact whose whole purpose is to be reviewable by that reader.

## What the fix prints

Same command, same three live contracts, against the source build carrying the
[#262](https://github.com/Fatihmaull/evergreen/pull/262) fix — the `0.1.1`
candidate merged in #265. Full output:
[`beat2-source-0.1.1.txt`](beat2-source-0.1.1.txt).

```
CRITICAL  instance  AAAABgAAAA…
  contracts:  CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ
  remaining:  none — EXPIRED (archived)
  ends at:    not reported — RPC returns 0 for an archived entry, not the ledger it ended on
  observed:   ledger 4,895,829
  health:     CRITICAL — Already archived. Restore it with RestoreFootprintOp — extendTTL cannot reach it.
```

| | fabricated dates in beat 2 |
|---|---|
| published `0.1.0` | **2** |
| source `0.1.1` | **0** |

## What the script DOES predict, and got right

Worth recording, because the rest of the beat is sound and should not be touched:

- `⚠ shared: this code entry is shared with 2 other contracts — they fail together`
  appears, and only because all three were passed together.
- `Scan is PARTIAL — 3 issue(s). Absence is not health.` — exactly as written.
- `Worst entry health: CRITICAL` now comes from B and C being archived, not from A.
  A reads `HEALTHY`, 1,474,439 ledgers, ending at ledger 6,370,261.
- Exit code **1**.

## Two cosmetic things for whoever holds the camera

Neither is a defect; both will be on screen.

- The coverage sentence *"No data keys were supplied…"* prints **once per
  contract**, so three identical lines in a row near the top, and the
  `! coverage-limited` issue repeats three times at the bottom.
- `npx` emitted an **npm upgrade notice** (`New major version of npm available!`)
  after the scan output. It is stripped from the committed copy above but appeared
  in the live run.

## Closed out — `0.1.1` published the same day, and beat 2 re-run against it

`0.1.1` reached the registry on **2026-09-27**; `dist-tags.latest` returns `0.1.1`
and `versions` is `['0.1.0', '0.1.1']`. The exact beat 2 command was then re-run
against the **published** build, unpinned `npx`, clean directory, isolated cache:
[`beat2-published-0.1.1.txt`](beat2-published-0.1.1.txt).

```
  remaining:  none — EXPIRED (archived)            ← guinea-pig B
  ends at:    not reported — RPC returns 0 for an archived entry, not the ledger it ended on
  remaining:  none — EXPIRED (archived)            ← guinea-pig C
  ends at:    not reported — RPC returns 0 for an archived entry, not the ledger it ended on
  ⚠ shared:   this code entry is shared with 2 other contracts — they fail together
Worst entry health: CRITICAL (warn below 120,960 · act below 17,280 ledgers) · 1 shared entry
Scan is PARTIAL — 3 issue(s). Absence is not health.
exit=1
```

| | fabricated dates in beat 2 |
|---|---|
| published `0.1.0` | **2** |
| source `0.1.1` | **0** |
| **published `0.1.1`** | **0** |

**Beat 2 is recordable.** The shared-entry line is intact — the beat's whole
purpose — `PARTIAL — 3 issue(s)` and exit 1 are as the script predicts, and A still
carries a real future date (`~2026-12-21`), so the fix did not widen to live
entries.

## Consequence — resolved the same day

**Publishing `0.1.1` was a prerequisite for recording beat 2, not a tidying task.**
The alternative was recording a known-fabricated date into the artifact built to
make everything else reviewable, on the one defect that contradicts the product's
own argument.

It was published by Rakha on 2026-09-27 (`W4-D27-04`,
[#264](https://github.com/Fatihmaull/evergreen/issues/264)) and verified above
against the registry rather than against the repository's own `package.json` — the
repo had said `0.1.1` since #265 while the registry still served `0.1.0`.

**The coupled disclosure moved in the same commit** (`B-D29-04`, #269):
`SUBMISSION-WALKTHROUGH.md` step 3 now reads *found, fixed and shipped* instead of
*the published build prints this and you can reproduce it*, and beat 2's
do-not-record marker became **cleared to record**. Landing the version without the
prose, or the prose without the version, was the failure that row existed to
prevent — a disclosure of a defect since fixed reads worse than none, because it
invites the reader to test something that now works and wonder what else is stale.

[#235](https://github.com/Fatihmaull/evergreen/issues/235) **stays open**: the
renderer is fixed, core still emits `status: 'known'` for an archived entry, and
anything reading `--json` still receives it.
