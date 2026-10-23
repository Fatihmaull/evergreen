# Router spike (PH2-E4-07)

A throwaway spike, not a deliverable. CI: `.github/workflows/router-spike-rust.yml` (fmt, clippy, test, wasm build, 64 KiB size cap). `router` takes a SEP-41 fee and calls `deployer().extend_ttl` on a target contract, in one invocation with one signature. `subject` is a stand-in for a user's contract. It has its own Wasm, so it never shares a code entry with the guinea-pigs.

```bash
cargo test --manifest-path experiments/router-spike/Cargo.toml   # no network
```

Verdict and testnet evidence: [`docs/evidence/2026-10-22-router-spike`](../../docs/evidence/2026-10-22-router-spike/README.md).
