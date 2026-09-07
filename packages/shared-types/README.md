# `@evergreen/shared-types`

The public TypeScript contracts for core, CLI, engine and dashboard (`W1-D6-01`, `01b`, `01c`; [Issue #29](https://github.com/Fatihmaull/evergreen/issues/29)). Source: [`src/index.ts`](src/index.ts). The package contains type declarations only: no RPC client, signing implementation, config loader or notification transport.

| Export | Purpose |
|---|---|
| `ContractRef` | Public contract identity and optional label |
| `LedgerEntryTTL` | Entry kind, end behavior, observed ledger, TTL and consumer contracts |
| `ScanResult` | Unique entries keyed by canonical ledger key, input contracts and scan issues |
| `RentEstimate` | Rent per unique key and total, with ledger/target context |
| `BumpDecision` | Extend with an explicit payer, or skip with a reason |
| `BumpRecord` | Simulation, submission, confirmed success or failure, with payer and signer identity |
| `EvergreenConfig` | Testnet network, thresholds, contracts, per-payer signer config and notification config |
| `Signer` | Per-payer signing interface; no submission or secret exposure |
| `NotificationChannel` | Transport-independent consumer of a bump record |

## One entry, multiple contracts

`ScanResult.entries` is a `Readonly<Record<LedgerKey, LedgerEntryTTL>>`. A ledger key is canonical base64 XDR, not a contract ID or an entry label. There is no second embedded key to drift from the map key. Each entry's `contracts` lists the unique input contracts known to use it. It does not claim to enumerate all consumers on the network.

A simplified example (labels below are illustrative, not real addresses/XDR):

```text
contracts: [A, B]
entries:
  shared-code-key:
    kind: code
    contracts: [A, B]
    observedAtLedger: 100
    ttl: { status: known, endsAtLedger: 100, remainingLedgers: 0 }
    endBehavior: archived
```

**Acceptance answer: yes.** This shape represents one ledger entry serving N contracts, exactly once. [`test/examples.ts`](test/examples.ts) constructs the two-consumer example with one entry and one rent amount, and tests its JSON round-trip. The second consumer and rent amount are explicitly synthetic. The same file separately maps all four kinds in the unedited recorded guinea-pig A RPC fixture.

This structure permits correct deduplication; it does not implement or prove the W2 scanner's deduplication algorithm. The scanner must canonicalize keys and validate unique consumer references. Duplicate map assignments could still overwrite data; conflicting responses must be reconciled by the producer.

## TTL and incomplete scans

- `endsAtLedger` is the **final live ledger**, inclusive, matching `W1-D4-13` evidence. `remainingLedgers = endsAtLedger - observedAtLedger`; zero is still live and negative is expired. Neither a date nor an estimated wall-clock expiry is stored.
- Each entry carries its own `observedAtLedger`, taken from that RPC response's `latestLedger`. Do not subtract one batch-wide ledger from entries read at different times.
- `kind: 'temporary'` requires `endBehavior: 'deleted'`. Code, instance and persistent entries require `'archived'`. This describes what happens at expiry, not evidence that it already happened.
- Missing TTL metadata is `{ status: 'unavailable' }`, with no fabricated numbers. Consumers must narrow this union before using TTL arithmetic.
- Absent entries and request/response failures are in `ScanResult.issues`; absence alone does not prove archival, deletion, or even prior existence. Consumers must handle issues and unavailable TTL before reporting health or deciding to extend.
- A TTL-only scan omits `rentEstimate`. Omission does not mean zero rent.

## Rent, payer and signer

Money is integer stroops represented as decimal strings for lossless JSON; calculate with `BigInt` in consumers and serialize back to text. `Stroops` rejects numeric and fractional literals, but non-negative canonical decimal syntax still requires input validation. Costs are keyed by unique entry, never summed per contract. Estimate totals and arithmetic consistency remain producer responsibilities. See [ADR-005](../../docs/adr/ADR-005-shared-domain-types.md).

`EvergreenConfig.contracts[].payer` refers to a key in `payers`. Three contracts can refer to two payers; the process has no global signer. Config stores environment variable names or an opaque policy-adapter reference, never keys. The policy reference deliberately does not invent the Week 3 provider's configuration schema.

If a shared entry has multiple payer candidates, the types preserve those relationships through its contracts and config. An `extend` decision requires an explicitly resolved payer. A `skip` decision can explain unresolved payment. No payer-selection, fee splitting or hosted billing policy is implemented here.

`Signer.signExtendTTL` accepts a prepared transaction envelope and returns a signed envelope, without submitting it. The adapter must verify the Testnet network, payer, permitted operations and fee policy. The method name and types cannot enforce those checks. Both in-memory test implementations satisfy the interface; **this is not evidence that the real policy-signer SDK works**. Real adapters and the Stage 2 spike remain Week 3 tasks (ADR-002/004).

## Bump outcomes

| Outcome | Meaning | Required evidence in the record |
|---|---|---|
| `simulated` | Dry-run completed | Before observation; no live hash or after state |
| `submitted` | Submitted/awaiting confirmation or post-bump observation | Hash; no verified after state yet |
| `succeeded` | Transaction confirmed and TTL verified | Hash and after observation |
| `failed` | Explicitly failed attempt | Error; hash optional because failure may precede submission |

All carry the entry key, affected contracts, payer, signer kind/public account, requested target and event timestamp. Event timestamps are appropriate for history; they are not TTL projections. Errors must be sanitized by the producer. A timeout or uncertain transaction result is not proof of failure: retain a submitted record and reconcile it before retrying. Persistence/locking and notification routing remain separate work.

## Configuration and checks

[`evergreen.config.example.json`](../../evergreen.config.example.json) is compared with a compiler-checked example after removing underscore-prefixed documentation fields. Contract IDs are intentional placeholders. It explicitly selects `mode: 'dry-run'`; the future loader must also default an omitted mode to dry-run, resolve payer references, validate addresses/thresholds and verify the RPC network. Types alone do not validate JSON input.

```bash
pnpm typecheck:shared-types
pnpm exec vitest run packages/shared-types/test/contracts.test.ts
pnpm check
```

`pnpm typecheck` includes `tsconfig.test.json`, so usage examples and negative `@ts-expect-error` cases are checked in local and CI runs. Vitest by itself does not type-check them. Fixtures remain unmodified and all tests are offline. Full architecture data flow (`W1-D6-02`), mock RPC (`W1-D6-03`) and persistence (`W1-D6-04`) are separate tasks.
