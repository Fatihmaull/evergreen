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

> The bot account holds only enough XLM to pay `extendTTL` fees. It has no authority over any contract — it does not need any, because `extendTTL` is permissionless. Treat it as a hot, expendable key (CLAUDE.md hard rule 4).

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
| Contract ID | *(not yet deployed — timing decision open, see below)* |
| Deployed | *(pending)* |
| Initial TTL | *(pending)* |
| Expected threshold-crossing | *(pending)* |

> ### ⚠️ B's deploy date is now a real decision, not a rote task
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
> **Unresolved — pick before Rakha runs `W1-D4-04c`.**

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
