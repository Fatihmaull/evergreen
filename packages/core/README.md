# `@evergreen/core`

TTL math, rent model, RPC client, storage optimizer, and decision rules.

**The only package that talks to the network.** `core` never imports from `cli`, `engine`, or `dashboard` — the dependency arrow points one way (see [ARCHITECTURE](../../docs/ARCHITECTURE.md)).

Rules that are easy to get wrong:

- **Ledgers are the unit of truth.** Compute in ledgers; convert to dates only at the display edge. Never store a TTL as a date.
- **`liveUntilLedgerSeq` is optional.** Some entry types carry no TTL. Handle its absence explicitly; never `!`-assert it.
- **One round trip, not two.** `getLedgerEntries` returns `latestLedger` alongside the entries, which is what `remainingLedgers` is computed against. Don't call for the latest ledger separately.
- **The ledger key is the unit, not the contract.** Contracts sharing a Wasm share one `ContractCode` entry. Dedupe by ledger key before deciding, sum rent per unique key (or you charge a factory deployment N times for one entry), and weight severity by blast radius — a shared code entry expiring takes every contract with it.
- **Temporary entries expire two orders of magnitude faster than everything else** — ~688 ledgers (~57 min) against ~120,927 (~7 days), measured 2026-09-05. Any code that reasons about "days of headroom" is wrong for temporary entries.

Decision rules are a pure function — `(ScanResult, thresholds) => BumpDecision` — with no I/O, so the engine can be tested without a network.

## Current scan API (`W2-D8-03`)

`scanContract(reader, { id, label? }, dataKeys?)` returns a `ScanResult` for one contract. It reads the instance, derives a Wasm code key from its executable, then reads code and explicit persistent/temporary data keys in batches of at most 200. The supplied keys must be canonical base64 XDR `ContractData` keys belonging to that contract. A non-Wasm executable produces `unsupported-executable`; it never produces an invented code key.

`LedgerEntryReader` carries the serialized entry payload as `entryXdr` in addition to optional TTL. The production adapter preserves SDK `val` as XDR. Payload/key mismatches, duplicates, unrequested rows, invalid TTL and malformed responses are diagnosed. A failing batch does not erase successful batches, and each observation keeps its response's `latestLedger`.

Coverage is always `known-keys`, including the unique validated supplied data-key count. Neither a missing entry nor unavailable TTL proves expiry. This API does not enumerate all storage or merge consumers across contracts; the latter remains `W2-D8-04`. Legacy `scanInstances` is still exported, but the CLI uses `scanContract`.

The [CLI guide](../cli/README.md) describes the input file and exit policy. The [read-only Testnet capture](../../docs/evidence/2026-09-08-scan-entry-types/README.md) complements offline fixtures; no transaction path is added.
