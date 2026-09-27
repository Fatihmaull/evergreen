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

## Consequence

**Publishing `0.1.1` is a prerequisite for recording beat 2, not a tidying task.**
The alternative is recording a known-fabricated date into the artifact built to
make everything else reviewable, on the one defect that contradicts the product's
own argument.

The publish is Rakha's act — `W4-D27-04`,
[#264](https://github.com/Fatihmaull/evergreen/issues/264) — and his preflight
records `npm whoami` returning `E401`, so a login and a 2FA prompt come first.

🔴 **Coupled to the disclosure text.** `docs/SUBMISSION-WALKTHROUGH.md` step 3
currently tells the assessor that the published `0.1.0` prints this date and that B
and C are archived and reproducible. **That is true today and false the moment
`0.1.1` publishes.** The published version and the disclosure must be checked
together on the Oct 1 pass: a disclosure of a defect that has since been fixed
reads worse than none, because it invites the reader to test something that now
works and wonder what else is stale.
