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
| **1 — Core CLI** | Public repo, published npm package, CLI screenshots showing TTL/archive prediction/cost, test coverage report | 🟡 W1 instance-scan snapshot captured; full CLI and npm release remain W2/W4 |
| **2 — Auto-Bump Engine** | Testnet `extendTTL` tx hashes, engine logs, alert screenshots, policy-signer setup guide | 🟡 Manual/permissionless foundation evidence recorded; unattended engine proofs remain W3 |
| **3 — Dashboard + CI + Docs** | Live dashboard URL, published GitHub Action, 3–5 min demo video, docs, npm links | 🟡 Hosting placeholder live; functional dashboard, product Action and release artifacts remain W4 |

## Deliverable 1 — readiness at the Sep 16 gate

**Handover, 2026-09-10.** Session 1 assembled D1 evidence through this date; Session 2 owns it from here. This section is the complete picture, including the requirements that are fine, so it can be picked up without asking anyone.

**SOW §6.1 requires, for Deliverable 1:** *"Public repo, published npm package, CLI screenshots showing TTL/archive prediction/cost, test coverage report."* Four requirements, quoted rather than paraphrased, and treated below as four separate rows because two are met and two are not.

| # | Requirement | State | Blocked behind | Unblocked by / when |
|---|---|---|---|---|
| 1 | Public repo | ✅ **Met** | — | [Fatihmaull/evergreen](https://github.com/Fatihmaull/evergreen), MIT, CI green |
| 2 | Published npm package | ❌ **Not met — and not a Sep 16 concern** | `W4-D27-02` | Rakha, ~Sep 29 |
| 3 | Screenshots: TTL / archive prediction / cost | ⚠️ **Unblocked — all three now in the CLI; the capture itself remains** | — | Recapture once the CLI is final |
| 4 | Test coverage report | ✅ **Met** | — | [Committed 2026-09-10](evidence/2026-09-10-coverage/README.md); floor enforced in CI from 2026-09-12 |

### 1 — Public repo ✅

Met and stable. Nothing to do.

### 2 — Published npm package ❌, and **nobody should panic at the gate**

All three packages are still `"private": true` at `0.0.0`. Publication is `W4-D27-02`, planned ~Sep 29.

**This is correct, not late.** The Sep 16 gate is the *CLI feature* gate; **Deliverable 1 is submitted on Oct 2**, and Sep 29 precedes that. A red row here on Sep 16 is the plan working. What *would* be a problem is the two admin tasks that gate it — `W4-D27-00` (npm 2FA) and `W4-D27-00b` (invite Rakha to the org, still **blocked on his npm username**) — which both sit on the same day as the publish they gate. `W2-D14-02c` pulls them into Week 2 for that reason.

The install path itself is proven: `W2-D14-02b`'s pack-and-install rehearsal found that `npx @evergreen-stellar/cli` would have returned a hard 404 for every user, because `cli` and `core` both declare `@evergreen-stellar/shared-types` as a runtime dependency while only two packages were going to be published. Fixed and re-verified on 2026-09-09. **`W4-D27-02` publishes three packages, in order.**

### 3 — Screenshots showing TTL, archive prediction and cost ⚠️

Three sub-parts, and they are not in the same state:

| Sub-part | Exists? | Where / why not |
|---|---|---|
| **TTL** | Yes, but **stale** | [`2026-09-08-w1-review/`](evidence/2026-09-08-w1-review/README.md) captures the W1 **instance-only** scan. The CLI now reads four entry types, prints coverage, and its exit codes changed twice (ADR-006, then its amendment in #66). The artifact shows a CLI that no longer behaves that way. |
| **Archive prediction** | Yes, **uncaptured** | Landed in #65 (`projectEnd` / `measureCadence`). The CLI prints `approx:` today. It has never been in a screenshot. |
| **Cost** | **Yes — `evergreen scan <id> --cost` prints it** | `W2-D9` landed 2026-09-10, CLI wiring included. Total leads (*what leaves the account*), rent breaks out beneath, [validated to within ~18%](evidence/2026-09-10-rent-model-validation/README.md) of a real recorded fee and labelled as an estimate rather than a quote. **All three sub-parts of Row 3 now exist in one command** — the recapture is unblocked. |

**Cost was the binding item for this whole requirement, and the model half is now done.** `W2-D9` was Pending with nothing in flight on 2026-09-10 and was taken over rather than left, because without it there is no screenshot showing cost, ever — the same reason `W2-D13-03` batch scan was cut to protect it. **What remains is CLI wiring**: `estimateRent` needs a `--cost` path so a rent figure appears in human and `--json` output. Until that lands there is still nothing to screenshot. The validation data used: [`extendTTL-fees-guinea-pig-a.json`](../packages/core/test/fixtures/extendTTL-fees-guinea-pig-a.json), three measured extends with `rentFeeCharged` isolated from `resultMetaXdr`.

#### ✅ The four-entry-type command, verified 2026-09-12

**Checked before handing it over, because the `temporary` key was the risk.** Those keys were recorded on Sep 8, and temporary entries are *deleted* rather than archived — if it had lapsed, the four-type capture would not be reproducible from them and a fresh entry would be needed.

It has not lapsed: the `W1-D7-08` extend on Sep 9 carried the temporary entry to December along with the others. All four types return:

```bash
pnpm cli scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L \
  --keys-file docs/evidence/2026-09-08-scan-entry-types/data-keys.json
```

```
HEALTHY  instance    AAAABgAAAA…
HEALTHY  persistent  AAAABgAAAA…
HEALTHY  temporary   AAAABgAAAA…
HEALTHY  code        AAAAB8flXw…
```

Add `--cost --ledgers 518400` for the cost figure, and `--json` for the machine-readable capture. **Both output modes are needed** — §6.1 names both.

#### The recapture — once, and only once

**Do not recapture before `W2-D9` lands.** Capturing now produces a *third* superseded artifact.

Conditions, all four:

1. **After `W2-D9-01/02` lands**, so cost is actually in the output, and **after the exit codes settle** on #66's amendment.
2. **A real terminal screenshot** — not a rendered image of saved stdout. The current artifact is honestly labelled *"not a screenshot of a terminal application"*, which is to its credit, but **§6.1 says screenshots and a reviewer comparing the wording to the artifact should not have to accept a substitution.** It costs nothing to do properly once the CLI is final.
3. **Both `--json` and human-readable**, since the SOW names both output modes.
4. **Against guinea-pig A** (`CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L`), which now runs to ~2026-12-01 and will not archive under the reviewer.

### 4 — Test coverage report ✅

[Committed 2026-09-10](evidence/2026-09-10-coverage/README.md). 93.95% statements, 85.71% branches, 98.85% functions, 95.28% lines.

**Correction, 2026-09-12.** From Sep 10 to Sep 12 this section and the check-in deck both said the floor was *"enforced in CI"*. **It was not.** The thresholds were configured in `vitest.config.ts`, but `pnpm check` ran `vitest run` without `--coverage`, so they were never evaluated. Proved by setting `statements: 99.9` — impossible — and watching `pnpm check` pass clean.

Now genuinely enforced: `pnpm test` runs `--coverage`, and the gate was commissioned three ways — an impossible global floor, an impossible per-file floor, and deleting a test — each exiting non-zero.

**Per-file floors were added at the same time**, because a global number cannot see a new critical module landing at 0% while the global average stays healthy. That is not hypothetical: `rent-quoter.ts` sat at 0% under an 85% global. On its first run the per-file floor immediately found a second gap — the **synthetic-account default path**, the very thing that removed our hardcoded key from the published bundle, had no test at all.

### What "yes or no at the gate" means

On **Sep 16**, each of the four rows above gets a **yes or a no**. Not a projection, not a percentage, not "on track". **A "nearly" is a no.** Rows 1 and 2 are already decided — 1 is yes, 2 is a no that is expected and fine. Rows 3 and 4 are the live ones.

---

## Manual extension simulation — W2-D11-01

2026-09-10: [unsigned CLI simulation on A's instance](evidence/2026-09-10-manual-extend-simulation/README.md), exit 0. At ledger 4,601,296, remaining TTL 1,424,293 plus requested 1,000 resolved to 1,425,293; prepared fee 15,073 stroops. The bundle contains exact RPC request/response text, CLI JSON and stderr. The capture rejects all methods except Testnet network/entry reads and simulation. No signature or send occurred; the prepared hash is not a transaction receipt. **D11-02/03 live evidence remains Pending.**
## Storage advice — W2-D12-01

2026-09-10: [read-only A report](evidence/2026-09-10-storage-advice/README.md), actual CLI human and JSON runs, exit 0. Four entries produced three scoped recommendations; temporary TTL remained over 1.4 million ledgers despite its configured minimum of 720. Both output modes preserve that distinction and label historical rent separately from unavailable current quotes. Exact RPC responses are saved; no simulation or transaction. Broader D12-02 validation remains Pending.

## Broader storage advice validation — W2-D12-02

2026-09-11: [B/C and third-party Blend TestnetV2 evidence](evidence/2026-09-11-storage-advice-validation/README.md). Read-only known-key scans, publisher-pinned address/schema provenance, matching deployed Wasm, and offline replay. B/C has one shared-code finding with two consumers and correctly reports absent temporary keys; Blend reserve config/accounting recommendations remain conditional. No transaction, quote, contract invocation or claim of full storage coverage. A's prior capture is reused as dated evidence.

## Transaction hashes

### 2026-09-09 — guinea-pig A extended past the sprint (W1-D7-08)

[Full record with before/after RPC and Horizon confirmations](evidence/2026-09-09-guinea-pig-a-extend/README.md). Three `ExtendFootprintTTLOp` transactions from `evergreen-b` (`GDGAWY72…MASE`), which holds no authority over A and needs none.

| Entry | Hash | Before → after | Fee |
|---|---|---|---|
| instance | `f15efca7bfabed10df9ec61f5b2bcb2a8bdfdd53c16d574e0f56766b81db77c0` | 4,712,648 → **6,025,589** | 156,840 stroops |
| persistent | `f48b7e796f9727758de59b8864320033265daf4eff72a70dc9db7183350af787` | 4,712,658 → **6,025,595** | 106,308 stroops |
| temporary | `2963ac1e4cf818fe979dafba009d8d281424638779b0873df1a84e877f90d4fb` | 4,712,659 → **6,025,598** | 55,655 stroops |

All three `successful: true`, confirmed through Horizon rather than trusted from the CLI's success message. **Total 318,803 stroops ≈ 0.032 XLM for ~83 days**, taking all three entries to ~2026-12-01 so the evidence outlives the sprint. The shared `ContractCode` entry was deliberately **not** extended — A, B and C share it, so touching it would move both decay proofs; that is `W3-D18-02d`, due after Sep 25. B and C were verified unchanged immediately afterwards.

**This is a manual, disclosed extend, not an unattended-engine proof.** It belongs to the same category as the Sep 5 calibration extends: deliberate intervention, recorded as such. The unattended proof remains `W3-D18-02b`.

### 2026-09-08 — W1 review: scan snapshot and historical transaction recovery

[Evidence snapshot and complete recovered inventory](evidence/2026-09-08-w1-review/README.md), prepared for `W1-D7-03`. The compiled CLI read guinea-pig A at ledger **4,570,079**, with **142,569 ledgers remaining** and final live ledger **4,712,648**. Human and JSON commands both exited 0. [Scan image](evidence/2026-09-08-w1-review/scan-output.png) presents the actual saved stdout with metadata; raw output and commands accompany it.

The review recovered **19 historical Testnet transactions**: two experiment-account funding transactions, Wasm upload, A/B/C deployment and seeding, four permissionless extends, B/C calibration and the shared-code extension. The linked table gives every hash, full unedited RPC response and explorer screenshot. All 19 envelopes hash to their recorded transaction IDs; contract footprints match their labels. With the five earlier funding/boundary bundles below, the W1 inventory contains **24 unique transactions**.

**Capture timing disclosure:** these 19 transactions happened on Sep 5; their RPC responses and explorer pages were captured on Sep 8. They were missing from the evidence bundle and recovered before the data became unavailable. Original older captures are unchanged. No transaction was submitted during this review, and none of these manual calibration transactions is an unattended-engine proof.

### 2026-09-05 — Testnet account setup (W1-D4-02)

Two account-funding transactions, with original RPC responses and explorer captures. Account roles and public keys are recorded in [SETUP.md](SETUP.md#testnet-accounts).

| Task | Action / signer | Tx hash | Full RPC JSON | Explorer screenshot |
|---|---|---|---|---|
| W1-D4-02 | Create bot account with 20 XLM Testnet / developer key | `f07dd5cafb40ea3466f6d59955c6e04158d3df2c0a684ed3cd790676e3f5be29` | [SUCCESS response](evidence/2026-09-05-testnet-setup/bot-funding-transaction.json) | [Screenshot](evidence/2026-09-05-testnet-setup/bot-funding-explorer.jpg) |
| W1-D4-02 | Friendbot funds developer account | `1af342f683e3a754cca7b3bfc8f41be995fb33fef77ddca48a1bf0ce77e76114` | [SUCCESS response](evidence/2026-09-05-testnet-setup/dev-funding-transaction.json) | [Screenshot](evidence/2026-09-05-testnet-setup/dev-funding-explorer.jpg) |

### 2026-09-06 — TTL boundary repeat (W1-D4-13)

The existing isolated contract was reseeded after its old temporary entry was confirmed absent. The prior run remains inconclusive and unchanged. This transaction calls `seed`; it is not an `extendTTL` or unattended-engine proof. **Exact boundary confirmed:** the entry is [present at L = 4,529,810](evidence/2026-09-06-ttl-boundary/boundary-ledger-4529810.json), when remaining TTL is zero, and [absent at L+1 = 4,529,811](evidence/2026-09-06-ttl-boundary/boundary-ledger-4529811.json). Offline replay of 412 distinct ledger responses confirms the result. [Experiment and verification record](evidence/2026-09-06-ttl-boundary/README.md).

| Task | Action / signer | Tx hash | Full RPC JSON | Explorer screenshot |
|---|---|---|---|---|
| W1-D4-13 | Reseed isolated fixture / developer key | `8617c2f39f39d27a88ef8577e23e0b06ad1f2354fba906b6f04f6dfc72a3e34a` | [SUCCESS response](evidence/2026-09-06-ttl-boundary/boundary-seed-transaction.json), [initial entry](evidence/2026-09-06-ttl-boundary/boundary-initial-entry.json) | [Screenshot](evidence/2026-09-06-ttl-boundary/boundary-seed-explorer.jpg) |

### 2026-09-05 — First TTL boundary observation (W1-D4-13)

The first isolated lifetime was not observed at its boundary and remains **inconclusive**. All 189 raw samples are preserved; see the [experiment record](evidence/2026-09-05-ttl-boundary/README.md). Funding evidence is handled separately in setup PR #20.

| Task | Action / signer | Tx hash | Full RPC JSON | Explorer screenshot |
|---|---|---|---|---|
| W1-D4-13 | Deploy isolated boundary instance / developer key | `34099447d179f0039b811295b7a40b313324a73dbe2ca101825c7214b2b0dc19` | [SUCCESS response](evidence/2026-09-05-ttl-boundary/boundary-deploy-transaction.json) | [Screenshot](evidence/2026-09-05-ttl-boundary/boundary-deploy-explorer.jpg) |
| W1-D4-13 | Seed first temporary entry / developer key | `12650a38e3751c4e185dc173c5c0735e11a76b5a889f7ef95704af5692a42b9c` | [SUCCESS response](evidence/2026-09-05-ttl-boundary/boundary-seed-transaction.json), [initial entry](evidence/2026-09-05-ttl-boundary/boundary-initial-entry.json) | [Screenshot](evidence/2026-09-05-ttl-boundary/boundary-seed-explorer.jpg) |

Add the row the moment you see the hash. `Signer` records which signing path produced it — Stage 1 (plain funded account) or Stage 2 (capped policy signer) — so evidence captured before and after Stage 2 lands reads as a progression rather than a contradiction.

| Date | Task | What it proves | Contract | Signer | Tx hash | JSON | Screenshot |
|---|---|---|---|---|---|---|---|
| | W2-D11-02 | first manual `extendTTL` succeeded | | dev key | | ⬜ | ⬜ |
| | W3-D19-03 | `extendTTL` via the scoped policy signer (headless) | | Stage 2 | | ⬜ | ⬜ |
| | **W3-D18-02a** | **unattended bump — threshold proof** | guinea-pig A | Stage 1 | | ⬜ | ⬜ |
| | **W3-D18-02b** | **unattended bump — natural-decay proof** | guinea-pig B `CCYGO7KQ…LTTQ` | Stage 1 | *(due ~Sep 20 12:00 UTC)* | ⬜ | ⬜ |
| | **W3-D18-02c** | *spare* — natural-decay proof, staggered | guinea-pig C `CCLW55OI…33FL` | Stage 1 | *(due ~Sep 25 12:00 UTC)* | ⬜ | ⬜ |

### ⚠️ Disclosure: guinea-pig B's TTL was deliberately calibrated

**Read this before the proof, not after.** Guinea-pig B's proof has three stages: deployment/seeding → **manual initial calibration by us** → the future engine's unattended extend. Calibration itself used three separate extend transactions; the shared code was extended again while preparing C. Those calibration transactions are not staging, and we would rather explain it here than have a reviewer wonder.

On **2026-09-05**, immediately after deploying B, we performed **one calibration round comprising three extend transactions** to place its threshold crossing inside the observation window. Its instance and persistent entries were left to age; the shared code was extended again while preparing C, as recorded below.

| | |
|---|---|
| Contract | `CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ` |
| Deployed | 2026-09-05, ledger ≈ 4,512,936 |
| Calibrating extend | +280,747 ledgers, applied to instance, code, and persistent entries |
| Tx hashes | instance `54117bd95783ef3d9f19d6caf9831064243fd85ddece3421bbc3a8606757fbb1` · persistent `a99a93bfc7af5bfd783a53f1f3fb04880c9fa74d3194f827490c3e7f8d7b7390` · code `9731d135f7a0a3c645eafb93efa971f946a6d786355d9c341ee3179364c38554` |
| Resulting `liveUntilLedgerSeq` | 4,793,687 / 4,793,688 / 4,793,689 |
| Projected threshold crossing | ledger ≈ 4,776,407 → **2026-09-20 ~12:00 UTC** at a 17,280-ledger (24h) threshold |
| Interventions after calibration | B instance/persistent entries were left alone. The shared Wasm was extended again while preparing C on Sep 5; see the recovered inventory. |

**Why this was necessary.** A freshly deployed persistent entry gets ≈120,928 ledgers ≈ 7 days (measured, `W1-D4-04b`). B deployed on Sep 5 would have archived around Sep 12 — roughly eight days *before* the proof it exists for. Left uncalibrated, there would have been nothing to save.

**Why it does not weaken the claim.** Every contract has some initial TTL. Choosing it deliberately is experimental control, not interference with the process being demonstrated. The claim under test is unchanged and unassisted:

> TTL fell below the threshold with nobody intervening, and the engine extended it unattended.

The ledger rate was measured, not assumed — exactly 5.000 s/ledger over a 100,000-ledger sample, i.e. 17,280 ledgers/day.

**One entry was deliberately left alone.** B's *temporary* entry was not calibrated and was deleted about an hour after deployment, as temporary entries are meant to be. See the storage-type note in `docs/SOROBAN-PRIMER.md`.

### Guinea-pig C — the staggered spare

C (`CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL`) was deployed the same day and calibrated the same way, crossing **2026-09-25 ~12:00 UTC** — five days after B.

It exists because a single unrecoverable date protecting a never-cut proof is one point of failure. If B's window is missed, C is still ahead of us with room before the Oct 2 deadline. If B's proof lands, C is recorded here as an unused spare.

Same disclosure applies: C was deployed, seeded and calibrated on 2026-09-05, with separate instance and persistent extends plus a shared-code extension; hashes and complete artifacts are in the recovered inventory. No later interventions are claimed. **B and C have different crossing dates — do not read them interchangeably.**

One thing worth stating because it is not obvious: B and C were deployed from the same Wasm and therefore **share a single `ContractCode` ledger entry**. It was extended past the whole sprint (to ~2026-10-19) so it drives neither crossing; each contract's crossing is governed by its own instance and persistent entries.

### The two unattended-bump proofs are not interchangeable

**`W3-D18-02a` — threshold proof (insurance, banked early ~Sep 17).** Set the bump threshold *above* the contract's current TTL and the engine fires on its next scheduled run. Proves the engine detects and bumps, unattended, on a real cron. Cheap, repeatable, available on demand.

**`W3-D18-02b` — natural-decay proof (the compelling one).** Guinea-pig B was deployed and initially calibrated on **2026-09-05 (W1-D4-04c)** and left to age so its TTL decays toward the threshold on its own. Proves a contract *that would otherwise have been archived* was saved — which is the claim the demo video makes and the only version that survives a skeptical reader.

Whether B is achievable depends on the TTL floors measured at `W1-D4-04b` (recorded in `docs/SOROBAN-PRIMER.md`). If the floor is longer than the sprint, say so in STATUS.md and ship A as the proof, described honestly.

> ⚠️ **Guinea-pig B must stay OUT of the engine's watched-contract config until the moment of proof.** If it lands in the config during Week 3 testing, the engine will dutifully bump it and destroy the very thing it was deployed to demonstrate. The config file carries a comment saying so; `docs/SETUP.md` repeats it. Losing this to an accidental bump would be an entirely self-inflicted way to lose the strongest evidence in the grant.

## Scheduler runtime evidence — `W1-D5-03`

2026-09-06: [local runtime record](evidence/2026-09-06-scheduler-smoke/README.md) and [unedited script stdout](evidence/2026-09-06-scheduler-smoke/local-run.jsonl) show SDK 17.0.1 on Node 24.13.0 reading guinea-pig A's instance from Testnet. At ledger **4,530,578**, `liveUntilLedgerSeq` was **4,712,648**, leaving **182,070 ledgers**. These are derived script logs, not raw RPC responses. The probe submitted no transaction.

Preparation merged in [PR #24](https://github.com/Fatihmaull/evergreen/pull/24) on 2026-09-07, tracking [Issue #23](https://github.com/Fatihmaull/evergreen/issues/23).

2026-09-07: manual GitHub run [34110254224](https://github.com/Fatihmaull/evergreen/actions/runs/34110254224), event `workflow_dispatch`, succeeded on `main` at `5509c44e37be3bf51d1ef2ec0c8e8f109f605eb2`. Node **24.20.0** / SDK **17.0.1** read A at ledger **4,550,479**, with **162,169 ledgers** remaining. See the [GitHub runtime record, full logs, and metadata](evidence/2026-09-07-scheduler-runs/README.md).

2026-09-07: genuine scheduled run [34111732199](https://github.com/Fatihmaull/evergreen/actions/runs/34111732199), event `schedule`, also succeeded on the same commit. At 10:30:10 UTC, it read A at ledger **4,550,684**, with **161,964 ledgers** remaining. The same [runtime record](evidence/2026-09-07-scheduler-runs/README.md) includes its full log and GitHub run/job metadata, with event and run ID verified against the script output.

**Scheduler smoke proof complete:** the hosted read path ran manually and automatically. Exported evidence is published for review in [PR #27](https://github.com/Fatihmaull/evergreen/pull/27); Issue #23 was closed when PR #27 merged. No transaction was submitted. A single scheduled read does not prove a guaranteed cadence, engine behavior, or an unattended bump.

## Email provider readiness — `W1-D5-04`

2026-09-07: one Resend email was accepted (HTTP 200) at **2026-09-07T11:28:15.674Z**, email ID **`88711fc1-58ea-4e1a-bfb1-862bdfe32f7e`**. The recipient separately confirmed inbox receipt. The [email record and unchanged sanitized stdout](evidence/2026-09-07-email-smoke/README.md) preserve both parts of that evidence, with their limits stated explicitly. This is one local provider-readiness proof, not engine alerting or delivery reliability.

2026-09-08 follow-up: [Issue #37](https://github.com/Fatihmaull/evergreen/issues/37#issuecomment-5573281589) accepts the existing proof. The probe and nine offline tests are integrated from the preserved local branch; [setup instructions](SETUP.md#local-email-smoke--w1-d5-04) describe the preview/send commands. No new email or Stellar transaction is needed for integration. The three-artifact transaction rule does not apply to this email; later engine success/failure alerts require separate evidence.

## Local persistence and Workers compatibility — `W1-D6-04`

2026-09-08: [local experiment record](evidence/2026-09-08-persistence-spike/README.md) preserves eight successful PostgreSQL checks plus a controlled database-unavailable failure. Separate processes contend for the same entry; one receives the claim. Lease generation, pending-state protection, rollback and durable history are verified with synthetic data. A bounded local Workers runtime also imported SDK 17.0.1 and read Testnet A successfully. These are database and read-path proofs, not an unattended bump, hosted database test or Cloudflare deployment. No transaction was signed or submitted; synthetic hashes are not chain evidence. Neon is the accepted W4 target under PR #48; hosted validation is deferred until after the Sep 20 proof. The spike remains unused by the engine, with pending reconciliation and failed-outcome storage documented as adoption prerequisites in the linked record.

## Where evidence lives — resolved 2026-09-07 (`W1-D5-06`)

The original plan called for a shared cloud drive. **In practice we have been committing evidence into the repository under `docs/evidence/<date>-<topic>/`, and that is the better default** — so it is now the rule, not the accident:

- **It is versioned and reviewable.** Evidence arrives through a PR, gets read, and cannot be edited afterwards without a commit.
- **It survives a testnet reset**, which is the entire reason for the three-artifact rule. A cloud drive does too, but only if somebody remembers to upload.
- **It cannot drift from the claim it supports**, because the claim and the artifact land in the same commit.
- **A grant reviewer can see it without being granted access to anything.**

**Use the shared drive only for what genuinely does not belong in git:** the demo video, and any single artifact above roughly 5 MB. Link those from here.

**Size check.** The evidence tree is small — raw JSON compresses well and screenshots are the bulk. Re-check at each week gate; if it approaches a size that makes cloning unpleasant, move screenshots to the drive and keep the JSON in-repo, since the JSON is the part that must be diffable.

## Screenshots

Store ordinary evidence in the repository; use the shared drive only for the large artifacts described above.

| Date | Task | Shot | Link |
|---|---|---|---|
| 2026-09-08 | W1-D7-03 | working instance scan against Testnet; presentation of captured stdout | [Image and raw record](evidence/2026-09-08-w1-review/README.md#working-scan) |
| | W2-D11-03 | TTL before/after a manual extend | |
| | W2-D14-03 | CLI output (human + `--json`), coverage report | |
| | W3-D17-03 | alert emails (success + failure) | |
| | W3-D18-03 | engine run logs on the scheduler | |
| | W4-D24-02 | dashboard: public scan of an arbitrary contract | |
| | W4-D24-02 | dashboard: bump history with real data | |
| | W4-D25-03 | `evergreen-check` failing run + passing run | |

## Published artifacts

| Artifact | URL | Published |
|---|---|---|
| GitHub repo | [Fatihmaull/evergreen](https://github.com/Fatihmaull/evergreen) | ✅ Public |
| npm — `core` | | ⬜ |
| npm — `cli` | | ⬜ |
| GitHub Action | | ⬜ |
| Dashboard hosting | [evergreen-stellar.pages.dev](https://evergreen-stellar.pages.dev) | ✅ W1 placeholder; functional dashboard remains W4 |
| Demo video (3–5 min) | | ⬜ |
| Docs site / README | | ⬜ |

## Weekly evidence snapshots

A short review at each week's gate — what exists, what's missing, what's at risk.

- **W1 (prepared Sep 8; gate planned Sep 9):** [Review and handoff](W1-REVIEW.md), [scan snapshot and recovered evidence](evidence/2026-09-08-w1-review/README.md). Shared review remains tracked in #44.
- **W2 (Sep 16):** *(pending)*
- **W3 (Sep 23):** *(pending)*
- **W4 (Sep 30):** *(pending)*

## Reviewer walkthrough

Written at B-D29-02. One page, non-technical, letting Kenny verify all three deliverables in under 10 minutes: click here, see this; run this one command, see that; watch minute 2:30 of the video.

- [ ] Draft written
- [ ] Tested on someone who hasn't seen the project

### W1 scan exit-code migration — 2026-09-09

The W1-D7-01 milestone exit-code checks record the implementation at capture time. Under W2-D8-03 / [ADR-006](adr/ADR-006-scan-health-exit-codes.md), bare `evergreen scan <id>` without data-key coverage returns 3 even when instance/code are healthy. The historical captures are unchanged; their exit values are not the current interface. `--no-data-keys` is an unverified caller assertion and must not be used merely to silence incomplete coverage.

### W2-D8-04 — Unique ledger keys and known consumers (2026-09-09)

[Read-only B/C evidence](evidence/2026-09-09-scan-dedup/README.md) captures input B, C, B at ledger 4,586,511 and returns two unique contracts, two instances and one shared code entry with both consumers. Entry requests contain 2 keys then 1 key, with no duplicate read. Raw requests/responses, compiled/source hashes, output and checksums are retained. Additional-data coverage remains unknown (health helper 3); no transaction or calibration change occurred. This is core API evidence, not a multi-contract CLI feature or a new drift run.
