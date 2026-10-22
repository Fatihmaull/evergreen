# Spike PH2-E4-07: one signature for fee + extend through a router contract

**Testnet, 2026-10-22 (Asia/Jakarta). Spike only. `packages/` is untouched.**
Source: [`experiments/router-spike`](../../../experiments/router-spike) (soroban-sdk `=27.0.6`, stellar-cli 28.0.0).

| | |
|---|---|
| Router contract | `CBMWU266HUWZDB4WTUWEKOFRPLN4FSD6QDOQJTR23SYNLG2AVRSQCZLJ` (Wasm `8e17f04e…eefc0`) |
| Subject ("user's contract") | `CDUMY66FEKNQZTZAHYCZKNJYLLNY65DB7KQDA6GX4NDHDPH4PTO3RXAF` (Wasm `fe8bb587…7f7d7`, its own code entry, so guinea-pig A/B/C are never touched) |
| Payer ("user") | `GD7VFOY27AESTLWF2YDZ7RA6QQG3ACWSVNNPCGUVREJ2HSC4P456R5PI` |
| Fee recipient (stand-in for treasury) | `GDXHTAYO6TNCJATLIJ35YDSW5QMU5AN3KNPJ3IJTZW3QHEBEMX32WRGR` |
| Fee token | native XLM SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

Both accounts are throwaway friendbot identities made for this spike. Their secrets live only in the local `stellar` keystore.

## Verdict: **instance + code only**

One `fee_and_extend` invocation, one signature, took the fee **and** extended the subject's instance and code. It did **not** extend the subject's persistent data, and no host function allows it to.

| Question | Answer | Proof |
|---|---|---|
| One invocation takes the fee and extends? | **Yes.** Atomic: the transfer and the extend are in one host function. | tx `3c112235…de24a`: `SUCCESS`, a SAC `transfer` event payer → fee recipient for `1000000` stroops |
| One signature? | **Yes.** 1 envelope signature; the auth entry uses `source_account` credentials, and one tree covers `fee_and_extend` → `transfer`. | `raw/router-fee-and-extend-envelope.decoded.json` |
| Who pays the rent? | **The user** (transaction source). `fee_charged` 60,956,663 stroops came from the payer. Evergreen pays nothing (hard rule 5). | `raw/tx-router-fee-and-extend.json` |
| Instance extended? | **Yes.** live-until 5,443,860 → 6,322,913 | `raw/ttl-after.txt` |
| Code extended? | **Yes.** live-until 5,443,859 → 6,322,913 | `raw/ttl-after.txt` |
| Another contract's persistent data? | **No.** live-until 5,443,867 unchanged. soroban-sdk 27.0.6 has `deployer().extend_ttl`, `extend_ttl_for_contract_instance` and `extend_ttl_for_code` for *another* address, while `storage().persistent().extend_ttl` takes only a key and acts on the *calling* contract's storage. A Soroban transaction holds one operation, so an `ExtendFootprintTTL` cannot ride along either. | `raw/ttl-after.txt`; unit test `does_not_extend_target_persistent_data` |

Not verified: a router that *the target contract itself* calls back into (the target exposes its own `extend_ttl` for its own keys). That works only for contracts their authors built for it, so it is not a general answer. **Undetermined** whether any watched contract offers such a function.

## How much of a rent bill instance + code covers

Measured by **simulating** (not sending) `ExtendFootprintTTL` to live-until = latest + 3,000,000 per entry on the subject (`raw/sim-extend-to-3000000-*.json`). Each entry's `minResourceFee`, minus a 5,853-stroop non-rent baseline (the same op extending by 1 ledger), normalised to the same 2,000,016-ledger extension:

| Entry | Rent (stroops, normalised) | Share |
|---|---|---|
| Code (528-byte Wasm) | 157,727,610 | 98.13% |
| Instance | 1,739,593 | 1.08% |
| Persistent (1 entry) | 1,271,197 | 0.79% |
| **Instance + code** | | **99.21%** |

This matches #296, where the code entry was 99% of the bill. **The caveat:** the subject has one small persistent entry. A contract with many or large persistent entries moves this share down. The share on real user contracts is **undetermined** until we measure watched contracts in the beta.

Guinea-pig A was not used for this. Its entries are already near the TTL ceiling (live-until ~8.3M at ledger 5,322,928), so a simulation there measures nothing.

## Design notes for the real card (not built here)

- The fee amount is a caller argument, computed off-chain from a simulation. The contract cannot know the rent at runtime. The recipient and token are fixed at construction so a caller cannot redirect the fee.
- `extend_ttl` extends to the same `extend_to` for instance and code, and only if each is below `threshold`.
- The fee goes straight to the treasury address. That differs from §3.3's "fees accumulate in the engine account" and needs a decision.

## Transactions

| Step | Hash | Ledger |
|---|---|---|
| Subject Wasm upload | `055c68a8faa9ed2fb3e07b33a1dd7d533cfc82d137c26a87e6fae9a9c692e859` | 5,322,900 |
| Subject deploy | `0de1e3ca5c3feaa2ae1bdec9d54dbf0bb476810a37eac6af61df9a11690a4fce` | 5,322,901 |
| Router Wasm upload | `0ff73efba27f241635eb9e0e41f9b9b54f936388ff13e0eb46688e47bb694ec4` | 5,322,902 |
| Router deploy (constructor: fee token, recipient) | `f4f2a6a59d33b6a5a88f32a1bb4067ac070e2437144d66ac439e9a9a20d19e3b` | 5,322,905 |
| Subject `seed` (writes the persistent entry) | `1cf2ce3780c734c93eab675b6fcc9b1d75415cec0f2025caa696f0f1661cc086` | 5,322,908 |
| **Router `fee_and_extend`** | `3c1122353a0d881667e7ae6c44c024590c8c094113aaf1ab8ad5132b461de24a` | 5,322,913 |

All `SUCCESS`, 2026-10-22 10:01:27–10:02:32 Asia/Jakarta. The full unedited `getTransaction` responses are in `raw/tx-*.json`.
