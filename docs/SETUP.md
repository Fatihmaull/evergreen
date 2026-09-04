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
| Bot signer (Stage 1, plain funded) | *(W1-D4-02)* | friendbot | R |
| Policy signer (Stage 2, hardened) | *(W3-D19)* | friendbot | R |

> The bot account holds only enough XLM to pay `extendTTL` fees. It has no authority over any contract — it does not need any, because `extendTTL` is permissionless. Treat it as a hot, expendable key (CLAUDE.md hard rule 4).

## Guinea-pig contracts

**Two of them, with different jobs.** Do not use one where the other is meant.

### A — the working test subject

Used for everyday development, manual extends, and the threshold proof (`W3-D18-02a`). Bump it, break it, redeploy it freely.

| Field | Value |
|---|---|
| Contract ID | *(W1-D4-04)* |
| Deployed | *(date)* |
| Initial TTL | *(ledgers)* |
| Redeploy script | `scripts/deploy-guinea-pig.sh` *(W1-D4-04)* |

### B — the natural-decay subject ⚠️

Deployed on **W1-D4 (Sep 6)** and then left alone to age, so its TTL decays on its own toward the threshold. It exists for exactly one moment: `W3-D18-02b`, the proof that a contract *which would otherwise have been archived* was saved unattended. That is the strongest single piece of evidence in the grant.

| Field | Value |
|---|---|
| Contract ID | *(W1-D4-04c)* |
| Deployed | *(date — early, on purpose)* |
| Initial TTL | *(ledgers)* |
| Expected threshold-crossing | *(estimate from the measured floor)* |

> ### ⚠️ Guinea-pig B must stay OUT of the engine's watched-contract config
>
> If B ends up in `evergreen.config.json` during Week 3 testing, the engine will dutifully bump it — and destroy the very thing it was deployed to demonstrate. Weeks of aging, gone, with no way to get them back inside the sprint.
>
> The config file carries a comment saying so. **Do not add B to it until the moment of proof.** Losing this to an accidental bump would be an entirely self-inflicted way to lose the grant's best evidence.

### Measured TTL floors

Recorded at `W1-D4-04b` in `docs/SOROBAN-PRIMER.md` § Measured TTL floors. Thresholds are set against those real numbers — never assumed ones — and they determine whether B's proof is achievable in-sprint at all.

> Stellar testnet gets reset periodically. If either contract 404s, redeploy with the script, update the ID here, and note it in STATUS.md — suspect a reset before suspecting your code. **A reset destroys B's accumulated age**: redeploy it immediately and record the lost time in STATUS, because the natural-decay proof may no longer fit the sprint.

## Services

| Service | Purpose | Account/owner | Status |
|---|---|---|---|
| GitHub | repo, CI, Action publishing | Apex | *(W1-D3-01)* |
| npm | `evergreen` packages | *(reserve W1-D5-01)* | ⬜ |
| Hosting (Vercel/Netlify/Cloudflare) | dashboard | *(W1-D5-02)* | ⬜ |
| Scheduler (Actions cron / CF Workers cron) | engine runs | *(W1-D5-03)* | ⬜ |
| Email provider | alerts | *(W1-D5-04)* | ⬜ |
| Shared drive | evidence (screenshots, video) | *(W1-D5-06)* | ⬜ |

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
