# `evergreen` (CLI)

**Find out when your Soroban contract's data expires, and what keeping it alive costs.**

Soroban ledger entries have a TTL measured in ledgers, not seconds. Every closed ledger decrements it. When it runs out the entry is **archived** — or for temporary entries **deleted outright** — and your contract stops working until someone pays to restore it. `evergreen scan` tells you how long you have, what happens when time runs out, and what an extension would cost.

Read-only. It never signs and never submits.

## Quickstart

> **Not on npm yet.** Publication is scheduled for Week 4. Until then, run it from a clone — the command and output are identical.

```bash
git clone https://github.com/Fatihmaull/evergreen.git
cd evergreen
pnpm install --frozen-lockfile
pnpm build
```

Then scan any Testnet contract — you do not need to own it, and no wallet or signup is involved:

```bash
pnpm cli scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
```

That contract is our public test subject, so the command works before you have one of your own.

```
Coverage: known keys only — contract storage has NOT been fully enumerated.
  CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L: 0 explicit data key(s)
  No data keys were supplied, so any further entries are unread.

HEALTHY  instance  AAAABgAAAA…
  contracts:  CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
  remaining:  1,424,255 ledgers — live
  ends at:    ledger 6,025,589
  approx:     2026-12-01T18:58:54Z (estimate — ledgers are the truth)
  observed:   ledger 4,601,334
  health:     HEALTHY — Above threshold.

HEALTHY  code  AAAAB8flXw…
  …

Worst entry health: HEALTHY (threshold 17,280 ledgers)
```

**That coverage block is the first thing printed, deliberately.** A scan reads the keys it is given and cannot enumerate a contract's storage, so `HEALTHY` means *"everything I was asked to check is healthy"* and never *"this contract is healthy"*. Ledger numbers drift between runs; yours will differ.

### What will it cost to keep alive?

```bash
pnpm cli scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L --cost --ledgers 518400
```

```
Cost to extend 2 entries by 518,400 more ledgers
  total   about 0.82 XLM  (8,212,414 stroops) — what leaves the account
    rent  about 0.82 XLM  (8,188,798 stroops)
    fees  about 0.0024 XLM  (23,616 stroops) — non-refundable resource + base fee

  99% of that rent is one entry (AAAAB8flXw…). Code entries hold the
  Wasm and are usually the expensive one — and the one shared between contracts.
```

Prices come from simulating the real operation against the network, not from a formula. **They are estimates**: rent pricing moves with network state and has differed ~18% between days, which is why the figures are rounded and labelled "about".

### For CI

```bash
pnpm cli scan <contract-id> --json
```

Exit code `0` healthy, `1` low TTL, `2` error, `3` incomplete scan. See [Coverage and exit codes](#coverage-and-exit-codes) — the distinction between `1` and `3` matters more than it looks.

## The two things people get wrong

**Archived is not deleted.** Instance, code and persistent entries are *archived* and can be restored. **Temporary entries are deleted and cannot be.** The output always says which, because telling someone their recoverable data is gone — or that their unrecoverable data can be restored — is worse than saying nothing.

**Contracts built from the same Wasm share ONE code entry.** If you deploy 40 vaults from one Wasm, that is 40 contracts and one `ContractCode` entry. When it expires, all 40 stop working at the same moment — and a per-contract scan shows 40 healthy contracts right up until they die together. `evergreen` deduplicates by ledger key, tells you when an entry is shared, and grades severity by how many contracts an entry takes down.

A scan of a single contract says so explicitly, because it *cannot* know who else built from that Wasm:

```
⚠ sharing:  code entries are shared by every contract built from the same Wasm.
            This scan saw 1. Others may depend on this entry and are invisible here —
            pass them together to see the real blast radius.
```

## Options

```
--json                     machine-readable output; the complete record
--cost [--ledgers N]       estimate the cost of N more ledgers (default 518,400 ≈ 30 days)
--keys-file <path>         supply explicit persistent/temporary data keys
--no-data-keys             assert this contract has none beyond its instance
--require-declared-scope   also exit 3 when scope was not declared (for CI on a contract you own)
--help                     usage, without connecting
```

`SOROBAN_RPC_URL` overrides the default public Testnet RPC. The live network passphrase is checked before anything is read: pointed at mainnet, the command refuses and says so.

`--ledgers N` means **"give me N more ledgers."** The protocol wants an absolute target rather than an increment, so the CLI computes that for you and caps it at the protocol maximum, saying so when it does.

## Data keys

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


## Storage advice

Add `--optimize` to a scan for conditional design recommendations with evidence:

```bash
pnpm cli scan <contract-id> --keys-file keys.json --optimize
pnpm cli scan <contract-id> --keys-file keys.json --optimize --cost --ledgers 1000 --json
```

The report covers temporary retention, persistent-data durability choices, and shared-code dependencies. It reads network minimum lifetimes but requires no payer or simulation unless `--cost` is also requested. Plain scans retain their existing output and network work.

Recommendations are scoped to observed keys. They do not infer payload size, duplicate contents, application requirements or unseen consumers. Instance storage is never suggested for conversion to temporary. A persistent-data suggestion applies only when the data is disposable or recomputable; durable state should remain persistent. No storage change, extension or automatic migration happens.

Current per-key rent quotes retain their pricing context when `--cost` is supplied. Missing, invalid or stale quotes remain unavailable, never zero. The historical A rent comparison is separately labelled; its approximately 1.95x ratio is not a promise of savings. Current network minimum lifetime is not the current entry's expiry: the report retains each entry's actual observed TTL. If settings cannot be read, a dated historical reference and limitation replace them.

JSON adds `optimization` alongside unchanged scan/health/cost fields. Advice does not change scan exit precedence; a healthy exit is not a complete-storage audit. Even when optional pricing fails, the scan and qualified advice remain visible. [Read-only A evidence](../../docs/evidence/2026-09-10-storage-advice/README.md) includes full RPC and both output modes.
