# `@evergreen/shared-types`

The types every Evergreen module speaks: `ContractRef`, `LedgerEntryTTL`, `ScanResult`, `RentEstimate`, `BumpDecision`, `BumpRecord`, `NotificationChannel`, `EvergreenConfig`, `Signer`.

**Defined at `W1-D6-01`.** Changing a type here ripples across both developers' work, so changes get a note in `docs/STATUS.md` and don't happen mid-week (CLAUDE.md).

## Three constraints, and one of them is a shape inversion

1. **`Signer` is an interface**, resolved per payer, so Stage 1 (plain funded account) and Stage 2 (policy signer) are drop-in — [ADR-002](../../docs/adr/ADR-002-policy-signer-provider.md).
2. **`BumpRecord.payer` is distinct from the contract**, and `EvergreenConfig` is N contracts × M payers — [ADR-004](../../docs/adr/ADR-004-payment-model.md). v1 implements no multi-tenancy; it must only avoid foreclosing it.
3. **`ScanResult` is keyed by ledger key, not by contract.**

The third is the one that is easy to get wrong, because the instinctive model is contract-centric: a contract, with its entries hanging off it. **That shape structurally cannot represent one ledger entry serving twelve contracts without duplicating it** — and contracts deployed from the same Wasm *do* share a single `ContractCode` entry (see [`SOROBAN-PRIMER.md`](../../docs/SOROBAN-PRIMER.md)).

So: the primary collection is keyed by ledger key, and the contracts an entry serves are a property *of the entry*. Contracts are the input to a scan and a back-reference on the output — not the axis the result is organised around.

**Acceptance check before this package is considered done:**

> Can this shape represent one ledger entry serving N contracts, exactly once?

Get it wrong and the rent model double-counts, severity under-reports blast radius, and the engine bumps one entry N times per run — three bugs, found and fixed separately, late.
