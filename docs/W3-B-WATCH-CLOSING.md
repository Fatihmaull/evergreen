# Primary watcher — closing summary, guinea-pig B

**Watch ran 2026-09-20 10:28 UTC → 2026-09-21 18:01 UTC.** Secondary capture machine; Rakha ran the primary captures from his own host. Every number below is marked **measured** (read from a sealed bundle, the chain, or a log) or **derived** (computed, with its assumption named).

Raw logs: [`poll.log`](evidence/2026-09-21-b-watch-log/poll.log) · [`fingerprint.log`](evidence/2026-09-21-b-watch-log/fingerprint.log) · [bundle README](evidence/2026-09-21-b-watch-log/README.md).

## The two transitions

### Crossing — below the 17,280 action threshold

| | value | how obtained |
|---|---|---|
| First actionable ledger | **4,776,407** | **derived** — `endsAt 4,793,687 − 17,280`; `needsAction` is `remaining <= threshold` (`ttl.ts:117`), so remaining of exactly 17,280 is already actionable |
| Wall-clock time | ~12:00:23 UTC | **derived, and not observed** — 23 ledgers × an *assumed* constant 5 s cadence, from the last reading above threshold. Ledger close times vary; no bundle timestamps this ledger |
| Last reading above | 11:58:28 UTC, ledger 4,776,384, remaining 17,303 | **measured**, poll log |
| First reading below | **12:00:29.335 UTC, ledger 4,776,408, remaining 17,279** | **measured** — Rakha's sealed bundle. One ledger past the derived crossing |

**No drift figure is claimed.** An earlier version of this record asserted "+0.0 h"; that came from the projection-comparison tool, not from any measurement of the crossing instant, and was withdrawn after review.

### Expiry

| | value | how obtained |
|---|---|---|
| Instance ends | **4,793,687** | **measured**, chain |
| Persistent ends | **4,793,688** | **measured**, chain |
| Representation after expiry | entry **still returned**, `ttl.status: known`, `endsAt: 0`, `remaining` = `0 − observedLedger` | **measured** 2026-09-21 |
| v1 verifier verdict | `unverified` / `INVALID_SUBJECT_TTL` / exit 2 | **measured**, reproduced independently on three of Rakha's attempts and on my own capture |
| Assessed verdict | `expiry-observed`, ledger 4,793,736, `representation: rpc-non-live-zero` | **measured** via `W3-D18-03a`, #216 |

## Captures and verification

| slot | mine | verification | Rakha's | verification |
|---|---|---|---|---|
| 1 crossing | 12:06:59.653Z · ledger 4,776,486 · rem **17,201** | `crossing-refused`, `--require-crossing` **exit 0** | 12:00:29.335Z · ledger 4,776,408 · rem **17,279** | **exit 0** under gate *and* strict CLI |
| 2 | 00:05:07.067Z · ledger 4,785,103 · rem **8,584** | **exit 0** | 00:00:19.735Z | **exit 0** both |
| 3 | 06:05:20.631Z · ledger 4,789,426 · rem **4,261** | **exit 0** | 06:00:30.776Z · ledger 4,789,368 · rem **4,319** | **exit 0** both |
| 4 expiry | **not captured** | — | 12:00:35 / 12:02:24 / 12:04:29 | `unverified` retained as evidence; `expiry-observed` under the assessor |

All figures **measured** from sealed bundles. Seven evidence directories on `main`; the crossing gate has been **exit 0** since slot 1 and is unaffected by slot 4's verdict.

Runtime fingerprint `8c17365f…`, **31 files, unchanged across the entire watch** — through eleven merges, a branch integration, a conflict resolution and four temporary worktrees. **Measured**, re-checked every five minutes and at every slot.

## The gap, and its cause

| gap | duration | what it covered |
|---|---|---|
| 09-21 06:26 → 07:09 | 43 min | routine |
| **09-21 10:49 → 15:17** | **268 min** | **B's expiry at ~12:00 and the 12:05 capture slot** |

**Cause: the machine slept on battery.** `pmset -g log` — **measured** — shows `Entering Sleep state due to 'Maintenance Sleep' ... Using Batt` and `Wake from Deep Idle ... lid`.

`caffeinate -dimsu` held all three assertions continuously on one pid across 29 h that included those sleeps. **The mechanism was working and the outcome was not.** I verified the assertions and reported that as the rigorous check; the outcome check — the poll log's own continuity — existed, was correct, and was read only at T−7, roughly every six hours. My wake timer was suspended along with everything else, so the 11:53 check fired at 16:34.

Both watchers on this host gapped together. Running them as separate processes gave independent failure domains for *process death*, which is not what happened.

## What I would do differently

1. **Self-check continuity at the poll cadence, not at the consumer's cadence.** A ten-minute loop that notices gaps every six hours has a six-hour blind spot by construction. This is the single change that would have caught the sleep in ten minutes instead of four hours.
2. **Verify outcomes, not mechanisms.** `pmset -g assertions` answers "is caffeinate asserting"; `pmset -g log` answers "did the machine sleep". I checked the first and reported it as the second.
3. **Never state a derived quantity without naming the derivation.** Three factual errors in this watch — the crossing timestamp, the zero-drift claim, and "`expiry-observed` does not exist on main" — were all conclusions the instrument could not support, stated as fact. All three were caught by someone else. Meanwhile four instrument failures I caught myself, before any of them misled anyone. The discipline was present for code and absent for prose.
4. **Treat a non-zero exit from our own tooling as a finding.** The poll loop read `EXIT_BELOW_THRESHOLD = 1` as a broken scan and went blind **at the moment B crossed** — six `SCAN_FAIL` lines, all of them successful reads. Recorded in `CONVENTIONS`.
5. **Do not predict an observable and present it as known.** The slot-4 guidance was derived from a code read, described a signature that does not occur, and was written specifically so an operator would recognise success.

## What held

The **decay sequence is complete and every figure is measured**: 17,279 → 17,201 → 8,584 → 4,319 → 4,261 → expiry. Two independent bundles per slot for the first three. The write guard refused B at every capture, and nothing was ever signed or submitted.

**The redundancy is what saved this**, and not for the reason it was added. A second machine went in for availability; it covered an exit-code blindness at the crossing and a sleeping host at the expiry — neither foreseen.
