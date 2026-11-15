# PH2-E4-08 — Router audit preparation

**Status:** preparation for an auditor. This is not the written audit that [`PH2-E5-02`](../BACKLOG.md) requires before any immutable contract goes to mainnet. The card stays `[~]`. No contract code changed in the session that added this page. No fee address was chosen.

**Contract under review:** `router/contract` (`evergreen-router` 0.1.0), source `router/contract/src/lib.rs`. SDK pin `soroban-sdk = "=27.0.6"` (`router/Cargo.toml`). The lockfile resolves `soroban-env-host` 27.0.1 (`router/Cargo.lock`).

**Read with:** [ADR-009](adr/ADR-009-router-scope-and-fee-destination.md), [`router/README.md`](../router/README.md), [`docs/SOROBAN-PRIMER.md`](SOROBAN-PRIMER.md), [`phase-2/PHASE2-PLAN.md`](../phase-2/PHASE2-PLAN.md) §3.3.

Line numbers are from `origin/main` at the commit that added this page. Host line numbers are from the crates.io sources of the locked versions (`soroban-env-host` 27.0.1, `soroban-sdk` 27.0.6), which are not files in this repo. `cargo fetch` in `router/` materialises them.

## Where this brief and the repo differ

The task brief asked for audit preparation of the existing `router/` contract. The repo is ahead of that sentence, and this page follows the repo.

- **The card is larger than this page.** `BACKLOG.md`'s `PH2-E4-08` row already records the contract, the audit-style tests, and Rust CI as landed on 2026-10-22. The row still includes a written audit, Rust CI owned by the DevOps Assistant, and the final fee address. This page is the preparation. It does not close the card.
- **The fee destination is the constructor argument `treasury`.** ADR-009 and `router/README.md` use that name. Nothing in the Wasm is a compiled address. The address is set at deploy (`router/contract/src/lib.rs:45-56`). `BACKLOG.md` says it waits on `PH2-E4-03` and is set at deploy, not in code. `phase-2/PHASE2-PLAN.md`'s card table (the 2026-10-15 table) says "final fee address = treasury" as the card's outcome. `BACKLOG.md` is the more recent operational text. This page does not pick an address.
- **`phase-2/kickoff/CEF.md` item 11 is the `PH2-E4-07` spike, not this card.** The kickoff list stops before the production router. The card lives in `BACKLOG.md` and in the plan's table.
- **Plan §3.3 still says "[to verify]" whether a contract can extend another contract's instance and code.** The spike and ADR-009 closed that: instance and code only. The production function is `env.deployer().extend_ttl` (`router/contract/src/lib.rs:83`). Persistent and temporary data of the target are not extended.
- **A Testnet deployment already exists** and is recorded in [`docs/EVIDENCE.md`](EVIDENCE.md) under `PH2-E4-08` (2026-10-23). That record is evidence of a past deploy. It is not a proposal for the final address. This session made no network call and did not deploy.

## 1. Scope and inventory

### In scope

| Item | Path | Role |
|---|---|---|
| Production router | `router/contract/src/lib.rs` | The only contract an auditor of this card reviews |
| Its tests | `router/contract/src/test.rs` | Soroban test host only. The file says so at line 1 |
| Test stand-in | `router/test-subject/src/lib.rs` | One persistent key and one temporary key, so tests can show the router leaves them alone. Not a product contract. No auth |
| Workspace | `router/Cargo.toml`, `router/contract/Cargo.toml`, `router/test-subject/Cargo.toml`, `router/rust-toolchain.toml`, `router/Cargo.lock` | Pins and the release profile |
| CI | `.github/workflows/router-rust.yml` | fmt, clippy `-D warnings`, `cargo test --locked`, release Wasm, 65,536-byte cap, and a grep that `contract/src/lib.rs` contains no `G…`/`C…` address literal |

### Out of scope for the bytecode audit

- `experiments/router-spike/` — the `PH2-E4-07` spike. It has no `TreasuryIsRouter` check, it `panic`s on a negative fee instead of returning `RouterError`, and it does not check `threshold > extend_to` before the host call (`experiments/router-spike/router/src/lib.rs:44-53`). Do not audit that crate as the production router.
- `packages/core/src/fee.ts` — the off-chain amount a client *proposes*. The contract does not call it and does not enforce it. Cited below only so an auditor can see the gap.
- The allowance path, the engine, and the sweep. Router fees skip the sweep (ADR-009, plan §3.3).

### Entry points

The contract exports four functions. There is no other `#[contractimpl]` block.

| Function | Lines | Arguments | Return |
|---|---|---|---|
| `__constructor` | `lib.rs:45-57` | `fee_token: Address`, `treasury: Address` | `Result<(), RouterError>` |
| `fee_and_extend` | `lib.rs:62-85` | `payer: Address`, `fee: i128`, `target: Address`, `threshold: u32`, `extend_to: u32` | `Result<(), RouterError>` |
| `treasury` | `lib.rs:87-89` | none | `Address` |
| `fee_token` | `lib.rs:91-93` | none | `Address` |

`RouterError` (`lib.rs:30-37`): `NegativeFee = 1`, `ThresholdAboveExtendTo = 2`, `TreasuryIsRouter = 3`.

### What each function does

**`__constructor`** (`lib.rs:45-57`). Runs as part of deploy. See the constructor note under Auth. It rejects `treasury == env.current_contract_address()` with `TreasuryIsRouter` (`lib.rs:50-52`). It then writes the two instance keys (`lib.rs:53-55`). It does not call `require_auth`. It does not check that `fee_token` is the native SAC, that `fee_token` differs from `treasury`, or that `treasury` is a G-address (an account) rather than a contract.

**`fee_and_extend`** (`lib.rs:62-85`), in this order:

1. `payer.require_auth()` (`lib.rs:70`).
2. `fee < 0` → `NegativeFee` (`lib.rs:71-73`).
3. `threshold > extend_to` → `ThresholdAboveExtendTo` (`lib.rs:74-76`). Equal values are allowed. The host also rejects `threshold > extend_to`; see TTL semantics below. The contract returns its own error first.
4. If `fee > 0`, read `Key::FeeToken` and `Key::Treasury` and call `token::TokenClient::transfer(&payer, &treasury, &fee)` (`lib.rs:77-82`). `fee == 0` skips the transfer. ADR-009 §3.
5. `env.deployer().extend_ttl(target, threshold, extend_to)` (`lib.rs:83`).

There is no branch that reads the target's current TTL before charging the fee. The SDK getters `get_contract_instance_ttl` and `get_contract_code_ttl` exist only behind `testutils` (`soroban-sdk` 27.0.6 `src/deploy.rs`, module `testutils`). The contract Wasm does not call them.

**`treasury` and `fee_token`** read instance storage and `unwrap()` (`lib.rs:87-89`, `lib.rs:91-93`). No auth. A missing key traps. After a successful constructor the keys are set. A later caller cannot clear them through any function in this file.

### Storage keys

Instance storage only. The key type is the unit enum `Key` (`lib.rs:22-25`):

| Variant | Written | Read |
|---|---|---|
| `Key::FeeToken` | constructor, `lib.rs:54` | `fee_and_extend` when `fee > 0` (`lib.rs:79`); `fee_token` (`lib.rs:92`) |
| `Key::Treasury` | constructor, `lib.rs:55` | `fee_and_extend` when `fee > 0` (`lib.rs:80`); `treasury` (`lib.rs:88`) |

No persistent map, no temporary entry, no instance TTL bump inside the router except when `target` is the router itself (`fee_and_extend` then extends the router's instance and code along with any other target). The raw XDR of the `#[contracttype]` key is the SDK's encoding of that enum. This page does not invent a symbol name for it.

Instance data shares the contract instance's TTL. The primer's entry-type table says the instance entry is archived and restorable, and that instance data shares that TTL ([`docs/SOROBAN-PRIMER.md`](SOROBAN-PRIMER.md), "When TTL expires"). The Stellar guide says the same thing in different words: the instance and the Wasm are two persistent ledger entries, and an expired TTL makes the data archived and inaccessible ([Extending a deployed contract's TTL](https://developers.stellar.org/docs/build/guides/conventions/extending-wasm-ttl)). If the router's instance archives, `treasury()` and `fee_token()` archive with it.

The router does not extend its own instance on a call whose `target` is someone else. Nothing in `lib.rs` schedules that extension.

### Auth (`require_auth`) per function

| Function | `require_auth` |
|---|---|
| `__constructor` | none (`lib.rs:45-57`) |
| `fee_and_extend` | `payer` only (`lib.rs:70`). `target` is not asked. `treasury` is not asked |
| `treasury`, `fee_token` | none |

Stellar's authorization page is the semantics for `require_auth`: it demands that the address has authorized the current function in the current call stack, and a later `require_auth` in a contract this one calls is covered by the same signed invocation tree when the caller also called `require_auth` for that address ([Authorization](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization), sections "`Address`" and "Authorizing Sub-contract Calls"). The same page says that adding `require_auth` in the caller is what stops the inner authorization from being reused outside this contract.

That is the load-bearing reason for line 70. The token's own `transfer` also authorizes `from` when `fee_token` is the Stellar Asset Contract (see Token movement). The router's call is what puts `fee_and_extend`'s arguments — `fee`, `target`, `threshold`, `extend_to` — in the signed tree together with the transfer. A signature that authorized only the token transfer would not bind those arguments.

`extend_ttl` is permissionless in this codebase's sense: the router does not ask the target's deployer to sign, and the SDK method takes no authorizer (`soroban-sdk` 27.0.6 `Deployer::extend_ttl`). The primer's measured proof is for `ExtendFootprintTTLOp`, which is a different operation ([`docs/SOROBAN-PRIMER.md`](SOROBAN-PRIMER.md), "TTL extension is permissionless"). Do not cite that measurement as a proof of the host function. The unit tests do show the router extending a `Subject` it did not deploy as an admin (`router/contract/src/test.rs:31-32`, `:64-68`) against the test host. This session submitted no transaction.

The constructor is not an ordinary call. Stellar's cross-contract page: a contract's `__constructor` is invoked by the host at deployment, and its arguments are passed to the deploy, which deploys and runs the constructor in the same invocation ([Cross-contract](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/cross-contract)). The deployment guide says the host runs the constructor as part of deployment, so there is no separate initialization call to front-run ([Deploying smart contracts](https://developers.stellar.org/docs/learn/migrate/evm/smart-contract-deployment)). The person who submits the deploy transaction chooses `fee_token` and `treasury`. After that, no function in `lib.rs` can change them.

A search of `soroban-env-host` 27.0.1 for `__constructor` finds the name used when the host creates the contract (`src/host/lifecycle.rs:17`) and does not find a separate "reject a later call" guard in those hits. The test `the_constructor_cannot_be_called_again` shows a later `try_invoke_contract` of `__constructor` returns an error and leaves `treasury()` unchanged (`router/contract/src/test.rs:220-231`). Which host error that is, is **undetermined** here: the test asserts `is_err()` only.

### Admin and upgrade

There is no admin address, no owner key, no `require_auth` on a stored admin, and no call to `Deployer::update_current_contract_wasm`. The SDK method exists and replaces the current contract's executable only after the invocation finishes (`soroban-sdk` 27.0.6 `Deployer::update_current_contract_wasm`). This contract never calls it.

There is no withdraw. The constructor refuses to set `treasury` to the router itself so a fee cannot be paid into a contract that has no way to pay it out (`lib.rs:35-36`, `:50-52`). A new treasury is a new deployment (`router/README.md`). The previous contract id keeps paying the previous treasury for as long as callers use it. The contract has no successor pointer.

### Fee logic

The contract does not compute a fee. It does not round. It does not apply a percentage or a minimum. The only arithmetic-shaped operations on `fee` are `fee < 0` and `fee > 0` (`lib.rs:71`, `:77`).

| `fee` | Result |
|---|---|
| `< 0` | `NegativeFee`. No transfer, no extend (`lib.rs:71-73`) |
| `0` | No transfer. Extend still runs (ADR-009 §3, `lib.rs:77`) |
| `> 0` | Transfer of that exact `i128`, then extend |

The amount a dashboard or CLI proposes is `routerFeeStroops` in `packages/core/src/fee.ts:90-95`: 2% of the rent it is given, no minimum, rounding up by ceiling division (`fee.ts:79-80`), provisional until `PH2-E5-02`. ADR-009 §3 says the chain accepts any non-negative fee, including 0, and that clients are what send the agreed amount. An auditor who checks only the Wasm will not find 200 basis points or 25,000 stroops. The 25,000-stroop minimum is the hosted (allowance) fee, not this path (`fee.ts:29-32` against `fee.ts:49-52`).

Release profile sets `overflow-checks = true` (`router/Cargo.toml:13`). There is no addition or multiplication in `lib.rs` for that flag to catch. `i128` overflow of a fee calculation is a property of the client, not of this contract.

### Token and XLM movement

One token path. No other.

When `fee > 0`, `TokenClient::transfer` (`lib.rs:81`) calls the SEP-41 `transfer` on whatever address was stored as `fee_token` ([SEP-41](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md), and the interface comment in `soroban-sdk` 27.0.6 `src/token.rs`, `TokenInterface::transfer`). The contract comment says the units are the token's base units, and stroops when the token is native XLM (`lib.rs:59-60`). The contract does not check that the stored address is the native SAC.

For the built-in SAC, `soroban-env-host` 27.0.1 `src/builtin_contracts/stellar_asset_contract/contract.rs:206-226` does, in order: reject a negative amount (`check_nonnegative_amount`, `:32-42`), `from.require_auth()`, extend the SAC's own instance and code TTL, move balances, emit an event. The router's `NegativeFee` return happens before this call, so a negative fee never reaches the SAC.

The router is never the transfer's `to`. Tests assert its balance stays 0. There is no `approve`, no `transfer_from`, no `burn`, no `mint`.

Rent for the TTL extension is not a token transfer in this contract. The contract comment says the transaction's source account pays it (`lib.rs:15-16`). That matches AGENTS.md hard rule 5 and `router/README.md`. The resource fee is a property of the transaction, not of `fee`. This session did not measure a resource fee.

If `transfer` or `extend_ttl` fails, the invocation's ledger writes are discarded. Stellar's contract-lifecycle page: a successful execution writes ledger entries atomically; a trap discards them ([Contract lifecycle](https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-lifecycle)). The errors guide: a returned contract error rolls the function's changes back ([Errors](https://developers.stellar.org/docs/build/smart-contracts/example-contracts/errors)). The tests that cover this are listed in §3. The order in the source is transfer, then extend. A failed extend therefore rolls the transfer back with it, and a failed transfer never reaches the extend.

### TTL semantics of `Deployer::extend_ttl`

This is not `ExtendFootprintTTLOp`. The primer's warnings about that operation — `extendTo` as an absolute remaining TTL, core rejecting `extendTo > max_entry_ttl - 1`, simulation pricing an over-max request — apply to the transaction operation the engine uses. The router calls the host function. The primer does not document that function. The gap is logged in [`docs/W1-REVIEW.md`](W1-REVIEW.md).

`soroban-sdk` 27.0.6 `Deployer::extend_ttl` documents: extend instance and code only if the TTL is below `threshold`; the TTL then becomes `extend_to`; the check is done for code and instance separately, so one can move and the other can stay ([docs.rs](https://docs.rs/soroban-sdk/27.0.6/soroban_sdk/deploy/struct.Deployer.html#method.extend_ttl)). The Stellar guide uses the same two parameters and says that if the current TTL is already greater, the call is a no-op ([Extending a deployed contract's TTL](https://developers.stellar.org/docs/build/guides/conventions/extending-wasm-ttl)). The guide's threshold sentence is written in the singular ("the contract instance"). The SDK comment is explicit that instance and code are checked separately. The host implementation matches the SDK comment, not a single combined check.

Locked host, `soroban-env-host` 27.0.1:

- `Host::extend_contract_instance_and_code_ttl` extends the instance key, then the code key, with the same `threshold` and `extend_to` (`src/host.rs:2367-2382`).
- `Storage::extend_ttl` rejects `threshold > extend_to` with `Storage` / `InvalidInput` (`src/storage.rs:542-548`).
- It extends when `current_ttl <= threshold` (`src/storage.rs:570-572`). The SDK comment and the Stellar guide say "below" / "less than", which is `<`. The locked host uses `<=`. When current TTL equals `threshold`, the published comment says no extension and the locked host extends. This page reports both. The contract does not document which one it relies on.
- `current_ttl` is `old_live_until - ledger_seq`, saturating (`src/storage.rs:491`). An entry with `old_live_until < ledger_seq` errors as "accessing no-longer-live entry" (`src/storage.rs:458-464`). A missing, deleted, or out-of-footprint entry errors (`src/storage.rs:445-446`).
- For a persistent entry, `new_live_until = min(sequence + extend_to, max_live_until)` (`src/storage.rs:553-568`). `max_live_until` is `sequence + max_entry_ttl - 1` (`src/ledger_info.rs:25-29`). Code is persistent (`src/ledger_info.rs:36`). The instance entry is persistent contract data (the Stellar guide, cited above). An `extend_to` past the network maximum is **clamped** for these entries, not rejected. Temporary entries error instead; this call does not extend temporary data.
- The write happens only when `new_live_until > old_live_until` (`src/storage.rs:508`). A threshold check that passes can still change nothing if the clamp, or a small `extend_to`, does not move `live_until` forward.

The fee transfer at `lib.rs:77-82` does not look at any of this. A caller can pay a positive `fee` and then have the host no-op or clamp the extension. The arguments are in the signed tree, so the payer signed that pair of numbers. Whether a client must refuse that pair before signing is an open decision in §4.

The Wasm code entry is shared by every contract instance built from that Wasm (the Stellar guide's opening paragraph; the primer, "The code entry is shared"). Extending `target`'s code extends that shared entry. Persistent data of `target` is untouched. ADR-009 forbids calling the result "fully safe".

The tests' `Env::default()` uses `default_ledger_info()`, whose `max_entry_ttl` is `6_312_000` (`soroban-sdk` 27.0.6 `src/testutils.rs:278-288`, used from `src/env.rs:788`). `set_sequence_number` writes only the sequence (`src/ledger.rs:126-129`). Every `extend_to` in `test.rs` is `150_000` or `200_000`, under that test-host cap. The cap in the test host is not a network measurement. The primer records `max_entry_ttl = 3110400` from a Testnet config read on 2026-09-05. This session did not re-read the network. The contract hardcodes neither number.

Whether protocol 23 auto-restore (primer, CAP-0066) runs for an archived instance and code entry *before* this host function, inside one `InvokeHostFunction`, was not simulated here. The host function itself errors on a no-longer-live entry, as cited above. The primer's sentence "an extend is not an invocation" is about `ExtendFootprintTTLOp`. It does not by itself answer the composition of auto-restore with `Deployer::extend_ttl`. That composition is **undetermined** in this page.

### Events

`lib.rs` does not call `env.events()`, and it has no `#[contractevent]`. The router publishes no event for the fee, the target, the threshold, or the extend.

When `fee > 0` and `fee_token` is the SAC, the SAC publishes a `transfer` event. `soroban-env-host` 27.0.1 `src/builtin_contracts/stellar_asset_contract/event.rs:94-113` builds topics `transfer`, `from`, `to`, and the asset name, and publishes them with `contract_event`. The data is the amount, or a map when a muxed id is present (`event.rs:72-91`). The target contract, `threshold`, and `extend_to` are not fields of that event. SEP-41's interface comment on `transfer` describes the same topic shape (`soroban-sdk` 27.0.6 `src/token.rs`, `TokenInterface::transfer`).

When `fee == 0`, that SAC event is not emitted, because `transfer` is not called.

`extend_contract_instance_and_code_ttl` (`host.rs:2367-2382`) and `Storage::extend_ttl` (`storage.rs:532-573`) contain no `contract_event` call. Whether stellar-core writes a transaction-level diagnostic outside the contract event stream is **undetermined** here. An indexer that reads only contract events cannot pair "this fee" with "this extend" from a router event. The pairing is the invocation's arguments plus, when a transfer happened, the SAC event. The first Testnet `fee_and_extend` in `docs/EVIDENCE.md` was correlated that way (SAC transfer event plus RPC reads of `liveUntilLedgerSeq`). This session did not repeat that read.

### Existing Testnet deployment (record, not a recommendation)

`docs/EVIDENCE.md` records a Testnet deploy on 2026-10-23, built from `main` at `658fe14`, merged router commit `b73d358`:

| Item | Value in `docs/EVIDENCE.md` |
|---|---|
| Contract id | `CAADZRZBFZ4BQQYWID6LTPRVQCWR4R7L4EGJ6CBXEBPF2BJGGRUU6YM3` |
| Wasm sha256 | `e1aa4bd67559ed4324daa9a628662eeefeab8d6490e4d36e3d7ced8e5eb3b3d1` (7,763 bytes) |
| `fee_token` | Testnet native SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| `treasury` | `GD7LISFDUOWIVEW3FX452FIGARVRACPTHXVJ42XOBHMJMOQAPIRRMMRZ` (the Testnet treasury named on `PH2-E4-03` / #299) |

`git diff b73d358 HEAD -- router/contract/src/lib.rs` is empty on the branch that added this page, and `git diff 658fe14 HEAD -- router/contract/src/lib.rs` is empty. The production source matches the source that was deployed. Tests and `.github/workflows/router-rust.yml` changed after `b73d358` (`75202d2`). Those changes do not alter the Wasm. Whether a rebuild on this machine hashes to the recorded digest is in §5. This session did not call Testnet, and it does not say the contract is still live. Testnet resets. A hash in `EVIDENCE.md` survives a reset; an explorer link may not.

Mainnet router: **undetermined**. Mainnet treasury: **undetermined** (`PH2-E4-03`). No mainnet deploy is in scope before the written audit (`PH2-E5-02`).

## 2. Threat model and auditor checklist

**Assets.** The payer's `fee_token` balance. The target's instance TTL and its shared code TTL. The router's two instance keys (which treasury, which token). The transaction source's XLM, which pays rent and the inclusion fee.

**Actors.** The deployer, who chooses both addresses once. The payer, who signs `fee_and_extend`. Anyone else, who can attempt the call and who can extend TTL without this contract at all. The fee-token contract, which runs with the privileges of whatever address was stored. No ongoing admin.

**Trust.** After deploy, the Wasm trusts the stored `fee_token` completely and the stored `treasury` as the only destination. It does not trust the payer (it requires their auth) and it does not trust the target (it never calls the target's contract code; it asks the host to extend two ledger entries).

**What this contract is not.** It is not an allowance. It does not hold a balance by design. It cannot extend the target's persistent or temporary data. It cannot rotate its treasury. It does not enforce the 2% client fee.

### Checklist

Work top to bottom. "Fail" means the auditor should treat a "no" as a finding.

| # | Check | Where to look | A miss looks like |
|---|---|---|---|
| 1 | Auth bypass on `fee_and_extend` | `lib.rs:70`. Stellar authorization page, "Authorizing Sub-contract Calls" | Removing line 70 leaves the SAC's `from.require_auth` on the paid path, but the signed tree no longer has to be rooted at `fee_and_extend`. The extend arguments drop out of the signature. On `fee == 0` there is no token call, so line 70 is the only auth |
| 2 | A second signer cannot spend `payer` | `test.rs:101-120` is necessary and not sufficient. See §3 | An auth tree whose root is the attacker and whose subcall transfers the payer's tokens |
| 3 | Re-init | Constructor only at deploy (cross-contract page). `test.rs:220-231` | Any new function that writes `Key::Treasury` or `Key::FeeToken` |
| 4 | Admin key | No admin is stored. `lib.rs` has one `require_auth`, on `payer` | A new `require_auth` on a stored address, or a withdraw |
| 5 | Treasury is not the router | `lib.rs:50-52`, error 3 | A deploy that traps for a different reason and is mistaken for this guard. The test does not check the error variant (§3) |
| 6 | No upgrade | `update_current_contract_wasm` is not called | A new function that passes a wasm hash to that SDK method |
| 7 | Integer range of `fee` | `lib.rs:71-73`, `:77`. No add, no mul | A fee computed on-chain with a float, or a negative that reaches `transfer` |
| 8 | Rounding | None in the contract. Client rounding is `fee.ts:79-80`, ceiling, off-chain | Expecting the Wasm to reject a fee that is not 2% of rent. It will not |
| 9 | Call order | `lib.rs:77-83`. Lifecycle page: trap discards writes | Transfer after a successful extend, so a failed transfer could leave an extension in place. Today the extend is last |
| 10 | Reentrancy through `fee_token` | `lib.rs:81`. Only if the stored token is not the SAC, or the SAC's transfer is replaced by a different implementation | A token that calls back into `fee_and_extend`. The reentrant `require_auth` needs its own node in the signed tree (authorization page, matching of invocation trees). **Not tested** |
| 11 | No-op and clamp still charge | Host `storage.rs:570-572` and `:553-568`. Fee is taken at `lib.rs:77-82` with no TTL read | A positive fee, then `current_ttl > threshold`, or `extend_to` past `max_entry_ttl`, and the payer's tokens have moved while TTL moved less than `extend_to` or not at all |
| 12 | Instance and code are independent | SDK `extend_ttl` comment; host `host.rs:2376-2381` | A test suite that only reads instance TTL and calls the code extended. That is the current suite (§3) |
| 13 | Persistent and temporary data stay | `test.rs:172-190` for the two keys the stand-in writes (`test-subject/src/lib.rs:11-16`) | A host or SDK upgrade that starts extending contract data from `Deployer::extend_ttl`. Re-read the SDK comment on every SDK bump |
| 14 | Shared code entry | Stellar TTL guide, first paragraph. Primer, shared code entry | Treating a code extension as private to `target`. Every instance of that Wasm moves with it |
| 15 | Archived target | Host errors if `old_live_until < ledger_seq` (`storage.rs:458-464`). Auto-restore composition is **undetermined** (above) | Assuming `ExtendFootprintTTLOp`'s "restore first" rule is the whole story for this host function, or assuming CAP-0066 always restores the target inside this call. Neither is established here |
| 16 | Router's own TTL | No self-extend unless `target` is the router (`test.rs:293-299` covers the self-target config, not the other-target TTL) | The router archives, and with it the treasury and fee-token keys. The next caller pays restore if the protocol restores archived instance data on the invocation (primer, CAP-0066). Exact rent: **undetermined** (not simulated) |
| 17 | Upgrade safety of a redeploy | No successor pointer in storage | Clients keep calling the old id after a new router is deployed to change treasury. The old id still transfers to the old treasury |
| 18 | Events | No router event. SAC event is `event.rs:94-113` and does not name `target` | An audit report that says the fee and the extend are one on-chain event. They are one invocation. The event, when it exists, is only the transfer |
| 19 | Denial of service | Two instance keys, written once. No loop. `extend_to` is clamped for persistent entries rather than unbounded (`storage.rs:566-568`) | Storage-growth DoS does not have a write to hang on. A griefing path that does exist: anyone may submit `fee_and_extend` for any `target` (extend is permissionless), and a UI can ask a payer to sign a fee together with a no-op threshold. There is no on-chain rate limit |
| 20 | Address literal | CI step "No address literal in router source" in `.github/workflows/router-rust.yml` greps `contract/src/lib.rs` only | An address added in another file under `router/` that is then `include`d. Today `lib.rs` has no `include` of an address |
| 21 | `fee_token` is the native SAC | Not checked in the constructor | A deploy whose `fee_token` is a contract that returns success from `transfer` without moving the tokens the UI displayed. The extend still runs |
| 22 | Dry-run and network | This contract has no submit path. A client that builds the invocation must keep dry-run as the default (AGENTS.md hard rule 6). Testnet only until `PH2-E5-02` | A mainnet deploy of this Wasm before the written audit |

### Notes an auditor can close without a code change

- **Overflow of `fee` inside the contract.** There is no fee formula. `i128::MAX` is rejected by the token for lack of balance in the test (`test.rs:253-263`), not by an overflow check in `lib.rs`.
- **The router holding funds.** Destination is the stored treasury. The self-treasury case is rejected at deploy.
- **Custodial control of the target.** The router never calls the target. It cannot move the target's tokens. The signature authorizes a payment and a permissionless TTL extension.

## 3. Test gap list

Command that runs these tests, from `router/README.md` and from `.github/workflows/router-rust.yml`: `cargo test --locked` with working directory `router/`, or `cargo test --manifest-path router/Cargo.toml`. No network. §5 records a run.

Nineteen tests, all in `router/contract/src/test.rs`. `test-subject` has zero tests. Priorities are for an auditor's time and for any later test-only PR. This page adds none of the missing tests.

"Mutation-proof" here means: a test that fails if the guard line is deleted, because it asserts the guard's own result, not a panic that some other layer would still raise. This session did not delete any line and re-run. The column is a reading of the assertion, not a measured mutation.

| Guard or behaviour | Test | Lines | Priority of the gap | Mutation reading |
|---|---|---|---|---|
| Constructor stores both keys | `constructor_stores_treasury_and_token` | `57-61` | — | Deleting either `set` fails the matching `assert_eq` |
| `TreasuryIsRouter` | `refuses_the_router_itself_as_treasury` | `204-215` | Medium | Deleting the guard makes `register_at` return, so `catch_unwind` is `Ok` and `is_err()` fails. The test does **not** require `RouterError::TreasuryIsRouter`. A different panic still passes |
| Constructor not callable later | `the_constructor_cannot_be_called_again` | `220-231` | Low | Asserts `is_err()` and an unchanged treasury. It does not name the host error. It would not see a new `reset` function that is not named `__constructor` |
| `payer.require_auth` on a paid call, root function name | `needs_exactly_the_payers_authorisation_for_this_call` | `75-89` | High (incomplete) | Asserts one auth, address `payer`, contract the router, function `fee_and_extend`. The argument vector is `_`. Sub-invocations are not read. If line 70 were removed, the SAC's `require_auth` would be the root and the function name should stop being `fee_and_extend`, so this assertion is the one most likely to fail. **Not mutation-run.** It does not prove the transfer amount and destination sit inside that tree |
| `payer.require_auth` absent | `refuses_without_payer_auth` | `92-98` | High | `#[should_panic]` with `fee = 10`. The SAC also rejects a transfer with no auth (`contract.rs:215`). Deleting line 70 can leave this test green. Not mutation-proof |
| Another address's mock auth | `another_signer_cannot_spend_the_payers_balance` | `101-120` | High | Same limit. The mock tree has empty `sub_invokes` and names the victim as `payer`. The SAC's `from.require_auth` fails that shape even if line 70 is gone. Balance is checked, which is the right damage assertion, and it does not isolate line 70 |
| `require_auth` when `fee == 0` | **missing** | — | **High** | `zero_fee_extends_without_a_transfer` (`145-157`) runs under `mock_all_auths` from `setup` (`28`). No test calls `fee_and_extend` with `fee = 0` and an empty auth set. On this path the token is not called, so line 70 is the only guard. Deleting it keeps every paid-path panic test explainable by the SAC |
| `NegativeFee` | `refuses_a_negative_fee_and_moves_nothing` | `123-132` | — | Asserts `Err(Ok(RouterError::NegativeFee))`, unchanged balance, unchanged instance TTL. Deleting the guard fails the error assert (the SAC's negative-amount error is not `RouterError::NegativeFee`, and a reverse transfer would move the balance) |
| `ThresholdAboveExtendTo` | `refuses_threshold_above_extend_to` | `135-142` | Low | Asserts the contract error and an unchanged balance. Does not assert TTL. Deleting the guard makes the host return `Storage`/`InvalidInput` (`storage.rs:542-548`), which is `Err(Err(...))` in the `try_` shape the errors guide describes, so the `assert_eq` fails. The specific error is mutation-proof on a reading. TTL is implied by the early return |
| `threshold == extend_to` accepted | `threshold_equal_to_extend_to_is_accepted` | `234-240` | — | Instance TTL and a 1-unit fee. Does not read code TTL |
| Paid path: balances and instance TTL | `takes_fee_to_treasury_and_extends_instance_and_code` | `64-72` | **High** | The name says "and code". The body asserts `instance_ttl() == 200_000` (`68`) and the three balances. **Code TTL is never read in this file.** Replacing `extend_ttl` with `extend_ttl_for_contract_instance` would keep this test, and every other TTL assert in the file, green |
| Code TTL moved | **missing** | — | **High** | `Deployer::get_contract_code_ttl` is available in tests (`soroban-sdk` 27.0.6, `testutils`). No test calls it |
| Instance and code with different current TTLs | **missing** | — | **High** | The SDK comment says one can move and the other stay. No test builds that state |
| `current_ttl == threshold` (`<=` versus "below") | **missing** | — | **High** | The locked host extends on `<=` (`storage.rs:570`). The SDK comment says below. No test sets the current TTL equal to `threshold` and reads the result |
| Positive fee when the extend is a no-op | **missing** | — | **High** | No test raises the current TTL above `threshold`, pays a fee, and asserts the fee moved while TTL did not. That is the ordering in `lib.rs:77-83` |
| `extend_to` above `max_entry_ttl` (clamp) | **missing** | — | Medium | Test host cap is `6_312_000` and no test crosses it. No test asserts the post-clamp TTL or that the fee was still taken |
| `fee == 0` skips the transfer and still extends instance | `zero_fee_extends_without_a_transfer` | `145-157` | Medium (code TTL) | Balances and instance TTL. Same code-TTL hole. Auth hole is the row above |
| Unaffordable fee rolls back the extend | `an_unaffordable_fee_fails_the_whole_call_and_extends_nothing` | `160-169` | Low | `is_err()` only, plus TTL and balance. Does not name the SAC error. The damage assertions fail if the extend ran anyway |
| `i128::MAX` fee | `an_i128_max_fee_fails_and_moves_nothing` | `253-263` | Low | Same shape. Does not prove an overflow path, because the contract has none. Proves the balance and the instance TTL stay |
| Whole balance | `the_payers_whole_balance_can_be_the_fee_and_nothing_more_moves` | `243-250` | — | Payer 0, treasury 1000, router 0 |
| Failed extend rolls back the fee | `a_target_that_is_not_a_contract_fails_and_moves_nothing` | `266-279` | Medium | A non-contract address. Does not cover a no-longer-live contract, which is the archival case (`storage.rs:458-464`) |
| Archived or expired target | **missing** | — | Medium | — |
| Persistent and temporary keys unchanged | `never_extends_the_targets_persistent_or_temporary_data` | `172-190` | — | The two keys from `test-subject` `seed` (`symbol_short!("data")`, `symbol_short!("tmp")`). Does not read code TTL, so it does not also prove the code entry moved |
| Destination is the stored treasury | `the_caller_cannot_redirect_the_fee` | `193-201` | Low | A third address stays 0 and the treasury gains 10. There is no destination argument to fuzz. A test cannot pass a different treasury without a different deploy |
| Repeated fees do not stick in the router | `repeated_calls_charge_each_time_and_never_accumulate_in_the_router` | `282-290` | — | Three calls, treasury 15, router 0. Does not re-read TTL |
| Self-target does not rewrite config | `the_router_can_extend_its_own_instance_without_changing_its_config` | `293-299` | Medium | `fee = 0`. Asserts the two addresses. Does not assert the router's TTL, and no test asserts that a call aimed at `Subject` leaves the router's TTL alone |
| Router TTL unchanged when `target` is someone else | **missing** | — | Medium | The operational DoS in checklist row 16 |
| Non-SAC `fee_token`, or reentrancy | **missing** | — | Medium | Checklist rows 10 and 21 |
| `payer == treasury` | **missing** | — | Low | Self-transfer of the SAC. **Undetermined** here whether the SAC treats it as a no-op that still emits an event. The router will call `transfer` |
| `fee_token == treasury`, or `fee_token` is the router | **missing** | — | Low | Constructor does not reject these |
| `threshold == 0` and `extend_to == 0` | **missing** | — | Low | Host allows `threshold <= extend_to`, including zeros (`storage.rs:542`). A fresh instance's TTL is above 0, so this would be a no-op that still charges a positive fee. Not tested |
| Router emits no event | **missing** | — | Medium | Nothing fails if a later edit adds an event, and nothing fails today because the pairing is absent. An auditor who wants the pairing on-chain needs a code change, which is Fatih's decision (§4), not a silent add |
| No upgrade export is reachable | **missing** | — | Low | Absence in `lib.rs` is the current control. A CI grep could lock it. The address-literal grep does not |

## 4. Open decisions for Fatih

These need a call. This page does not recommend an address, a fee number, or a code change.

1. **The final treasury address stays open.** It is the constructor argument `treasury`. It is not in the source. `PH2-E4-03` has not produced the mainnet address (the mainnet key is generated offline before `PH2-E5-02`, on that card). The Testnet deploy recorded in `docs/EVIDENCE.md` already passed one Testnet address. That fact is not a choice, and this page does not say to keep it, replace it, or reuse it. Do not treat any address written here as a proposal. There is nothing to implement until `PH2-E4-03` names the address at deploy time.

2. **Whether to change the Wasm before the audit engagement.** The high gaps in §3 are missing tests, plus one design fact: a positive fee is transferred even when the host then no-ops or clamps the extension. Adding tests does not change the Wasm. Changing the order, skipping the fee on a no-op, or emitting an event does. An audit of the bytes now will not cover a later change. The decision is whether the audited bytes are the current `lib.rs` or a later revision. This page does not edit the contract.

3. **Events.** There is no router event. The SAC `transfer` event does not name `target`, `threshold`, or `extend_to`. If the written audit should cover an event that pairs them, that is a code change and it has to land before the audit. If the invocation arguments plus the SAC event are enough, say so and the auditor can treat checklist row 18 as accepted.

4. **Who extends the router's own instance and code, and who pays.** The hot path does not. An archived router takes the treasury and fee-token keys with it. Options that do not belong in this page's code: a separate, deliberate `fee_and_extend` aimed at the router (the self-target test shows the config survives that), or accepting restore-on-next-call under CAP-0066. The rent of that restore was not simulated.

5. **`fee_token` is unconstrained.** The Testnet deploy used the native SAC. The constructor will accept any address. Confirm that "native SAC only" is a deploy-time rule the deployer must follow, with no on-chain check, or say that a check is required before the audit. A check would be a code change.

6. **Clients and the old contract id.** A new deployment is the only way to change treasury. The old id keeps working. Who publishes the current id, and what `PH2-E3-04` does when two ids exist, is not in this contract. It needs an owner before mainnet.

Already decided, and not reopened here: instance and code only (ADR-009 §1); fee straight to treasury rather than the engine (ADR-009 §2); on-chain fee is voluntary, including zero (ADR-009 §3); the client proposal is 2% with no minimum, provisional (`PH2-E5-03`, `fee.ts`); Evergreen does not pay the rent (hard rule 5).

## 5. Commands

From the repo, not invented.

`router/README.md`:

```bash
cargo test --manifest-path router/Cargo.toml                                   # no network
cargo build --manifest-path router/Cargo.toml --release --target wasm32v1-none # wasm, CI caps it at 64 KiB
```

`.github/workflows/router-rust.yml`, working directory `router/`: `cargo fmt --all --check`, `cargo clippy --locked --all-targets -- -D warnings`, `cargo test --locked`, `cargo build --locked --release --target wasm32v1-none`, then a 65,536-byte cap on every `target/wasm32v1-none/release/*.wasm`. The workflow runs on a pull request only when `router/**` or that workflow file changes. A docs-only pull request does not run it.

The JS gate this repo requires before a task is called done is `pnpm build && node apps/web/build.mjs && pnpm check` (AGENTS.md hard rule 10), on Node 24 (`.nvmrc` is `24`, `package.json` `engines.node` is `>=24 <25`).

### This session

Toolchain: `rustc 1.98.1 (48a229cea 2026-09-01)`, which is `router/rust-toolchain.toml`'s channel. `wasm32v1-none` was installed. No network call was made. Working tree was `origin/main` plus this documentation.

Node on the default `PATH` was v22.23.4. The commands below used Node v24.22.3 (`nvm install 24`), which satisfies `.nvmrc`.

**Router tests.** `cargo test --locked --manifest-path router/Cargo.toml` — exit 0.

```
Finished `test` profile [unoptimized + debuginfo] target(s) in 39.63s
Running unittests src/lib.rs (evergreen_router)
running 19 tests
test result: ok. 19 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.03s
Running unittests src/lib.rs (evergreen_router_test_subject)
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

**fmt, clippy, release Wasm.** One chain, working directory `router/`: `cargo fmt --all --check && cargo clippy --locked --all-targets -- -D warnings && cargo build --locked --release --target wasm32v1-none`. Exit 0. fmt printed no diff. Clippy finished the dev profile in 27.59s with `-D warnings` and no warning lines. Release profile finished in 22.76s.

```
target/wasm32v1-none/release/evergreen_router.wasm 7763
target/wasm32v1-none/release/evergreen_router_test_subject.wasm 738
sha256 evergreen_router.wasm
7eb56edc1b29ab8dccc658b2ced04ddbea2dfb9082f9f0f64572adfa30592804
sha256 evergreen_router_test_subject.wasm
916c52658fca0aacd2ef405400852f7fbe753589923b1b34683a14dde0bc6525
```

Both files are under the CI cap of 65,536 bytes. `evergreen_router.wasm` is 7,763 bytes, the same size `router/README.md` measured on 2026-10-22 and the same size `docs/EVIDENCE.md` records. The sha256 is **not** the evidence digest `e1aa4bd67559ed4324daa9a628662eeefeab8d6490e4d36e3d7ced8e5eb3b3d1`. `lib.rs`, `router/Cargo.lock`, `router/Cargo.toml`, and `router/rust-toolchain.toml` are unchanged since the deploy commit `b73d358`. The release Wasm contains the absolute path of this machine's registry copy of `soroban-sdk-27.0.6/src/env.rs` (`/usr/local/cargo/registry/src/index.crates.io-1949cf8c6b5b557f/...`) and the SDK revision string `rssdkver` `/27.0.6#60926a20d1f9f0a669d5fe551636f42a1302f0c0`. A different registry path is enough to change the bytes without changing `lib.rs`. Whether the 2026-10-23 builder used this path is **undetermined**. This session did not have the original Wasm to diff. Same source, same size, different digest. Do not read the mismatch as a behaviour change, and do not read the size match as byte identity.

**`pnpm check`.** The first `pnpm build && node apps/web/build.mjs && pnpm check` exited 1. `cargo test` had written `router/contract/test_snapshots/` (SDK default `capture_snapshot_at_drop`). Those files are gitignored (`router/.gitignore`) and are not matched by `.prettierignore`, which excludes `contracts/**/test_snapshots/` and not `router/**`. `pnpm format:check` walks the filesystem and failed on 19 snapshot JSON files. `pnpm test` had not started. The snapshots were deleted and the same command was run again.

Second run, after deleting `router/contract/test_snapshots/`, Node v24.22.3:

`pnpm build && node apps/web/build.mjs && pnpm check` — exit 0.

Vitest, inside `pnpm test`: **Test Files 156 passed (156). Tests 2608 passed (2608).** The later `node:test` scripts in that same chain each reported `fail 0`, with test counts 11, 3, 7, 27, 22, 2, 4, 3, 3, 4, and 55. No test failed. Task-id, backlog, evidence, and format gates in the same command passed.
