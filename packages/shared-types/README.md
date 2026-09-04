# `@evergreen/shared-types`

The types every Evergreen module speaks: `ContractRef`, `LedgerEntryTTL`, `ScanResult`, `RentEstimate`, `BumpDecision`, `BumpRecord`, `NotificationChannel`, `EvergreenConfig`, `Signer`.

**Defined at `W1-D6-01`.** Changing a type here ripples across both developers' work, so changes get a note in `docs/STATUS.md` and don't happen mid-week (CLAUDE.md).

Shape constraints from [ADR-004](../../docs/adr/ADR-004-payment-model.md): `BumpRecord.payer` is distinct from the contract, `EvergreenConfig` is N contracts × M payers, and `Signer` is an interface resolved per payer. v1 implements no multi-tenancy — it must only avoid foreclosing it.
