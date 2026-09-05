# Setup — environment, accounts, and shared config

Filled in during Week 1 (W1-D3 → W1-D5). Keep it current: this is the file that lets a new machine — or a new agent — become productive without asking anyone.

**Never put a secret in this file.** Contract IDs and public keys are fine; seeds, private keys, and API tokens are not.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node | 24 (`24.13.0` verified on Rakha's machine) | major pinned via `.nvmrc` |
| pnpm | `11.25.0` | exact pin in root `package.json` |
| Stellar CLI | `28.0.0` | exact pin in `.stellar-cli-version`; supports the live Testnet protocol 28 |
| Rust | `1.98.1` + `wasm32v1-none` | `rust-toolchain.toml`; needed to build the guinea-pig fixture, not for TypeScript-only work |
| Soroban Rust SDK | `27.0.6` | exact workspace dependency in `Cargo.toml` and `Cargo.lock` |

Rakha's CLI 28 binary is installed locally at `.stellar/tools/28.0.0/stellar` (gitignored). The pre-existing `stellar` on the global PATH is 27.0.0, so activate the project version in a new terminal:

```bash
export PATH="$PWD/.stellar/tools/$(cat .stellar-cli-version):$PATH"
stellar --version
```

For another machine, install the exact version from the [official CLI 28.0.0 release](https://github.com/stellar/stellar-cli/releases/tag/v28.0.0), or use `cargo install --locked stellar-cli --version 28.0.0`. Verify `stellar --version` after installation. The Linux x86_64 release archive used here has SHA-256 `207544486734fccb4df1afc4a7745478f9f1e21688b2f9506f0ef36f60ce3fdc`, verified against the release asset metadata before extraction.

The existing on-chain guinea-pig Wasm identifies Fatih's build as CLI 28.0.0 / Rust 1.98.1. This is build provenance, not a fresh check of his machine. `W1-D4-01` stays in progress until his current versions are confirmed.

```bash
git clone https://github.com/Fatihmaull/evergreen.git && cd evergreen
pnpm install
test -e .env || (umask 077 && cp .env.example .env)
# Fill in missing secrets locally; preserve an existing .env.
pnpm typecheck && pnpm lint && pnpm test
```

## Environment variables

Documented here, values only in your local `.env` / platform secret store.

| Variable | What it is | Where the real value lives |
|---|---|---|
| `SOROBAN_RPC_URL` | Testnet RPC endpoint | `.env` (non-secret, but env-driven) |
| `STELLAR_NETWORK_PASSPHRASE` | Testnet passphrase | `.env` |
| `EVERGREEN_DEV_SECRET` | Rakha's separate developer key for Testnet setup/tests | local `.env` only |
| `EVERGREEN_SIGNER_SECRET` | Ed25519 signer for the bot (**testnet only**) | `.env` local · GitHub Actions secret · hosting env store |
| `EMAIL_API_KEY` | Email provider key | secret stores only |
| `EVERGREEN_ALERT_TO` | Destination for later engine alerts | `.env` / hosting env store |
| `EVERGREEN_CONFIG_PATH` | Path to `evergreen.config.json` | `.env` |

Use `https://soroban-testnet.stellar.org/` and the exact passphrase `Test SDF Network ; September 2015`. The quotes in `.env.example` preserve the spaces and semicolon. Load it with Node's `--env-file=.env` or an env-file parser; do not print the file or pass a secret as a command-line argument. No email provider or hosted engine is configured by this setup.

Read-only smoke test, verified on Rakha's machine (returns `"guinea_pig"`):

```bash
stellar network info --network testnet --output json
stellar contract invoke \
  --id CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L \
  --source-account GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB \
  --network testnet --send=no -- ping
```

The public source account is enough for this simulation; no secret is passed on the command line.

## Testnet accounts

**All testnet. No key here ever controls real funds.**

| Purpose | Public key | Funded via | Owner |
|---|---|---|---|
| Fatih dev | *(W1-D4-02)* | friendbot | F |
| Rakha dev | `GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB` | Friendbot: 10,000 XLM Testnet on 2026-09-05 | R |
| `evergreen-a` — W1-D4-06 deployer | `GBRGOJUAPPDR7YWM4GOGV3YLSCPWDW4KJZVL4R2LRG7HFIYCY5ODMWLZ` | friendbot | F |
| `evergreen-b` — W1-D4-06 extender | `GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE` | friendbot | F |
| Bot signer (Stage 1, plain funded) | `GBG4I4RN4L5NFPQBG734SJ6R4N4CZRT6YVFTXM7OWP5JBUUI6R6GRQQB` | 20 XLM Testnet from Rakha dev's faucet balance on 2026-09-05 | R |
| Policy signer (Stage 2, hardened) | *(W3-D19)* | friendbot | R |

> The bot account holds only enough XLM to pay `extendTTL` fees. It has no authority over any contract — it does not need any, because `extendTTL` is permissionless. Treat it as a hot, expendable key (`AGENTS.md` hard rule 4).

The bot starts with a fixed **20 XLM Testnet allocation**; no automatic replenishment or engine job is active. This is an operational balance limit, not the Stage 2 policy signer. The bot was created from the developer's faucet balance to avoid placing the full 10,000 XLM faucet allocation in the hot account. [Transaction evidence](EVIDENCE.md#2026-09-05--rakha-testnet-setup-w1-d4-0213) records both funding steps.

Rakha's two keys were generated fresh and stored only in ignored `.env` with mode `0600`. Fatih already has the two experiment accounts listed above; the separate everyday `Fatih dev` designation remains unconfirmed. `W1-D4-02` stays in progress until that row is resolved; no new key for Fatih was generated on Rakha's machine.

## Guinea-pig contracts

**A is the working subject; B and C are calibrated decay subjects.** Do not use one where another is meant.

For `W1-D4-13` only, Rakha also deployed an isolated boundary instance: **`CBVX3LUUEZR4HQEPZI3E6DZJN4KGST6EICMVJ5SXIZMSS3DQRZACMWZX`**. It reuses the existing Wasm without uploading/extending it. Temporary entry seeded at ledger **4,519,384**, last advertised live ledger **4,520,103**. Do not reseed it during the observation. It does not replace A/B/C. [Experiment record](evidence/2026-09-05-rakha-setup/README.md).

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
| Scheduler (Actions cron / CF Workers cron) | engine runs | *(W1-D5-03)* | ⬜ |
| Email provider | alerts | *(W1-D5-04)* | ⬜ |
| Shared drive | evidence (screenshots, video) | *(W1-D5-06)* | ⬜ |

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
