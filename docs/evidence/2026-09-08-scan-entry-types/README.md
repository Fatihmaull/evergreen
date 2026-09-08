# W2-D8-03 — read-only four-entry scan

Captured **2026-09-08 16:10:54 UTC / 23:10:54 WIB**, using the compiled CLI on `feat/W2-D8-03-scan-entry-types` (implementation following start commit `b28faff`). Public Stellar Testnet only. No transaction was constructed or submitted; B/C were not modified.

## Observed result

Contract A: `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L`.

| Entry | Observed ledger | Final live ledger | Remaining ledgers | On expiry |
|---|---|---|---|---|
| Instance | 4,572,053 | 4,712,648 | 140,595 | Archived |
| Wasm code | 4,572,053 | 5,290,829 | 718,776 | Archived |
| Persistent data | 4,572,053 | 4,712,658 | 140,605 | Archived |
| Temporary data | 4,572,053 | 4,712,659 | 140,606 | Deleted |

The command returned **exit 0**, four observed entry types and no issues. Both entry responses happened to share one ledger; the implementation/tests also cover different ledgers across batches. The capture proves current TTL reading, not a new extension. The temporary entry's current TTL is not a measurement of its creation-time minimum.

Coverage is **known keys only**: instance/code discovery plus two supplied data keys copied from the [unedited Sep 5 fixture](../../../packages/core/test/fixtures/getLedgerEntries-guinea-pig-a.json). This does not enumerate all storage or establish whole-contract health.

## Artifacts

- [CLI JSON](scan.json), [exit code](cli-exit.json), [human rendering](scan-human.txt). The human rendering is generated offline from this exact JSON using the production formatter and final response capture time; it is not a second chain observation.
- Network check: [request](01-getNetwork-request.json), [full response](01-getNetwork-response.json), [timestamp/HTTP status](01-getNetwork-meta.json).
- Instance read: [request](02-getLedgerEntries-request.json), [full response](02-getLedgerEntries-response.json), [timestamp/HTTP status](02-getLedgerEntries-meta.json).
- Data/code read: [request](03-getLedgerEntries-request.json), [full response](03-getLedgerEntries-response.json), [timestamp/HTTP status](03-getLedgerEntries-meta.json).
- [Input keys](data-keys.json), [SHA-256 artifact digests](SHA256SUMS).

Requests and responses were captured at the SDK fetch boundary while running the actual compiled CLI. Responses are byte-for-byte HTTP response bodies, saved before SDK decoding using a cloned response; formatting tools exclude this evidence directory. Only `getNetwork` and `getLedgerEntries` were allowed by the capture wrapper. Each output entry's ledger, final-live ledger and subtraction were independently compared with the raw responses.

## Reproduce the read

From the repository root, after dependency installation:

```bash
pnpm typecheck
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org \
  node packages/cli/dist/bin.js scan \
  CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L \
  --keys-file docs/evidence/2026-09-08-scan-entry-types/data-keys.json --json
```

A later result may differ as ledgers advance, other actors extend entries or Testnet resets. Missing-entry and partial-batch behavior are also covered offline; no expiry is inferred solely from absence. No explorer transaction screenshot applies to this read-only capture.
