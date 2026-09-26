# Self-host the engine (Testnet, Stage 1)

This guide describes the **current source checkout**, not an npm engine package
or a hosted service. You operate and fund the fee-paying account. Evergreen
does not need authority over your contract: `extendTTL` is permissionless, and
the signer pays fees only. A raw Stage 1 Ed25519 seed is a hot key; the software
checks do **not** cryptographically constrain a stolen seed. Use a dedicated,
minimally funded Testnet account. [Stage 2 is not available in v1](POLICY-SIGNER.md).

## What runs today

| Entry point | Behaviour | Signer / submission |
| --- | --- | --- |
| [Repository cron](../.github/workflows/engine-cron.yml) | Scheduled scan and decision using the repository dogfood config | **None. Decide-only.** It is not your live engine deployment. |
| `pnpm engine:execute --config PATH --dry-run` | Local scan, decision and transaction simulation for selected entries | Public `sourceAccount` only; no secret read or submission. |
| `pnpm engine:execute --config PATH --submit --attempt-file PATH` | Bounded local live attempt, only with `mode: live` and a fee cap | Reads the named secret environment variable and may submit. **Never run as a dry-run check.** |

There is **no shipped unattended live-submission workflow** with durable
cross-run reconciliation. The local attempt journal is fail-closed: retain it
and reconcile an uncertain transaction hash before another attempt. Do not
change the path merely to bypass an existing journal. A cron expression alone
does not add recovery or monitoring. See the [operator runbook](W3-D17-05-RUNBOOK.md)
and [ADR-003](adr/ADR-003-toolchain-hosting-persistence.md).

## Prepare a dry run against *your* contract

1. Use Node 24 and pnpm 11; clone this repository, then run
   `pnpm install --frozen-lockfile` and `pnpm build`. The engine is private
   workspace code; installing `@evergreen-stellar/cli` from npm does not install
   this engine.
2. Obtain your Testnet contract ID and a separate public `G...` account you
   control for fees. Fund that account on Testnet before considering live use.
   No secret is needed for this dry run.
3. Copy [`evergreen.config.example.json`](../evergreen.config.example.json) to a
   private config file. Replace its placeholder contract ID and add the public
   payer `sourceAccount` as below. Keep `mode` at `dry-run`.

```json
{
  "network": {
    "rpcUrl": "https://soroban-testnet.stellar.org",
    "networkPassphrase": "Test SDF Network ; September 2015"
  },
  "defaults": {
    "warnBelowLedgers": 120960,
    "bumpWhenRemainingLedgersBelow": 17280,
    "extendToLedgers": 518400
  },
  "contracts": [
    {
      "id": "YOUR_TESTNET_CONTRACT_ID",
      "payer": "my-testnet-payer",
      "dataKeys": ["YOUR_KNOWN_BASE64_XDR_LEDGER_KEY"]
    }
  ],
  "payers": {
    "my-testnet-payer": {
      "signer": "ed25519",
      "secretEnvVar": "EVERGREEN_SIGNER_SECRET",
      "sourceAccount": "YOUR_PUBLIC_G_ACCOUNT",
      "maxFeeStroops": "2000000"
    }
  },
  "mode": "dry-run"
}
```

The `YOUR_...` values are placeholders, **not a runnable config**. Supply the
ledger keys your contract actually uses; RPC cannot enumerate arbitrary
contract storage. If you authored an instance-only contract, replace
`dataKeys` with `"noDataKeys": true` instead. Never assert that for a contract
whose storage schema you do not know. Include each temporary key explicitly;
temporary entries are not auto-extended without an explicit per-entry policy.
See [config types](../packages/shared-types/src/index.ts) and
[CLI scope guidance](ACTION-GUIDE.md#declare-the-storage-scope).

From the repository root, after replacing the placeholders:

```bash
pnpm engine:execute --config /absolute/private/evergreen.config.json --dry-run
```

Inspect `decisions`, `previews`, `warnings`, `diagnostics`, `liveness` and
`feesByPayer` before proceeding. Exit 0 means no error/alarm; exit 1 may be a
low-TTL alarm even when simulation succeeds; exit 2 means invalid input or
incomplete execution. **Neither an exit code nor a preview authorizes a write.**
This command does not auto-load `.env`; `--config` selects the config file.

## If you later operate it live

Use only your own Testnet contract and fee account. Independently verify the
contract ID, declared keys, threshold, target, public payer, fee cap, current
TTL, account balance and unsigned simulation. Put the matching signer seed in a
private environment or secret store named by `secretEnvVar`; never put it in
config, a command argument, a workflow file or a commit. Live requires changing
the private config to `"mode": "live"` **and** passing both `--submit` and a new,
retained `--attempt-file`. That is a deliberate operator action, not part of the
dry-run procedure above. The [Stage 1 runbook](W3-D17-05-RUNBOOK.md) covers
journals, alerts, uncertainty and evidence. Do not apply this procedure to the
project's B/C decay subjects or shared Wasm.

For an actual Testnet transaction, preserve the unedited RPC JSON, transaction
hash and explorer screenshot immediately in your evidence record. A scheduled
live service still needs durable reconciliation and independent missed-run
monitoring; the included cron does not provide a ready-made live deployment.
The [READY outcome](READY.md) remains a human/fresh-machine acceptance call.
