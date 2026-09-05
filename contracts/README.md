# `contracts/` — the guinea-pig contract

**A test fixture, not a deliverable.** Evergreen does not ship a Soroban contract; this exists so we have a contract on testnet whose TTL we own and can watch decay.

## Why it writes three entry types

Deploying gives instance and code entries for free. `seed()` adds one **persistent** and one **temporary** entry, so a single contract carries all four entry types — which is what `W1-D4-04b` needs to measure the real TTL floor per type rather than assuming one.

The persistent/temporary split matters beyond measurement: persistent entries are **archived** and restorable, temporary entries are **deleted** and gone forever. Evergreen must report those differently, so we need both to test against.

## Two deployments, different jobs

| | Purpose | Engine watches it? |
|---|---|---|
| **A** | Working subject — everyday development, manual extends, the threshold proof (`W3-D18-02a`) | yes |
| **B** | Natural-decay subject — deployed early, left to age, saved unattended at `W3-D18-02b` | **no, not until the moment of proof** |

> ⚠️ **B must never enter the engine's watched-contract list early.** The engine would dutifully bump it and destroy the weeks of ageing it was deployed to produce, and there is no way to get that time back inside the sprint. The warning is repeated in `scripts/deploy-guinea-pig.sh`, `evergreen.config.example.json`, and `docs/SETUP.md` — three places, because this is the accident that costs us the grant's strongest evidence.

## Build, test, deploy

```bash
cargo test --manifest-path contracts/guinea-pig/Cargo.toml   # local tests, no network
stellar contract build                                        # -> target/wasm32v1-none/release/guinea_pig.wasm
./scripts/deploy-guinea-pig.sh A                              # deploy + seed
```

Requires the Rust toolchain and the `wasm32v1-none` target (`rustup target add wasm32v1-none`). `soroban-sdk` is pinned exactly in the root `Cargo.toml` — Soroban's surface moves and a silent minor bump can change TTL semantics.

## Not in CI, on purpose

The default `pnpm test` and the CI workflow cover the TypeScript packages only. Building this contract needs the Rust toolchain and a wasm target, which would add minutes to every PR for a fixture that changes approximately never.

The tradeoff: a change that breaks the contract won't be caught until someone builds it. That is acceptable while it stays ~90 lines and is compiled by hand before every deploy. **If this contract starts changing regularly, add a Rust job to CI** rather than continuing to rely on that.
