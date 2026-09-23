# Setup — environment, accounts, and shared config

Filled in during Week 1 (W1-D3 → W1-D5). Keep it current: this is the file that lets a new machine — or a new agent — become productive without asking anyone.

**Never put a secret in this file.** Contract IDs and public keys are fine; seeds, private keys, and API tokens are not.

## Prerequisites

### Second-machine confirmation — 2026-09-07 (`W1-D4-01`)

Verified on Fatih's machine (aarch64-apple-darwin) against Rakha's pins:

| Tool | Rakha | Fatih | |
|---|---|---|---|
| Node | 24.13.0 | 24.20.0 | both Node 24 — `.nvmrc` pins the major, which is the intent |
| pnpm | 11.25.0 | 11.25.0 | exact |
| Stellar CLI | 28.0.0 | 28.0.0 | exact |
| Rust | 1.98.1 | 1.98.1 | exact |

**The check that actually matters: `stellar contract build` produced Wasm hash `c7e55f0ad89efb0600bc15048b155099fa4d97cee16466fa1244b3dcbce98bfb` on both machines** — byte-identical to the deployed guinea-pig. Matching version strings suggest reproducibility; a matching hash demonstrates it, which is why this is the recorded evidence rather than the `--version` output.

The two Node patch versions differ and that is fine — `.nvmrc` pins `24`, and pinning a patch would create churn without buying anything. If a Node patch ever *does* change the build output, the hash comparison catches it, which is the point of checking the hash rather than the version.

| Tool | Version | Notes |
|---|---|---|
| Node | 24 (`24.13.0` verified locally) | major pinned via `.nvmrc` |
| pnpm | `11.25.0` | exact pin in root `package.json` |
| Stellar CLI | `28.0.0` | version recorded in `.stellar-cli-version`; activate the matching binary as shown below |
| Rust | `1.98.1` + `wasm32v1-none` | `rust-toolchain.toml`; needed to build the guinea-pig fixture, not for TypeScript-only work |
| Soroban Rust SDK | `27.0.6` | exact workspace dependency in `Cargo.toml` and `Cargo.lock` |

The verified local CLI binary is installed at `.stellar/tools/28.0.0/stellar` (gitignored). `.stellar-cli-version` records the version; it does not install or activate it. From the repository root, activate the installed project version in each new terminal:

```bash
export PATH="$PWD/.stellar/tools/$(cat .stellar-cli-version):$PATH"
# Confirm you got the PINNED binary and not one already on PATH.
command -v stellar
stellar --version
```

> **`export` cannot fail, and that is the problem.** If
> `.stellar/tools/<version>/` is not there — a fresh clone, or a machine where
> nobody installed it — the prepended path simply matches nothing and `stellar`
> resolves to whatever was already on `PATH`. On a Mac with Homebrew that is
> `/opt/homebrew/bin/stellar`, and `stellar --version` then reports **that**
> version while you believe you activated the pin.
>
> Checked on macOS 2026-09-15: it does fall through, and the Homebrew binary
> happened to be 28.0.0, so nothing looked wrong. That is the failure mode — it
> is silent when the versions match and silent when they do not. `command -v`
> above is what makes it visible: the path it prints must be inside the
> repository, not `/opt/homebrew` or `/usr/local`.
>
> **Install before you activate.** The paragraph below is the install step, not
> an aside for other people.

For another machine, install the exact version from the [official CLI 28.0.0 release](https://github.com/stellar/stellar-cli/releases/tag/v28.0.0), or use `cargo install --locked stellar-cli --version 28.0.0`. Verify `stellar --version` after installation. The Linux x86_64 release archive used here has SHA-256 `207544486734fccb4df1afc4a7745478f9f1e21688b2f9506f0ef36f60ce3fdc`, verified against the release asset metadata before extraction. **No macOS checksum is recorded**, so on a Mac prefer `cargo install --locked`, which pins by lockfile rather than by a hash we do not have.

The deployed guinea-pig Wasm identifies CLI 28.0.0 / Rust 1.98.1 as its build tools. A local rebuild matches its hash. `W1-D4-01` remains in progress until current tooling versions are confirmed on both development machines.

```bash
git clone https://github.com/Fatihmaull/evergreen.git && cd evergreen
pnpm install
test -e .env || (umask 077 && cp .env.example .env)
# Fill in missing secrets locally; preserve an existing .env.
# Preserving it is correct AND silent: an .env from last month can be missing
# variables added to .env.example since, and nothing says so. This prints them.
# No output means nothing is missing.
comm -13 <(grep -oE '^[A-Z_]+' .env | sort -u) <(grep -oE '^[A-Z_]+' .env.example | sort -u)
pnpm typecheck && pnpm lint && pnpm test
```

## Environment variables

Documented here, values only in your local `.env` / platform secret store.

| Variable | What it is | Where the real value lives |
|---|---|---|
| `SOROBAN_RPC_URL` | Testnet RPC endpoint | `.env` (non-secret, but env-driven) |
| `STELLAR_NETWORK_PASSPHRASE` | Testnet passphrase | `.env` |
| `EVERGREEN_DEV_SECRET` | Developer key for Testnet setup/tests, separate from the bot | local `.env` only |
| `EVERGREEN_SIGNER_SECRET` | Ed25519 signer for the bot (**testnet only**) | `.env` local · GitHub Actions secret · hosting env store |
| `EMAIL_API_KEY` | Resend sending API key for explicit EmailChannel sends | local `.env` / secret stores only |
| `EMAIL_FROM` | One plain sender address; defaults to `onboarding@resend.dev` | local `.env` |
| `EMAIL_TO` | Historical W1 recipient; ignored by W3 EmailChannel | local `.env` only |
| `EVERGREEN_ALERT_TO` | Private EmailChannel destination selected through notifications.toEnvVar | `.env` / hosting env store |
| `EVERGREEN_CONFIG_PATH` | Path to your engine config. **No `evergreen.config.json` is tracked** — the repo ships `evergreen.config.dogfood.json` (real IDs, decide-only, what the cron uses), `.example.json` and `.save-proof.json`. Point this at one of those or at your own copy. | `.env` |

Use `https://soroban-testnet.stellar.org/` and the exact passphrase `Test SDF Network ; September 2015`. The quotes in `.env.example` preserve the spaces and semicolon. Load it with Node's `--env-file=.env` or an env-file parser; do not print the file or pass a secret as a command-line argument. The email smoke below is separate from the later hosted engine.

Read-only smoke test, verified locally (returns `"guinea_pig"`):

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
| Fatih dev (`fatih-dev`) | `GA66NAB6SLNZY737IXYHSZCO53EX5R3INKGJW34VRH3RNLAVIA456TJW` | friendbot | F |
| Rakha dev | `GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB` | Friendbot: 10,000 XLM Testnet on 2026-09-05 | R |
| `evergreen-a` — W1-D4-06 deployer | `GBRGOJUAPPDR7YWM4GOGV3YLSCPWDW4KJZVL4R2LRG7HFIYCY5ODMWLZ` | friendbot | F |
| `evergreen-b` — W1-D4-06 extender | `GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE` | friendbot | F |
| Bot signer (Stage 1, plain funded) | `GBG4I4RN4L5NFPQBG734SJ6R4N4CZRT6YVFTXM7OWP5JBUUI6R6GRQQB` | 20 XLM Testnet from the developer's faucet balance on 2026-09-05 | R |
| Policy signer (Stage 2, hardened) | *(W3-D19)* | friendbot | R |

> The bot account holds only enough XLM to pay `extendTTL` fees. It has no authority over any contract — it does not need any, because `extendTTL` is permissionless. Treat it as a hot, expendable key (`AGENTS.md` hard rule 4).

The bot starts with a fixed **20 XLM Testnet allocation**; no automatic replenishment or engine job is active. This is an operational balance limit, not the Stage 2 policy signer. The bot was created from the developer's faucet balance to avoid placing the full 10,000 XLM faucet allocation in the hot account. [Transaction evidence](EVIDENCE.md#2026-09-05--testnet-account-setup-w1-d4-02) records both funding steps.

The local developer and bot keys were generated fresh and stored only in ignored `.env` with mode `0600`. Both developers' everyday accounts are now designated in the table above; the separate experiment accounts retain their recorded roles. `W1-D4-02` is complete.

## Guinea-pig contracts

`W1-D4-13` uses a separate instance for the temporary-entry boundary experiment: **`CBVX3LUUEZR4HQEPZI3E6DZJN4KGST6EICMVJ5SXIZMSS3DQRZACMWZX`**. It reuses the existing Wasm and does not replace A/B/C. The [first observation](evidence/2026-09-05-ttl-boundary/README.md) stopped before expiry; the [2026-09-06 repeat](evidence/2026-09-06-ttl-boundary/README.md) confirmed presence at ledger 4,529,810 and absence at 4,529,811. B/C and shared code were unchanged. Keep this instance out of automated bump configuration when observing natural expiry.

**A is the working subject; B and C are calibrated decay subjects.** Do not use one where another is meant.

### A — the working test subject

Used for everyday development, manual extends, and the threshold proof (`W3-D18-02a`). Bump it, break it, redeploy it freely.

| Field | Value |
|---|---|
| Contract ID | `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L` |
| Deployed | 2026-09-05, by account A (`GBRGOJUA…MWLZ`) |
| Remaining TTL at initial sample | instance/code/persistent ≈ 120,927 ledgers · temporary 688 ledgers; these are sampled remainders, not network minimums — see [the correction](SOROBAN-PRIMER.md#measured-ttl-floors) |
| Extended | 2026-09-05 during `W1-D4-06`, to ledger ≈ 4,712,650 · **2026-09-09 during `W1-D7-08`, to ~6,025,590** |
| Redeploy script | `./scripts/deploy-guinea-pig.sh A` |

> Deployed during `W1-D4-06` and already used for the permissionless verification, so its TTL has been extended twice. That is fine — A is the working subject and is expected to be bumped, broken, and redeployed.

#### A's horizon — the dates that matter

| Entry | Live until ledger | Projected expiry | On expiry |
|---|---|---|---|
| instance | **6,025,589** | 2026-12-01 19:18 UTC | archived |
| persistent | **6,025,595** | 2026-12-01 19:18 UTC | archived |
| temporary | **6,025,598** | 2026-12-01 19:18 UTC | **deleted — unrecoverable** |
| code *(shared with B and C)* | 5,290,829 | **2026-10-20 06:38 UTC** | archived |

> ### 🔴 One ledger entry is the real expiry date of everything we built
>
> **Ledger `5,290,829` ≈ 2026-10-20 06:38 UTC is not "A's code entry". It is the expiry of the whole project's demonstrable state.** A, B and C share it, so on that date all three contracts become unusable at once — and with them every artifact that points at any of them: both decay proofs, all four evidence snapshots, the scan screenshots, the demo video's contract, the README's reproduction command, and PR #60's four-entry capture. The three December dates in the table above do not protect any of that; this one number governs it.
>
> That date is **eighteen days after the sprint ends**, and attention stops on Oct 2. Scheduled as `W3-D18-02d` on **Sat Sep 26** — the first day the decay proofs are captured and the constraint lifts, and the last day everyone is still looking. Extend to `max_entry_ttl` (180 days, reaching ~2027-03-25, the protocol ceiling) and take A's other three entries to the same date while you are there.
>
> ### 📅 Reading this in early 2027? The engine should already have handled it.
>
> **~2027-03-25 is a real deadline with nobody watching**, six months past any horizon a person is holding in their head — which is the exact failure that produced this whole section. Extending to the ceiling does not remove that problem; it postpones it by 180 days, because 180 days is all the protocol allows in one operation.
>
> **The fix is not a longer extend, it is `W3-D15-01b`:** guinea-pig A is the engine's first monitored contract, and B and C join it once their proofs are captured. Once that ships, **the next extend is the product's job rather than a human's** — the engine watches the shared code entry like any other ledger key and bumps it before the threshold, without anyone remembering to.
>
> So if you are here in February 2027 wondering whether to extend by hand: **first check whether the engine is running and A/B/C are in its watched config.** If they are, this is already handled and the entry will show a fresh `liveUntilLedgerSeq`. If they are not, extend by hand *and* fix that, because the manual extend buys another 180 days of the same exposure.
>
> ### ⚠️ A's code entry is the one still on a clock — and it is not A's alone
>
> All three guinea-pigs were built from the same Wasm (`c7e55f0a…98bfb`, verified by fetching and hashing each contract independently on 2026-09-09), so **they share a single `ContractCode` ledger entry.** "Extending A's code" is not a thing that can be done — it extends B's and C's at the same time, which is why the three extends on Sep 9 named every ledger key explicitly with `--key-xdr` instead of relying on `--id` alone.
>
> **A contract is only as alive as its code entry**, so A becomes unusable on **2026-10-20** regardless of the three dates above. That is deliberate for now: both decay proofs are still live, and `SETUP` forbids touching the shared entry while they are. **Extend it after Sep 25**, once B's and C's proofs are captured — at which point the shared entry is nobody's constraint. Tracked as `W3-D18-02d`.
>
> Full record, including before/after RPC and Horizon confirmations: [`W1-D7-08` evidence](evidence/2026-09-09-guinea-pig-a-extend/README.md).

### B — the natural-decay subject ⚠️

Deployed and initially calibrated on **2026-09-05 (W1-D4-04c)** and then left alone to age, so its TTL decays on its own toward the threshold. It exists for exactly one moment: `W3-D18-02b`, the proof that the engine **detects the crossing and the write guard refuses**, and that the entry then **expires**. 🔴 **B is not saved.** This sentence said "was saved unattended" until 2026-09-22; the decision to let B expire was taken 2026-09-12 and the sweep that corrected `EVIDENCE.md`, `BACKLOG.md` and `W3-SEP18-READINESS.md` on 2026-09-19 missed this file. B expired 2026-09-21 — see [`W3-B-WATCH-CLOSING.md`](W3-B-WATCH-CLOSING.md). The [W1 recovered transaction bundle](evidence/2026-09-08-w1-review/README.md) records deployment, seeding and calibration separately, including the later shared-code extension made while preparing C.

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

> ### ⚠️ An accidental bump of B or C destroys the proof
>
> If B ends up watched by an engine whose threshold is wrong, the engine will dutifully bump it — and destroy the very thing it was deployed to demonstrate. Weeks of aging, gone, with no way to get them back inside the sprint.
>
> **This is not "keep B out of the config".** That was the rule before calibration existed, and it is superseded — see [§ Putting B and C into the engine config](#putting-b-and-c-into-the-engine-config) below, which is the procedure to follow. Calibrated against a matching threshold, the engine correctly does nothing until the crossing; the danger is a *mismatched threshold*, not the config entry. Adding them is a deliberate, verified step: add, dry-run, confirm no action needed, only then run live.

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
| **Alert threshold** | **2026-09-25 ~12:00 UTC** — five days after B |
| 🔴 **Expiry** | 🔴 **2026-09-26 ~12:00 UTC — a Saturday, and the last unrepeatable event in the sprint** |
| Interventions since | none, and none permitted |

> **B and C have different dates, and each subject has TWO of them.** The alert threshold and the expiry are one day apart and are not interchangeable — `write-guard.ts` owns both as `alertThresholdOn` and `expiresOn`, and its comment warns that reading only the first makes you *"arrive a day early for the expiry — and the expiry is the unrepeatable event."* **This table published only the threshold until 2026-09-22.**

> ⚠️ **C is no longer a free spare.** B's expiry was captured, but only by one operator — the secondary machine slept through the window. C is the only remaining chance at a second independent expiry bundle, it falls on a weekend, and nothing comes after it.

### The shared code entry ⚠️

B and C were deployed from the same Wasm, so **they share one `ContractCode` ledger entry**. Extending it for one extends it for both — it cannot be staggered.

It has been pushed to ledger **5,290,829 (~2026-10-19)**, past the entire sprint, so it drives neither crossing. Each contract's crossing is governed by its own instance and persistent entries. Do not "helpfully" extend or shorten it; doing so affects both proofs at once. Full explanation in `docs/SOROBAN-PRIMER.md`.

### Watching for drift

```bash
python3 scripts/check-decay-drift.py
```

**Run it twice a week and paste the output into `docs/STATUS.md`.** The calibration assumes 5.000 s/ledger holds for ~16 days; a 0.5% deviation is ~1,400 ledgers ≈ 2 hours. Drift running **early** is the dangerous direction — being live "by the projected date" is no good if the crossing arrives six hours before it. The script exits non-zero if anything has drifted more than 6h early.

### Putting B and C into the engine config

The old instruction was "keep them strictly out of the config." That was written before calibration existed. Now that both are calibrated against a specific threshold, they can sit in the config early — the engine will correctly do nothing until the crossing. **And underneath that, `write-guard.ts` refuses every write touching B or C unconditionally, with no date logic at all** — so a wrong threshold and a code path would both have to fail together. [`ONBOARDING.md` §4](ONBOARDING.md) carried the superseded "must not enter the engine config early" heading until 2026-09-22 and now points here.

**But that safety depends entirely on the configured threshold matching the calibration.** So add them as a deliberate, verified step, never as a convenience:

1. Add the contract to your engine config — `evergreen.config.dogfood.json` for this repo's own subjects — with the threshold the calibration assumed (17,280 ledgers).
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
| npm | `@evergreen-stellar/cli` + `/core` | org **`evergreen-stellar`** owned (`W1-D5-01`) | ✅ scope owned, so nothing in it can be squatted; `publishConfig.access=public` set. Publication itself is `W4-D27-02`, **not** Sep 16 |
| Cloudflare Pages | dashboard | `evergreen-stellar` (`W1-D5-02`) | ✅ live, HTTP 200 verified |
| GitHub Actions + Node 24 | read-only scheduler smoke; engine later | same repository (`W1-D5-03`) | ✅ manual and genuine scheduled Testnet reads verified; evidence merged in [PR #27](https://github.com/Fatihmaull/evergreen/pull/27) on Sep 7 |
| Resend | local email smoke; engine alerts later | `W1-D5-04` | ✅ one local email accepted (HTTP 200) and inbox receipt confirmed; [evidence](evidence/2026-09-07-email-smoke/README.md) |
| Shared drive | evidence (screenshots, video) | *(W1-D5-06)* | ⬜ |

## Email notifications — W3-D17-01

The reusable `EmailChannel` implements the existing `NotificationChannel` contract.
It renders the core templates; the default is preview, with no API-key lookup or
network request. Engine/scheduler alert wiring and inbox validation remain
W3-D17-04/05. Installing this channel does not enable cron email or transactions.

Add this fragment to a valid Testnet Evergreen config:

```json
{ "notifications": { "channel": "email", "toEnvVar": "EVERGREEN_ALERT_TO" } }
```

Keep `EVERGREEN_ALERT_TO` (one plain recipient address), `EMAIL_FROM` and
`EMAIL_API_KEY` in the environment or ignored local environment file. There is no
fallback to the old `EMAIL_TO`. `EMAIL_FROM` defaults to `onboarding@resend.dev`;
that sender is for the Resend account mailbox, and other recipients require a
verified sender domain. Never paste an API key into chat, config or evidence.
The command does not automatically load `.env`.

Save **one** BumpRecord from a reviewed execution result in an ignored local file,
for example `.evergreen/bump-record.json`. Do not pass the entire run object or
invent a successful record to stand in for a transaction. Input validation checks
shape and outcome consistency, not chain evidence; output explicitly says
`chainVerified: false` and `recordSource: provided-record` where applicable.

```sh
pnpm email:notify --help
pnpm email:notify --record .evergreen/bump-record.json --config evergreen.config.dogfood.json
```

The package command builds first. For explicit local environment-file loading,
after building, use the source-workspace script directly:

```sh
node --env-file=.env scripts/email-notify.mjs --record .evergreen/bump-record.json --config evergreen.config.dogfood.json
```

Both commands above preview only. Review the recipient and message before an
actual send; append `--send` only for an authorized test. The local rehearsal
command refuses sending in CI. Generic channel consumers can use explicit send
mode in an independently configured integration; this does not grant permission
to add keys or activate a workflow.

- `succeeded` renders a confirmed-success message based on the supplied record.
- `submitted` renders UNCONFIRMED and instructs reconciliation before retrying.
- `failed` says success could not be verified; a hash or intent requires inspection.
  A failed dry-run explicitly says no transaction was submitted.
- `simulated` is skipped, including with `--send`; no success email is fabricated.

The single Resend transport refuses redirects, bounds both fetch and response-body
reading to 10 seconds, and never retries automatically. A stable event/payload
uses the same hashed idempotency key. Resend deduplicates for 24 hours, not forever:
[Send Email](https://resend.com/docs/api-reference/emails/send-email),
[Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
Timeout, invalid JSON, missing provider ID and transport errors report unknown
acceptance. Inspect delivery state before another attempt. Diagnostics do not
print API keys, sender/recipient addresses or raw provider errors.

Exit 0 means preview, skipped or provider-accepted; exit 2 means input or delivery
failure. An accepted result contains `emailId` and `receivedInInbox: unverified`.
**Provider acceptance is not proof of inbox receipt.** Confirm actual receipt,
then record sanitized output, event identity, email ID and receipt evidence. A
notification failure must not rewrite a successful BumpRecord or re-run a bump.

**Live W3 channel verified 2026-09-14:** one explicitly labelled diagnostic message was accepted by Resend and Rakha separately confirmed inbox receipt. [Evidence](evidence/2026-09-14-email-channel-live/README.md). This completes channel delivery validation, while actual engine outcome and unattended alert proofs remain D17-03/04/05.

### Historical W1 email smoke

`pnpm email:smoke` now displays migration instructions; its old `--send` is
rejected. `scripts/send-test-email.mjs` no longer owns a provider implementation.
The nine old provider/preview protections were moved to W3 channel/command tests;
`pnpm test:email` now tests the offline retirement shim. Default test execution
uses fixtures and never sends mail.

The **2026-09-07 W1 proof remains valid**: one local setup email was accepted and
inbox receipt was confirmed. Its [evidence](evidence/2026-09-07-email-smoke/README.md)
and [acceptance](https://github.com/Fatihmaull/evergreen/issues/37#issuecomment-5573281589)
remain historical; no replacement W1 send is needed. This proof does not substitute
for W3 success/failure alert validation.

## Scheduler smoke test — `W1-D5-03`

The initial scheduler choice is recorded in [ADR-003](adr/ADR-003-toolchain-hosting-persistence.md). Run the same read-only probe locally with the pinned Node version:

```bash
nvm use
pnpm install --frozen-lockfile --ignore-scripts
pnpm scheduler:smoke
```

The script uses the public Testnet endpoint and guinea-pig A instance ID embedded in `scripts/scheduler-smoke.mjs`. It verifies the network passphrase before reading TTL. No `.env`, signing key, or GitHub secret is required. It emits a JSON start record, followed by either `status: "ok"` with ledger/TTL values or `status: "error"` with a nonzero exit. Remaining TTL is `liveUntilLedgerSeq - latestLedger` from the same response; zero is still live. RPC reads have a 10-second timeout each.

`.github/workflows/scheduler-smoke.yml` runs the command manually (`workflow_dispatch`) or at minutes `7,22,37,52` UTC each hour. The GitHub job has a five-minute timeout. This schedule is best-effort, so its interval is not a latency guarantee. Offline tests run through `pnpm test:scheduler` and `pnpm check`; ordinary PR CI does not call Testnet.

**Verified runtime:** [PR #24](https://github.com/Fatihmaull/evergreen/pull/24) is merged to `main` and the workflow is active. Manual run [34110254224](https://github.com/Fatihmaull/evergreen/actions/runs/34110254224) and genuine `schedule` run [34111732199](https://github.com/Fatihmaull/evergreen/actions/runs/34111732199) both succeeded on 2026-09-07. Full logs, event types, commit SHAs, and job metadata are in the [GitHub runtime record](evidence/2026-09-07-scheduler-runs/README.md). The W1 scheduler smoke proof is complete; exported evidence is published for review in [PR #27](https://github.com/Fatihmaull/evergreen/pull/27). For a fresh manual check, use **Scheduler smoke test → Run workflow** on `main`; a manual run cannot substitute for `schedule` evidence.

If Testnet resets or A expires, the probe fails visibly. Reconcile the fixture through the existing setup task before changing its ID; the probe itself only reads.

## Local persistence experiment — `W1-D6-04`

**Experiment only; unused by the engine and scheduler.** [ADR-003](adr/ADR-003-toolchain-hosting-persistence.md#part-2--decided-2026-09-08) selects Actions + Node 24 and PostgreSQL on Neon, with database adoption deferred to **W4 after the Sep 20 proof**. The commands below reproduce the local spike; they are not a W1 hosted-setup requirement. Read its [known adoption limits](evidence/2026-09-08-persistence-spike/README.md#known-limits-before-adoption) first.

`pnpm persistence:spike` previews the checks without connecting. `pnpm test:persistence` runs offline tests. To run the integration experiment, use a **dedicated disposable PostgreSQL database** and set `PERSISTENCE_DATABASE_URL` in the ignored `.env` or the command environment, then run `pnpm persistence:spike --run`. The database role must be allowed to create a temporary schema and tables. The script creates a unique `evergreen_spike_<random ID>` schema, writes synthetic claims/history, and drops only that schema afterward. It never imports a Stellar signer or submits a transaction.

For a local-only container (Docker or rootless Podman):

```bash
podman run --name evergreen-persistence-probe --detach \
  --publish 127.0.0.1::5432 --env POSTGRES_HOST_AUTH_METHOD=trust \
  docker.io/library/postgres:17
podman port evergreen-persistence-probe 5432
# Substitute the assigned loopback port in this disposable, passwordless URL:
PERSISTENCE_DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/postgres pnpm persistence:spike --run
podman rm -f -v evergreen-persistence-probe
```

Loopback uses no TLS solely for this disposable setup. Remote connections verify the server certificate; use a standard provider connection string with `sslmode=require` or `verify-full`. `channel_binding=require` enables pg's channel-binding support when the server offers it; certificate verification remains mandatory. Other URI options are refused. No connection string or raw database error is printed. A failed check exits nonzero; `cleanup: "failed"` identifies a schema requiring cleanup after connectivity returns. If schema creation's outcome is uncertain, `databaseWrites` is `"unknown"`, not a claim that no write happened. An interrupted process can also leave its generated schema behind.

The local result verifies PostgreSQL semantics, not hosted credentials, networking, pooling, cold starts or service quotas. Hosted validation and migrations are deferred to W4, starting with W4-D26-05. Pending reconciliation and failed-outcome history must be implemented before adopting this store. Database credentials must never reach the browser; dashboard history uses a read-only projection/API or exported artifact. W3 engine history uses Actions summaries/artifacts and same-day committed evidence per W3-D16-03.

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

## Service accounts — the durable record

The click-by-click walkthroughs live in their task issues and die with them. What belongs here is the **outcome**: what a person setting this up again in six months would need.

### npm (`W1-D5-01`)

| | |
|---|---|
| Account owner | Fatih (`fatihmaull`) — owner of the **org** `evergreen-stellar` |
| Published package names | **`@evergreen-stellar/cli`**, **`@evergreen-stellar/core`** |
| Default team | `Developers` — auto-grants read/write across the scope |
| Why not `evergreen` | Squatted by an abandoned MongoDB build-platform client, last published **2016-04-28**. Not obtainable. |
| Scope `@evergreen` claimable? | No. Took **`@evergreen-stellar`** instead — and owning an *org* is strictly better than a name: nothing in the scope can ever be squatted, so no placeholder publishes are needed. |
| ⚠️ `publishConfig` | **`{"access": "public"}` is required in every published package.** Scoped packages default to *private*, and private needs a paid plan — without it a publish either fails outright or silently ships a private package. It lives in `package.json` rather than relying on remembering `--access public` on the day. |
| 2FA | **Currently DISABLED.** Tracked as `W4-D27-00`, to be enabled before the first publish. A public scope other people install from with an unprotected account is a supply-chain risk. |
| Org membership | Rakha needs an invite before `W4-D27-02` — publishing moved to him in the Week 4 rebalance. Tracked as `W4-D27-00b`. |
| Command name | **`evergreen` regardless.** A package published under any name declares `"bin": { "evergreen": … }`, so `npm i -g <name>` still gives users `evergreen scan`. Only `npx <name>` and the install line depend on the package name. |
| If redone | Check availability *before* any doc or screenshot quotes the name. The cost of this task is not the signup, it is every place the name appears. |

### Dashboard hosting (`W1-D5-02`)

| | |
|---|---|
| Provider | Cloudflare Pages |
| Account owner | Fatih |
| Project name | `evergreen-stellar` |
| Deploy URL | **https://evergreen-stellar.pages.dev** — verified HTTP 200 |
| Production branch | `main` — auto-deploys on push |
| Framework preset | **None** |
| Build command | **empty** |
| Output directory | **`apps/dashboard/public`** |
| Why Cloudflare | Not on hosting merit — the P0 dashboard is static, so Vercel/Netlify/Pages are identical. Chosen because the same account can answer whether the Stellar SDK runs on Workers, which is the blocking unknown in ADR-003 Part 2. |
| If redone | Any static host works. **Do not infer that the engine or its persistence lives on Cloudflare** — see the warning in ADR-003. |

> ### ⚠️ Verify a deploy by loading the URL, not by reading the dashboard
>
> Observed 2026-09-08: the build log reported success at 17:30:06, while Cloudflare's step indicator sat on *"Initializing build environment"* for a further **1 minute 34 seconds**, every later step showing `—`. Reading the dashboard alone you would conclude the deploy had hung or failed. It had not; the URL was already serving.
>
> Same family as the testnet guard and the weaker-than-CI local gate: **the reported state and the actual state diverged, and only the actual state was checkable.** Load the URL.

> ### ⚠️ The Cloudflare account is shared — Workers quota is account-wide
>
> This is not a fresh account. It already runs the domain `focustudio.online` and a Worker named `focuswebstudio`.
>
> Irrelevant to Pages, which is static hosting. **It matters for ADR-003**, because Cloudflare Workers free-tier limits are **per account, not per project** — so an existing Worker already consumes part of any budget a future engine would have. Recorded there as an unaccounted factor for the Week 4 revisit, alongside the unmeasured Neon autoscale ceiling.

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

## Temporary retention — W3-D15-02b

Engine temporary retention defaults off. Opt in separately for each declared key
with `temporaryEntryPolicies: [{entryKey, autoExtend: true}]` on every registration
of its contract. Adding a data key does not inherit consent. Due policy skips still
alarm, and opted-in temporary entries without a confirmed save are critical because
expiry deletes them permanently. See [configuration and execution examples](W3-D15-02b-IMPLEMENTATION.md).
This does not change explicit manual CLI extension or protected-subject guards.
