# `evergreen` (CLI)

Read-only TTL scans on Stellar Testnet. The current command discovers the contract instance and its Wasm code, and reads explicit persistent/temporary data keys. It reports remaining ledgers, approximate expiry dates, lifecycle and incomplete observations. `scan --cost` estimates extension fees. The new manual `extend` command prepares and simulates by default; submitting requires explicit flags. Its live Testnet proof remains pending review.

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
| `3` | The scan came back **degraded** — an entry not returned, a TTL unavailable, an executable that cannot be followed, or nothing observed |
| `1` | All observations are available and at least one TTL is below 17,280 ledgers |
| `0` | Everything the command was asked to check has known TTL at or above the threshold |

**`0` means "everything I was asked to check is healthy", never "this contract is healthy".** The command reads the keys it is given and cannot enumerate storage, so coverage is printed on every scan and belongs in how you read the result.

`--no-data-keys` asserts that this contract has no data keys beyond its instance, and is mutually exclusive with `--keys-file`. **Only the contract's author can know that** — it is a caller declaration recorded as `coverage.noDataKeysDeclaredByContract[id]: true`, never an on-chain completeness check. An empty keys file says "here are my keys: none"; only this flag says "there are none".

`--require-declared-scope` additionally exits `3` when a contract's scope was not declared. **Use it in CI on a contract you own** — `evergreen-check` sets it by default. It is off otherwise, because scanning a contract you did not write makes declaring scope impossible, and an exit code every default invocation triggers is not a signal. Programmatic callers get the same choice through `exitCodeFor(result, threshold, { requireDeclaredScope })`.

Precedence is **2 > 3 > 1 > 0**. If a low TTL is observed alongside a missing entry, exit is `3` and JSON still contains both findings. Exit `1` reports low TTL; it never requests or authorizes an extension — a future engine must evaluate observations, issues, policy, payer and budgets itself. See [ADR-006](../../docs/adr/ADR-006-scan-health-exit-codes.md), accepted 2026-09-10 as amended.

Zero applies only to the supplied/discovered keys; it never guarantees complete storage coverage. Missing entries are reported as issues, not asserted to be archived or deleted. Temporary entries expire by deletion; other supported entry types archive. Zero remaining ledgers is still the final live ledger.

`--json` emits `ScanResult` alone on stdout once scanning starts, including partial results. Argument/file/connection failures emit a diagnostic on stderr and exit `2`. Successful entries survive another batch's failure. Dates are approximate display projections; each entry's own observation ledger drives its TTL math.

## Publication

The npm name is `@evergreen-stellar/cli`, with command name `evergreen`. The package remains private pending `W4-D27-02`; repository execution above is the current workflow. Future publishing uses `publishConfig.access: public`. This scan command submits no transactions.


## Manual extension (Testnet)

Build with `pnpm typecheck`, then simulate using your funded public Testnet payer:

```bash
node packages/cli/dist/bin.js extend <contract-id> --ledgers 1000 --source-account <G-public-account> --json
```

`--ledgers N` adds N ledgers to each selected entry. The target is computed separately for every entry and capped at `max_entry_ttl - 1` from live network configuration. Capping is reported. Instance only is the default; `--keys-file keys.json` adds explicit persistent/temporary keys. Shared Wasm requires `--include-code`: extending it also benefits contracts outside this scan. Selected scope never establishes whole-contract protection. Expired or unreadable selected keys are refused; restore is not automated.

The public payer can also come from `EVERGREEN_SOURCE_ACCOUNT`. There is no fallback payer and no automatic funding. Simulation does not resolve a secret, sign, or submit. A zero exit means simulation completed, not that TTL changed.

After reviewing the selected keys, target and fee, an explicit live request is:

```bash
node packages/cli/dist/bin.js extend <contract-id> --ledgers 1000 --source-account <G-public-account> --submit --secret-env EVERGREEN_SECRET_KEY --max-fee-stroops <reviewed-total-budget> --json
```

Export the secret through your private shell environment or secret manager first; never paste it into command arguments or commit it. `--secret-env` names a variable, not a secret. This command does not automatically load `.env`. A wrong key/payer, operation, footprint, network, fee or validity interval is rejected before signing. This plain local adapter is not the W3 on-chain policy signer.

The fee cap bounds the sum of prepared envelope fees for the command, in integer stroops. Each entry gets one sequential transaction with a fresh account sequence. Fees shown are prepared upper bounds, not receipts. The cap is never silently increased. The command stops on any failure and reports previous outcomes and unattempted keys.

Previews go to stderr **before signing**, including the prepared hash (not yet sent); JSON stdout contains one final report. Preserve both outputs. Exit 0 requires all entries to be simulated, justified no-ops, or confirmed and post-verified live successes. Exit 2 covers errors and partial/unconfirmed outcomes. A `submitted` record is not success: reconcile that exact hash through RPC `getTransaction` and re-read TTL before retrying. A timeout or NOT_FOUND does not authorize a replacement. No automatic retry is performed, including for TRY_AGAIN_LATER. If a process was interrupted, the prepared hash printed on stderr identifies the possible transaction.

Live success checks the absolute expiry ledger against the before observation and inclusion ledger plus target. Later remaining-TTL readings naturally decrease as ledgers advance. A concurrent third-party extension may also improve post-state; the CLI does not prove exclusive causation.

For the sprint proof use **A's instance only** after review. Do not submit for B/C or shared A/B/C Wasm while decay proofs are pending. [D11 simulation evidence](../../docs/evidence/2026-09-10-manual-extend-simulation/README.md) is unsigned and is not a live extension proof.
