# B and C control verification after the A save — 2026-09-14

A live `extendTTL` was submitted against **guinea-pig A** on 2026-09-14 at 08:34:44 UTC
(`W3-D18-02a`, tx `dae63da8…69128`, inclusion ledger 4,670,261). This is the independent
check that it touched nothing else.

**It touched nothing else.** B, C and the shared code entry are where natural decay puts
them, and no protected entry moved.

## Why this exists separately from the save-proof bundle

The save proof reports its own control expiries. A control read from inside the bundle that
performed the write is the weakest form of the claim available — it confirms the bundle is
internally consistent, not that the chain agrees. This was read from the chain afterwards,
by a different person, using the shipped CLI.

## The gap this closes

The first pass scanned B and C **without data keys**, which reads only `instance` and
`code`. The write guard protects B and C **by contract ID**, so persistent and temporary
entries are covered in the code — but they were not covered by the check. The strongest
claim available from that pass was *"the two entry kinds I looked at are untouched"*, which
is not the claim being made.

B and C were not storage-free: the bootstrap footprints
([`2026-09-08-w1-review/bootstrap-decoded.json`](../2026-09-08-w1-review/bootstrap-decoded.json))
show `contractData` entries beyond their instances for both. So the keys had to be built and
scanned.

> ⚠️ **These two key files are evidence AND runtime input.** `data-keys-B.json`
> and `data-keys-C.json` are loaded at run time by
> [`scripts/crossing-capture-common.mjs`](../../../scripts/crossing-capture-common.mjs)
> — the code that captures the Sep 20 and Sep 25 crossings. They are not inert.
>
> **Do not "tidy" them.** Editing them changes what the crossing capture reads, on
> the one date that cannot be repeated. If a genuine error is ever found in them,
> fix it deliberately and re-run the capture, rather than correcting the record.
>
> They are defended rather than trusted: `controlKeys()` requires exactly two keys,
> derives the expected owner from `write-guard.ts`'s `PROTECTED_ENTRIES` rather than
> from this file, and requires one `persistent` and one `temporary` — otherwise it
> throws. Their hashes are also pinned into each capture's runtime manifest, so a
> change is recorded rather than silent.

### How B's and C's data keys were obtained

No keys file existed for either. They were reconstructed from A's
([`2026-09-08-scan-entry-types/data-keys.json`](../2026-09-08-scan-entry-types/data-keys.json)),
which decode to two symbol-vec keys — `["Persistent"]` at persistent durability and
`["Temporary"]` at temporary — by substituting the contract address and re-encoding.

**The construction was self-tested before being trusted.** Rebuilding *A's own* keys through
the identical code path reproduces the original base64 **byte for byte**, for both keys. A
hand-built ledger key has already produced one false result in this project — a probe that
threw before reaching the guard and would have been reported as "caught" — so the method was
proven against a known-good input rather than assumed from the fact that it ran.

Committed here as [`data-keys-B.json`](data-keys-B.json) and
[`data-keys-C.json`](data-keys-C.json) so this is repeatable.

## Result

Read with the shipped CLI at ledger 4,672,772 / 4,672,773:

| Subject | Entry | Ends at ledger | ≈ Expiry |
|---|---|---|---|
| **guinea-pig B** | instance | 4,793,687 | 2026-09-21 12:00 UTC |
| | persistent | 4,793,688 | 2026-09-21 12:00 UTC |
| **guinea-pig C** | instance | 4,880,097 | 2026-09-26 12:01 UTC |
| | persistent | 4,880,099 | 2026-09-26 12:01 UTC |
| **shared** | code (3 consumers) | 5,290,829 | 2026-10-20 06:28 UTC |

Matches the documented crossings in `write-guard.ts` exactly. Raw output:
[`scan-B.json`](scan-B.json), [`scan-C.json`](scan-C.json).

### Neither B nor C has a temporary entry

Both scans exit **3** with `entry-not-found` for the temporary key. B and C have an
instance and a persistent entry, and nothing else at A's key shapes.

For a temporary entry, "absent" and "already deleted" are indistinguishable from outside —
temporary entries are *deleted* at expiry, not archived, and leave nothing behind. Either
way there is no temporary entry for a write to have touched, so the verification is complete
in both readings.

**Exit 3 is the correct outcome and is preserved deliberately.** It says the scan came back
incomplete, which is true: a key was asked for and not found. Reporting exit 0 here would be
the scanner claiming coverage it does not have.

> The first run of this check was piped through `head` and reported `exit=0` — which was
> **`head`'s** exit status, not the CLI's, and it hid both the `entry-not-found` issue and
> the real exit 3. That pipe-status defect has recurred repeatedly in this project. The
> numbers above come from unpiped runs writing to a file.

## Blast radius of the whole `W3-D17-05` / `W3-D18-02a` stack

`packages/core/src/write-guard.ts` is **untouched** across all six PRs
(#142–#147): `git diff main...#147 -- packages/core/src/write-guard.ts` is empty. The
protected-subject list, the dates and the refusal logic are byte-identical to `main`.

## Guard behaviour, rehearsed before the day

Two runs of [`scripts/b-crossing-probe.mjs`](../../../scripts/b-crossing-probe.mjs),
both read-only and decide-only:

- [`pre-crossing-state.txt`](pre-crossing-state.txt) — at the real 17,280 threshold, B reads
  `WARNING — Low, recoverable… Above action threshold; warning only, no bump needed.`
  **Nothing is attempted, so the guard is never consulted.** Correct before a crossing.
- [`guard-refusal-rehearsal.txt`](guard-refusal-rehearsal.txt) — with the threshold raised to
  1,500,000 so B becomes a candidate, the guard fires:
  `REFUSED BY WRITE GUARD — Refusing to write: this would touch guinea-pig B`, and the shared
  code entry is refused alongside it.

The raised threshold is a **rehearsal device to reach the refusal path off-date**, exactly as
the A save used one to reach the extend path. **It is not natural decay**, and neither run
claims to be the Sep 20 proof.

## One live finding, recorded here because it was found by this work

At the time of this check B's instance had **120,909 ledgers remaining**, which is below
`DEFAULT_WARN_LEDGERS` (120,960). The engine classifies that as `WARNING`, as
`pre-crossing-state.txt` shows. **`evergreen scan` reports it `HEALTHY`**, because the scan
path calls the single-threshold `assessEntry` and prints `(threshold 17,280 ledgers)`, while
the two-tier `assessEntryWithThresholds` is used only by the engine. Tracked separately; it
does not affect the numbers above, which are ledger readings rather than health verdicts.
