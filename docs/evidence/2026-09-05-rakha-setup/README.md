# Rakha's Testnet setup and TTL boundary experiment

Tasks: `W1-D4-01/02/03/13`. Captured 2026-09-05 on the public Stellar Testnet, protocol 28. This folder contains public account IDs, transaction data, and read-only observations. Secret keys are not part of the evidence.

## Transactions

| Action | Ledger | Hash | Full RPC response | Explorer screenshot |
|---|---:|---|---|---|
| Friendbot funds developer | 4,519,343 | `1af342f683e3a754cca7b3bfc8f41be995fb33fef77ddca48a1bf0ce77e76114` | [JSON](dev-funding-transaction.json) | [JPEG](dev-funding-explorer.jpg) |
| Deploy isolated boundary instance | 4,519,362 | `34099447d179f0039b811295b7a40b313324a73dbe2ca101825c7214b2b0dc19` | [JSON](boundary-deploy-transaction.json) | [JPEG](boundary-deploy-explorer.jpg) |
| Seed temporary entry | 4,519,384 | `12650a38e3751c4e185dc173c5c0735e11a76b5a889f7ef95704af5692a42b9c` | [JSON](boundary-seed-transaction.json) | [JPEG](boundary-seed-explorer.jpg) |
| Fund bot with 20 XLM Testnet | 4,519,434 | `f07dd5cafb40ea3466f6d59955c6e04158d3df2c0a684ed3cd790676e3f5be29` | [JSON](bot-funding-transaction.json) | [JPEG](bot-funding-explorer.jpg) |

The corresponding `*-send.json` and `*-simulation-*.json` files retain the exact server response text. `*-intent.json`, `accounts.json`, `boundary-contract.json`, and `boundary-observation.json` are locally authored metadata, not RPC responses. JPEGs are unedited explorer captures. The developer faucet response is also retained as `dev-friendbot.json`.

## Boundary observation

- Contract: `CBVX3LUUEZR4HQEPZI3E6DZJN4KGST6EICMVJ5SXIZMSS3DQRZACMWZX`.
- Uses the existing guinea-pig Wasm `c7e55f0ad89efb0600bc15048b155099fa4d97cee16466fa1244b3dcbce98bfb`. No Wasm upload or TTL-extension transaction was needed.
- A's temporary entry had already been extended, so rewriting A's fixed key would not create a fresh short-lived entry. A new instance avoids that ambiguity.
- Seed ledger: **4,519,384**. Advertised `liveUntilLedgerSeq`: **4,520,103**. Initial `remainingLedgers`: **719**; an inclusive lifetime of 720 ledgers if the boundary is confirmed.
- Polling uses the exact key from `boundary-observation.json`. Each `boundary-ledger-N.json` is an unedited `getLedgerEntries` response, whose own `latestLedger` is N. No separate latest-ledger call is used to label it.
- Sampling cadence: 15 seconds while far from expiry; 800 milliseconds for the final 24 ledgers, plus request latency. Only the first response at each observed ledger is stored. Polling does not invoke the contract or submit transactions.
- Exact-boundary result: **in progress**. Do not infer a confirmation from a sample far after expiry.

Offline verification, with no network or keys:

```bash
node --test --test-isolation=none scripts/verify-ttl-boundary.test.mjs
node scripts/verify-ttl-boundary.mjs docs/evidence/2026-09-05-rakha-setup
```

Exit 0 means the captured entry is present at L and absent at L+1 with no conflicting observations. Exit 2 means inconclusive or contradicted; the JSON distinguishes them. An RPC error, a changed TTL, or conflicting responses is rejected rather than interpreted as expiry.

## TTL floor correction

The raw [`state-archival-settings.json`](state-archival-settings.json) response at ledger **4,519,665** contains the network configuration: `min_temporary_ttl = 720`, `min_persistent_ttl = 120960`, `max_entry_ttl = 3110400`. These are network settings, not seconds.

The earlier A fixture was sampled at 4,512,641, 31 ledgers after its temporary entry was written at 4,512,610. Its last live ledger is 4,513,329. Thus **688 was the remaining TTL at the sample**, not the initial network minimum. The earlier fixture itself is retained unchanged. The current new entry's 719 remaining ledgers at the creation ledger and the configuration value 720 are consistent with an inclusive boundary; the final adjacent-ledger observation is still required.

## Protecting the long-running decay experiments

`baseline-protected-entries.json` and `after-protected-entries.json` show the same `liveUntilLedgerSeq` and `lastModifiedLedgerSeq` for A/B/C instances and the shared Wasm. B's instance remains **4,793,687**, C's **4,880,097**, shared code **5,290,829**. This setup did not submit operations against B or C, and did not extend the shared code.

## Reproduction provenance

The one-time setup used **`@stellar/stellar-sdk@17.0.1`**, installed under `/tmp/evergreen-w1-tools` with `--ignore-scripts --save-exact`; no product package dependency was changed. [`setup-experiment.mjs.txt`](setup-experiment.mjs.txt) records the script as executed, including this machine's paths. It is an experiment record, not a supported product command. Live modes required an explicit `--live`, checked the official Testnet URL/passphrase, and saved send/confirmation responses without rewriting them.

Read-only replay uses the verifier above. Repeating a live experiment requires a new evidence directory and fresh instance; the captured response files must stay unchanged.
