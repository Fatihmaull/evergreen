# Setup — environment, accounts, and shared config

Filled in during Week 1 (W1-D3 → W1-D5). Keep it current: this is the file that lets a new machine — or a new agent — become productive without asking anyone.

**Never put a secret in this file.** Contract IDs and public keys are fine; seeds, private keys, and API tokens are not.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node | *(pin in W1-D3-02)* | pinned via `.nvmrc` |
| pnpm | *(pin)* | workspace manager |
| Stellar CLI | *(pin in W1-D4-01)* | exact version — Soroban's surface moves |
| Rust toolchain | *(only if ADR-002 fallback to OpenZeppelin)* | not needed on the default path |

```bash
git clone <repo-url> && cd evergreen
pnpm install
cp .env.example .env     # then fill in locally — never commit
pnpm typecheck && pnpm lint && pnpm test
```

## Environment variables

Documented here, values only in your local `.env` / platform secret store.

| Variable | What it is | Where the real value lives |
|---|---|---|
| `SOROBAN_RPC_URL` | Testnet RPC endpoint | `.env` (non-secret, but env-driven) |
| `STELLAR_NETWORK_PASSPHRASE` | Testnet passphrase | `.env` |
| `EVERGREEN_SIGNER_SECRET` | Ed25519 signer for the bot (**testnet only**) | `.env` local · GitHub Actions secret · hosting env store |
| `EMAIL_API_KEY` | Email provider key | secret stores only |
| `EVERGREEN_CONFIG_PATH` | Path to `evergreen.config.json` | `.env` |

## Testnet accounts

**All testnet. No key here ever controls real funds.**

| Purpose | Public key | Funded via | Owner |
|---|---|---|---|
| Fatih dev | *(W1-D4-02)* | friendbot | F |
| Rakha dev | *(W1-D4-02)* | friendbot | R |
| `evergreen-a` — W1-D4-06 deployer | `GBRGOJUAPPDR7YWM4GOGV3YLSCPWDW4KJZVL4R2LRG7HFIYCY5ODMWLZ` | friendbot | F |
| `evergreen-b` — W1-D4-06 extender | `GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE` | friendbot | F |
| Bot signer (Stage 1, plain funded) | *(W1-D4-02)* | friendbot | R |
| Policy signer (Stage 2, hardened) | *(W3-D19)* | friendbot | R |

> The bot account holds only enough XLM to pay `extendTTL` fees. It has no authority over any contract — it does not need any, because `extendTTL` is permissionless. Treat it as a hot, expendable key (`AGENTS.md` hard rule 4).

## Guinea-pig contracts

**Two of them, with different jobs.** Do not use one where the other is meant.

### A — the working test subject

Used for everyday development, manual extends, and the threshold proof (`W3-D18-02a`). Bump it, break it, redeploy it freely.

| Field | Value |
|---|---|
| Contract ID | `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L` |
| Deployed | 2026-09-05, by account A (`GBRGOJUA…MWLZ`) |
| Initial TTL | instance/code/persistent ≈ 120,927 ledgers · temporary 688 ledgers |
| Extended | 2026-09-05 during `W1-D4-06`, to ledger ≈ 4,712,650 |
| Redeploy script | `./scripts/deploy-guinea-pig.sh A` |

> Deployed during `W1-D4-06` and already used for the permissionless verification, so its TTL has been extended once. That is fine — A is the working subject and is expected to be bumped, broken, and redeployed.

### B — the natural-decay subject ⚠️

Deployed on **W1-D4 (Sep 6)** and then left alone to age, so its TTL decays on its own toward the threshold. It exists for exactly one moment: `W3-D18-02b`, the proof that a contract *which would otherwise have been archived* was saved unattended. That is the strongest single piece of evidence in the grant.

| Field | Value |
|---|---|
| Contract ID | `CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ` |
| Deployed | 2026-09-05, ledger ≈ 4,512,936 |
| Calibrated | +280,747 ledgers on instance, code, persistent — **one manual extend, disclosed in `EVIDENCE.md`** |
| `liveUntilLedgerSeq` | 4,793,687 / 4,793,688 / 4,793,689 |
| **Threshold crossing** | ledger ≈ 4,776,407 → **2026-09-20 ~12:00 UTC** (at a 17,280-ledger / 24h threshold) |
| Temporary entry | deliberately **not** calibrated — deleted ~1h after deploy, as intended |
| Interventions since | **none, and none permitted until the proof** |

> ### ✅ Resolved 2026-09-05 — deployed now, with one calibrating extend
>
> Option 2 was chosen. B is deployed and calibrated; nothing further needs to be remembered, and no task has to fire on a specific future day in a sprint whose slack is designed to move things.
>
> Setting initial conditions is experimental control, not interference: every contract has some initial TTL, and choosing it deliberately does not touch the process being demonstrated. The calibration is disclosed openly in `docs/EVIDENCE.md` next to the proof, so a reviewer reading B's transaction history is told what the middle transaction is before they have to ask.
>
> The reasoning that made this necessary, kept for the record:
>
> The measured floors (`W1-D4-04b`) changed this. A fresh persistent entry gets **≈120,928 ledgers ≈ 7 days**. So a B deployed on **Sep 5 archives around Sep 12** — roughly **eight days before** `W3-D18-02b`, the proof it exists for. Deploying it "early so it ages" was the right instinct against the wrong number: it would age straight past the window and be archived before the engine ever watched it.
>
> Two ways to fix it, both sound:
>
> 1. **Deploy B around Sep 12–13** and let the 7-day floor land the crossing near Sep 19–20. Purest version — zero intervention. Cost: a task that must happen on a specific future day, in a sprint that already has slack days that move things.
> 2. **Deploy B now and extend it once, deliberately, to place the crossing in the Sep 19–21 window.** Then leave it strictly alone. B exists and is recorded today, and nothing has to be remembered later.
>
> Option 2 does not weaken the claim. The proof is *"TTL fell below threshold with nobody intervening, and the engine saved it unattended"* — every contract has some initial TTL, and choosing it is not intervening in the decay. The evidence would show one calibrating extend on the deploy date and then untouched decay.
>
> **Resolved. Crossing is projected for 2026-09-20 ~12:00 UTC.**
>
> If Sep 12–13 arrives with genuine slack, deploying a pure third contract as a bonus is cheap, and whichever reads better can be used. That is opportunistic — **B is the plan.**

> ### ⚠️ Guinea-pig B must stay OUT of the engine's watched-contract config
>
> If B ends up in `evergreen.config.json` during Week 3 testing, the engine will dutifully bump it — and destroy the very thing it was deployed to demonstrate. Weeks of aging, gone, with no way to get them back inside the sprint.
>
> The config file carries a comment saying so. **Do not add B to it until the moment of proof.** Losing this to an accidental bump would be an entirely self-inflicted way to lose the grant's best evidence.

### Building and deploying them

Both are deployed from the same source in [`contracts/guinea-pig`](../contracts/guinea-pig) (`W1-D4-00`).

The testnet guard in the deploy script is **deliberate friction.** It compares the live RPC's network id against testnet's — which is the SHA-256 of the network passphrase — so it verifies the endpoint the deploy actually goes through rather than trusting a local alias named "testnet". When mainnet eventually becomes in scope for SOW 2, changing this must be a conscious, reviewed act with its own ADR. It is not a convenience edit, and it should never be relaxed to make a script run.

```bash
rustup target add wasm32v1-none                               # once
cargo test --manifest-path contracts/guinea-pig/Cargo.toml    # local, no network
stellar contract build
./scripts/deploy-guinea-pig.sh A     # or B
```

The script deploys **and seeds** — seeding writes the persistent and temporary entries, so all four entry types exist and `W1-D4-04b` has something to measure. It refuses to run against any network but testnet.

### C — the staggered spare ⚠️

Insurance against a single unrecoverable date. Same method as B, different target: if the engine is not live for B's Sep 20 crossing, C is still ahead of us with time before the Oct 2 deadline.

| Field | Value |
|---|---|
| Contract ID | `CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL` |
| Deployed | 2026-09-05, ledger ≈ 4,513,212 |
| Calibrated | +366,871 ledgers on instance and persistent |
| **Threshold crossing** | **2026-09-25 ~12:00 UTC** — five days after B |
| Interventions since | none, and none permitted |

> **B and C have different crossing dates. Do not reason about them interchangeably.** B is the plan; C is the spare. If B's proof lands, C is documented as an unused spare and costs nothing.

### The shared code entry ⚠️

B and C were deployed from the same Wasm, so **they share one `ContractCode` ledger entry**. Extending it for one extends it for both — it cannot be staggered.

It has been pushed to ledger **5,290,829 (~2026-10-19)**, past the entire sprint, so it drives neither crossing. Each contract's crossing is governed by its own instance and persistent entries. Do not "helpfully" extend or shorten it; doing so affects both proofs at once. Full explanation in `docs/SOROBAN-PRIMER.md`.

### Watching for drift

```bash
python3 scripts/check-decay-drift.py
```

**Run it twice a week and paste the output into `docs/STATUS.md`.** The calibration assumes 5.000 s/ledger holds for ~16 days; a 0.5% deviation is ~1,400 ledgers ≈ 2 hours. Drift running **early** is the dangerous direction — being live "by the projected date" is no good if the crossing arrives six hours before it. The script exits non-zero if anything has drifted more than 6h early.

### Putting B and C into the engine config

The old instruction was "keep them strictly out of the config." That was written before calibration existed. Now that both are calibrated against a specific threshold, they can sit in the config early — the engine will correctly do nothing until the crossing.

**But that safety depends entirely on the configured threshold matching the calibration.** So add them as a deliberate, verified step, never as a convenience:

1. Add the contract to `evergreen.config.json` with the threshold the calibration assumed (17,280 ledgers).
2. Run the engine in **dry-run** and confirm it reports **no action needed** for that contract.
3. Only then let it run live.

Same principle as the testnet guard: exercise the mechanism in the direction where it should *decline* to act, and confirm it declines. A threshold that is accidentally too high bumps the contract immediately and destroys the proof, silently.

### Measured TTL floors

Recorded at `W1-D4-04b` in `docs/SOROBAN-PRIMER.md` § Measured TTL floors. Thresholds are set against those real numbers — never assumed ones — and they determine whether B's proof is achievable in-sprint at all.

> Stellar testnet gets reset periodically. If either contract 404s, redeploy with the script, update the ID here, and note it in STATUS.md — suspect a reset before suspecting your code. **A reset destroys B's accumulated age**: redeploy it immediately and record the lost time in STATUS, because the natural-decay proof may no longer fit the sprint.

## Services

| Service | Purpose | Account/owner | Status |
|---|---|---|---|
| GitHub | repo, CI, Action publishing | [Fatihmaull/evergreen](https://github.com/Fatihmaull/evergreen) | ✅ public, MIT, CI green |
| npm | `evergreen` packages | *(reserve W1-D5-01)* | ⬜ |
| Hosting (Vercel/Netlify/Cloudflare) | dashboard | *(W1-D5-02)* | ⬜ |
| GitHub Actions + Node 24 | read-only scheduler smoke; engine later | same repository (`W1-D5-03`) | 🟡 local SDK read verified; PR #24 open for review; merge and scheduled proof pending |
| Email provider | alerts | *(W1-D5-04)* | ⬜ |
| Shared drive | evidence (screenshots, video) | *(W1-D5-06)* | ⬜ |

## Scheduler smoke test — `W1-D5-03`

The initial scheduler choice is recorded in [ADR-003](adr/ADR-003-toolchain-hosting-persistence.md). Run the same read-only probe locally with the pinned Node version:

```bash
nvm use
pnpm install --frozen-lockfile --ignore-scripts
pnpm scheduler:smoke
```

The script uses the public Testnet endpoint and guinea-pig A instance ID embedded in `scripts/scheduler-smoke.mjs`. It verifies the network passphrase before reading TTL. No `.env`, signing key, or GitHub secret is required. It emits a JSON start record, followed by either `status: "ok"` with ledger/TTL values or `status: "error"` with a nonzero exit. Remaining TTL is `liveUntilLedgerSeq - latestLedger` from the same response; zero is still live. RPC reads have a 10-second timeout each.

`.github/workflows/scheduler-smoke.yml` runs the command manually (`workflow_dispatch`) or at minutes `7,22,37,52` UTC each hour. The GitHub job has a five-minute timeout. This schedule is best-effort, so its interval is not a latency guarantee. Offline tests run through `pnpm test:scheduler` and `pnpm check`; ordinary PR CI does not call Testnet.

**Activation and remaining proof:** review [PR #24](https://github.com/Fatihmaull/evergreen/pull/24); after it is merged to the default branch, run **Scheduler smoke test → Run workflow** once, then capture at least one successful run whose event is **schedule**. Save each run URL, commit SHA, event type, and exported logs in `docs/EVIDENCE.md`. A local or manually dispatched success alone does not complete the scheduler task. Current evidence: [local runtime check](evidence/2026-09-06-scheduler-smoke/README.md).

If Testnet resets or A expires, the probe fails visibly. Reconcile the fixture through the existing setup task before changing its ID; the probe itself only reads.

## Branch protection on `main`

Set 2026-09-05 (`W1-D3-05`). `main` accepts changes **only through a pull request**:

| Rule | Value |
|---|---|
| Required status check | `typecheck · lint · test` (strict — branch must be up to date) |
| Pull request required | yes, approvals required: **0** |
| Admins bound by the rules | **yes** |
| Force pushes / branch deletion | blocked |
| Conversation resolution required | yes |

Two deliberate choices worth knowing:

- **Approvals are set to 0, not 1.** `docs/CONVENTIONS.md` says "no direct pushes" and "CI green before merge" — it does not require an approval, and on a two-person team across timezones a mandatory reviewer is a stall risk on a hard deadline. Every change still goes through a PR, so it is reviewable; it just isn't blocked on someone being awake. Raise it to 1 if that turns out to be too loose.
- **Admins are bound too.** With admin bypass on, a normal `git push` to `main` silently succeeds and prints a small "bypassed rule violations" notice that is easy to miss — so the protection would be decoration, and would read as decoration to anyone inspecting the repo. If you genuinely need to push directly in an emergency, turn enforcement off deliberately and turn it back on:

```bash
gh api -X DELETE repos/Fatihmaull/evergreen/branches/main/protection/enforce_admins
# ... do the thing, then immediately:
gh api -X POST   repos/Fatihmaull/evergreen/branches/main/protection/enforce_admins
```

## Common commands

```bash
pnpm test                 # unit tests (no network)
pnpm test:integration     # hits testnet — run deliberately, never in CI
pnpm typecheck
pnpm lint
pnpm --filter cli dev -- scan <contract-id>
```

## Troubleshooting

Grows from real failures we hit (W4-D26-03). Add entries as they happen — the ones we live through are the ones users will hit.

| Symptom | Likely cause | Fix |
|---|---|---|
| Everything 404s on testnet | testnet reset | redeploy guinea-pig, update IDs |
| `liveUntilLedgerSeq` undefined | entry type carries no TTL | handle undefined, don't assert |
