# `@evergreen/core`

TTL math, rent model, RPC client, storage optimizer, and decision rules.

**The only package that talks to the network.** `core` never imports from `cli`, `engine`, or `dashboard` — the dependency arrow points one way (see [ARCHITECTURE](../../docs/ARCHITECTURE.md)).

Two rules that are easy to get wrong:

- **Ledgers are the unit of truth.** Compute in ledgers; convert to dates only at the display edge. Never store a TTL as a date.
- **`liveUntilLedgerSeq` is optional.** Some entry types carry no TTL. Handle its absence explicitly; never `!`-assert it.

Decision rules are a pure function — `(ScanResult, thresholds) => BumpDecision` — with no I/O, so the engine can be tested without a network.
