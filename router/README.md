# Evergreen fee router (PH2-E4-08)

The production router of [ADR-009](../docs/adr/ADR-009-router-scope-and-fee-destination.md). One invocation, one signature: the payer's fee goes **straight to the treasury**, then the target contract's **instance and code** TTL is extended. Rent is paid by the transaction's source account, the user.

- **Instance and code only.** A contract cannot extend another contract's persistent or temporary data. Persistent data needs an allowance. Never describe a contract extended this way as "fully safe".
- **No address is compiled in.** `__constructor(fee_token, treasury)` sets both at deploy. There is no admin, upgrade or withdraw function; a new treasury means a new deployment.
- **The final treasury address is undetermined** until `PH2-E4-03`. Testnet treasury (#299): `GD7LISFDUOWIVEW3FX452FIGARVRACPTHXVJ42XOBHMJMOQAPIRRMMRZ`. Mainnet: undetermined.

| Function | Does |
|---|---|
| `fee_and_extend(payer, fee, target, threshold, extend_to)` | `payer.require_auth()`; refuses `fee < 0` (`NegativeFee`) and `threshold > extend_to` (`ThresholdAboveExtendTo`); transfers `fee` to treasury if `> 0`; `deployer().extend_ttl(target, …)` |
| `treasury()`, `fee_token()` | Reads the deploy-time values |

```bash
cargo test --manifest-path router/Cargo.toml                                   # no network
cargo build --manifest-path router/Cargo.toml --release --target wasm32v1-none # wasm, CI caps it at 64 KiB
```

CI: `.github/workflows/router-rust.yml` (fmt, clippy `-D warnings`, test, wasm build, 65,536-byte cap). Measured 2026-10-22: `evergreen_router.wasm` 7,763 bytes.

`test-subject/` is a test-only stand-in for a user's contract with one persistent and one temporary entry.
