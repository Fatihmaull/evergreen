# `evergreen` (CLI)

Read-only TTL scans on Stellar Testnet. The current command discovers the contract instance and its Wasm code, and reads explicit persistent/temporary data keys. It reports remaining ledgers, approximate expiry dates, lifecycle and incomplete observations. Rent estimation and transaction submission are later tasks.

## Run from this repository

After installing dependencies with the pinned Node/pnpm toolchain:

```bash
pnpm typecheck
node packages/cli/dist/bin.js scan <contract-id> --keys-file keys.json
node packages/cli/dist/bin.js scan <contract-id> --keys-file keys.json --json
# Only if the contract genuinely has no additional data keys:
node packages/cli/dist/bin.js scan <contract-id> --no-data-keys
```

`SOROBAN_RPC_URL` optionally overrides the default public Testnet RPC. The live network passphrase is checked before reading entries. `--help` prints usage without connecting.

The optional keys file contains only this property:

```json
{
  "dataKeys": ["<canonical base64 XDR LedgerKey>"]
}
```

Supply `ContractData` keys for the requested contract, with persistent or temporary durability. Instance keys, code keys, foreign-contract keys and malformed XDR are rejected. Instance/code keys are discovered automatically; duplicate supplied keys count once. See the [recorded public A keys](../../docs/evidence/2026-09-08-scan-entry-types/data-keys.json) for a concrete example. These keys identify that test contract only; a missing entry is possible on later reads.

## Coverage and exit codes

`getLedgerEntries` reads known keys; it does not enumerate arbitrary contract storage. Human output states this limitation, and JSON includes `coverage.mode: "known-keys"` plus each contract's count of unique, validated supplied data keys. A live instance is not evidence of healthy persistent storage. With no keys file, the command reads instance/code only.

| Exit | Meaning, in precedence order |
|---|---|
| `2` | Invalid arguments/input/response, network refusal or RPC failure |
| `3` | Unknown data-key coverage, unavailable TTL, missing/unsupported entries, or no observations |
| `1` | All observations are available and at least one TTL is below 17,280 ledgers |
| `0` | All requested/discovered keys have known TTL at or above the threshold, with no issues |

`--no-data-keys` explicitly asserts that this contract has no data keys beyond its instance. It is mutually exclusive with `--keys-file`. The scanner still reads instance/code and records `coverage.noDataKeysDeclaredByContract[id]: true`. This assertion comes from the caller, not an on-chain completeness check. Do not use it merely to make CI pass. An empty keys file alone remains unknown coverage (exit `3`).

Precedence is **2 > 3 > 1 > 0**. If a low TTL is observed alongside a missing entry, exit is `3` and JSON still contains both findings. Every unhealthy/incomplete case stays nonzero. Exit `1` reports low TTL; it never requests or authorizes an extension. A future engine must evaluate observations, issues, policy, payer and budgets itself. Old programmatic results that omit coverage now return `3`, rather than the prior helper's `0`; migrate to explicit coverage. See [ADR-006](../../docs/adr/ADR-006-scan-health-exit-codes.md), proposed for shared review.

Zero applies only to the supplied/discovered keys; it never guarantees complete storage coverage. Missing entries are reported as issues, not asserted to be archived or deleted. Temporary entries expire by deletion; other supported entry types archive. Zero remaining ledgers is still the final live ledger.

`--json` emits `ScanResult` alone on stdout once scanning starts, including partial results. Argument/file/connection failures emit a diagnostic on stderr and exit `2`. Successful entries survive another batch's failure. Dates are approximate display projections; each entry's own observation ledger drives its TTL math.

## Publication

The npm name is `@evergreen-stellar/cli`, with command name `evergreen`. The package remains private pending `W4-D27-02`; repository execution above is the current workflow. Future publishing uses `publishConfig.access: public`. This scan command submits no transactions.
