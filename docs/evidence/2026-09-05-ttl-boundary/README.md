# First TTL boundary observation — W1-D4-13

Status: **inconclusive**, captured 2026-09-05 on Stellar Testnet. This first run stopped before expiry. Its 189 raw observations remain unchanged; the separate [2026-09-06 repeat](../2026-09-06-ttl-boundary/README.md) captured the exact boundary successfully.

## Transactions

| Action | Ledger | Hash | Full RPC response | Explorer screenshot |
|---|---:|---|---|---|
| Deploy isolated boundary instance | 4,519,362 | `34099447d179f0039b811295b7a40b313324a73dbe2ca101825c7214b2b0dc19` | [JSON](boundary-deploy-transaction.json) | [JPEG](boundary-deploy-explorer.jpg) |
| Seed temporary entry | 4,519,384 | `12650a38e3751c4e185dc173c5c0735e11a76b5a889f7ef95704af5692a42b9c` | [JSON](boundary-seed-transaction.json) | [JPEG](boundary-seed-explorer.jpg) |

The contract is `CBVX3LUUEZR4HQEPZI3E6DZJN4KGST6EICMVJ5SXIZMSS3DQRZACMWZX`. It reuses the existing Wasm; no code upload or TTL extension was needed. A separate instance avoided rewriting A's already-extended temporary entry. The temporary entry was created at ledger **4,519,384**, with `liveUntilLedgerSeq = 4,520,103`: 719 remaining ledgers at creation.

## Observations

Each `boundary-ledger-N.json` is an unedited `getLedgerEntries` response for the exact key in [boundary-observation.json](boundary-observation.json). Its own `latestLedger` supplies N. The final sample still contains the entry at ledger **4,519,974**, with 129 ledgers remaining. Neither the final live ledger nor the next ledger was captured, so these files cannot confirm the boundary.

Replay offline from the repository root:

```bash
pnpm test:ttl
node scripts/verify-ttl-boundary.mjs docs/evidence/2026-09-05-ttl-boundary
```

Replay returns `inconclusive` with exit code 2. This is the expected outcome for this historical run. The [preservation manifest](../2026-09-06-ttl-boundary/previous-samples-sha256.json) records SHA-256 hashes for all 189 samples.

## Network minimum versus sampled remaining TTL

The [raw state-archival configuration](state-archival-settings.json), sampled at ledger 4,519,665, reports `min_temporary_ttl = 720`, `min_persistent_ttl = 120960`, and `max_entry_ttl = 3110400`. These are measured network settings, not hardcoded application constants.

The earlier [A fixture](../../../packages/core/test/fixtures/getLedgerEntries-guinea-pig-a.json) was sampled 31 ledgers after its temporary entry was written. Its 688 remaining ledgers were not the initial minimum. See the [primer correction](../../SOROBAN-PRIMER.md#measured-ttl-floors).

## Evidence provenance and protected subjects

RPC JSON and explorer images were copied byte-for-byte from the local capture directory to this technical folder name. `*-intent.json`, `boundary-contract.json`, and `boundary-observation.json` are authored metadata. The `*-send.json` and `*-simulation-*.json` files preserve server responses. Account funding evidence is published separately in setup PR #20.

[Before](baseline-protected-entries.json) and [after](after-protected-entries.json) reads show unchanged TTLs and modification ledgers for A/B/C instances and shared code. B's instance remains **4,793,687**, C's **4,880,097**, and shared code **5,290,829**.
