# Evidence tracker — Instawards submission

The grant is judged on this file. Record evidence **the day it is produced**, not in Week 4. A lost tx hash is worse than lost code.

**Deadline:** 2026-10-02 · **Reviewer:** Kenny Rivaldi, Ambassador Chapter Lead (Indonesia)
**Requirement source:** SOW §6.1 — evidence must be clear, verifiable, and reviewable *with minimal technical expertise*.

## The three-artifact rule — read before recording anything

**Every transaction row needs three artifacts, not one:**

1. **The tx hash.**
2. **The full, unedited JSON RPC response** (committed under `docs/evidence/` or in the shared drive).
3. **An explorer screenshot** showing the transaction.

**Why:** Stellar testnet is periodically reset. A reset between our bump and the reviewer's check makes every explorer link in this file dead — the reviewer clicks and sees nothing, and the strongest evidence in the grant evaporates through no fault of ours. The hash alone is a pointer to a chain that may not exist at review time. The JSON and the screenshot are self-contained and survive it.

This costs about a minute per transaction if done at capture time and is unrecoverable if skipped. Do it from hash #1.

**Also check:** whether SDF has a testnet reset announced inside 2026-09-03 → 2026-10-02. If one lands mid-sprint, note the date here and re-verify every prior row.

## Status at a glance

| Deliverable | Evidence required (SOW §6.1) | State |
|---|---|---|
| **1 — Core CLI** | Public repo, published npm package, CLI screenshots showing TTL/archive prediction/cost, test coverage report | ⬜ not started |
| **2 — Auto-Bump Engine** | Testnet `extendTTL` tx hashes, engine logs, alert screenshots, policy-signer setup guide | ⬜ not started |
| **3 — Dashboard + CI + Docs** | Live dashboard URL, published GitHub Action, 3–5 min demo video, docs, npm links | ⬜ not started |

## Transaction hashes

### 2026-09-05 — Rakha Testnet setup (W1-D4-02/13)

Raw responses are saved byte-for-byte under [`evidence/2026-09-05-rakha-setup/`](evidence/2026-09-05-rakha-setup/). This is setup and TTL-boundary evidence, not the unattended engine proof.

| Task | Action / signer | Tx hash | Full RPC JSON | Explorer screenshot |
|---|---|---|---|---|
| W1-D4-02 | Create bot account with 20 XLM Testnet / Rakha dev | `f07dd5cafb40ea3466f6d59955c6e04158d3df2c0a684ed3cd790676e3f5be29` | [SUCCESS response](evidence/2026-09-05-rakha-setup/bot-funding-transaction.json) | [Screenshot](evidence/2026-09-05-rakha-setup/bot-funding-explorer.jpg) |
| W1-D4-13 | Seed fresh temporary entry / Rakha dev | `12650a38e3751c4e185dc173c5c0735e11a76b5a889f7ef95704af5692a42b9c` | [SUCCESS response](evidence/2026-09-05-rakha-setup/boundary-seed-transaction.json), [initial entry](evidence/2026-09-05-rakha-setup/boundary-initial-entry.json) | [Screenshot](evidence/2026-09-05-rakha-setup/boundary-seed-explorer.jpg) |
| W1-D4-13 | Isolated boundary contract deploy / Rakha dev | `34099447d179f0039b811295b7a40b313324a73dbe2ca101825c7214b2b0dc19` | [SUCCESS response](evidence/2026-09-05-rakha-setup/boundary-deploy-transaction.json) | [Screenshot](evidence/2026-09-05-rakha-setup/boundary-deploy-explorer.jpg) |
| W1-D4-02 | Friendbot funds Rakha dev | `1af342f683e3a754cca7b3bfc8f41be995fb33fef77ddca48a1bf0ce77e76114` | [SUCCESS response](evidence/2026-09-05-rakha-setup/dev-funding-transaction.json), [Friendbot response](evidence/2026-09-05-rakha-setup/dev-friendbot.json) | [Screenshot](evidence/2026-09-05-rakha-setup/dev-funding-explorer.jpg) |

Add the row the moment you see the hash. `Signer` records which signing path produced it — Stage 1 (plain funded account) or Stage 2 (capped policy signer) — so evidence captured before and after Stage 2 lands reads as a progression rather than a contradiction.

| Date | Task | What it proves | Contract | Signer | Tx hash | JSON | Screenshot |
|---|---|---|---|---|---|---|---|
| | W2-D11-02 | first manual `extendTTL` succeeded | | dev key | | ⬜ | ⬜ |
| | W3-D16-01 | `extendTTL` via the scoped policy signer (headless) | | Stage 2 | | ⬜ | ⬜ |
| | **W3-D20-02a** | **unattended bump — threshold proof** | guinea-pig A | Stage 1 | | ⬜ | ⬜ |
| | **W3-D18-02b** | **unattended bump — natural-decay proof** | guinea-pig B `CCYGO7KQ…LTTQ` | Stage 1 | *(due ~Sep 20 12:00 UTC)* | ⬜ | ⬜ |
| | **W3-D18-02c** | *spare* — natural-decay proof, staggered | guinea-pig C `CCLW55OI…33FL` | Stage 1 | *(due ~Sep 25 12:00 UTC)* | ⬜ | ⬜ |

### ⚠️ Disclosure: guinea-pig B's TTL was deliberately calibrated

**Read this before the proof, not after.** Guinea-pig B's transaction history shows three transactions: deploy → **a manual extend by us** → the engine's unattended extend. That middle transaction is not staging, and we would rather explain it here than have a reviewer wonder.

On **2026-09-05**, immediately after deploying B, we submitted **one** manual extend to place its threshold crossing inside the observation window. Nothing was touched after that.

| | |
|---|---|
| Contract | `CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ` |
| Deployed | 2026-09-05, ledger ≈ 4,512,936 |
| Calibrating extend | +280,747 ledgers, applied to instance, code, and persistent entries |
| Tx hashes | instance `54117bd95783ef3d9f19d6caf9831064243fd85ddece3421bbc3a8606757fbb1` · persistent `a99a93bfc7af5bfd783a53f1f3fb04880c9fa74d3194f827490c3e7f8d7b7390` · code `9731d135f7a0a3c645eafb93efa971f946a6d786355d9c341ee3179364c38554` |
| Resulting `liveUntilLedgerSeq` | 4,793,687 / 4,793,688 / 4,793,689 |
| Projected threshold crossing | ledger ≈ 4,776,407 → **2026-09-20 ~12:00 UTC** at a 17,280-ledger (24h) threshold |
| Interventions after calibration | **none, by design** |

**Why this was necessary.** A freshly deployed persistent entry gets ≈120,928 ledgers ≈ 7 days (measured, `W1-D4-04b`). B deployed on Sep 5 would have archived around Sep 12 — roughly eight days *before* the proof it exists for. Left uncalibrated, there would have been nothing to save.

**Why it does not weaken the claim.** Every contract has some initial TTL. Choosing it deliberately is experimental control, not interference with the process being demonstrated. The claim under test is unchanged and unassisted:

> TTL fell below the threshold with nobody intervening, and the engine extended it unattended.

The ledger rate was measured, not assumed — exactly 5.000 s/ledger over a 100,000-ledger sample, i.e. 17,280 ledgers/day.

**One entry was deliberately left alone.** B's *temporary* entry was not calibrated and was deleted about an hour after deployment, as temporary entries are meant to be. See the storage-type note in `docs/SOROBAN-PRIMER.md`.

### Guinea-pig C — the staggered spare

C (`CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL`) was deployed the same day and calibrated the same way, crossing **2026-09-25 ~12:00 UTC** — five days after B.

It exists because a single unrecoverable date protecting a never-cut proof is one point of failure. If B's window is missed, C is still ahead of us with room before the Oct 2 deadline. If B's proof lands, C is recorded here as an unused spare.

Same disclosure applies: C carries one calibrating extend on 2026-09-05 and no interventions since. **B and C have different crossing dates — do not read them interchangeably.**

One thing worth stating because it is not obvious: B and C were deployed from the same Wasm and therefore **share a single `ContractCode` ledger entry**. It was extended past the whole sprint (to ~2026-10-19) so it drives neither crossing; each contract's crossing is governed by its own instance and persistent entries.

### The two unattended-bump proofs are not interchangeable

**`W3-D20-02a` — threshold proof (insurance, banked early ~Sep 17).** Set the bump threshold *above* the contract's current TTL and the engine fires on its next scheduled run. Proves the engine detects and bumps, unattended, on a real cron. Cheap, repeatable, available on demand.

**`W3-D20-02b` — natural-decay proof (the compelling one).** Guinea-pig B is deployed on **W1-D4 (Sep 6)** and left to age so its TTL decays toward the threshold on its own. Proves a contract *that would otherwise have been archived* was saved — which is the claim the demo video makes and the only version that survives a skeptical reader.

Whether B is achievable depends on the TTL floors measured at `W1-D4-04` (recorded in `docs/SOROBAN-PRIMER.md`). If the floor is longer than the sprint, say so in STATUS.md and ship A as the proof, described honestly.

> ⚠️ **Guinea-pig B must stay OUT of the engine's watched-contract config until the moment of proof.** If it lands in the config during Week 3 testing, the engine will dutifully bump it and destroy the very thing it was deployed to demonstrate. The config file carries a comment saying so; `docs/SETUP.md` repeats it. Losing this to an accidental bump would be an entirely self-inflicted way to lose the strongest evidence in the grant.

## Screenshots

Store files in the shared evidence drive (W1-D5-06); link them here.

| Date | Task | Shot | Link |
|---|---|---|---|
| | W1-D7-03 | first working `scan` against testnet | |
| | W2-D11-03 | TTL before/after a manual extend | |
| | W2-D14-03 | CLI output (human + `--json`), coverage report | |
| | W3-D19-03 | alert emails (success + failure) | |
| | W3-D20-03 | engine run logs on the scheduler | |
| | W4-D24-02 | dashboard: public scan of an arbitrary contract | |
| | W4-D24-02 | dashboard: bump history with real data | |
| | W4-D25-03 | `evergreen-check` failing run + passing run | |

## Published artifacts

| Artifact | URL | Published |
|---|---|---|
| GitHub repo | | ⬜ |
| npm — `core` | | ⬜ |
| npm — `cli` | | ⬜ |
| GitHub Action | | ⬜ |
| Dashboard (live) | | ⬜ |
| Demo video (3–5 min) | | ⬜ |
| Docs site / README | | ⬜ |

## Weekly evidence snapshots

A short review at each week's gate — what exists, what's missing, what's at risk.

- **W1 (Sep 9):** *(pending)*
- **W2 (Sep 16):** *(pending)*
- **W3 (Sep 23):** *(pending)*
- **W4 (Sep 30):** *(pending)*

## Reviewer walkthrough

Written at B-D29-02. One page, non-technical, letting Kenny verify all three deliverables in under 10 minutes: click here, see this; run this one command, see that; watch minute 2:30 of the video.

- [ ] Draft written
- [ ] Tested on someone who hasn't seen the project
