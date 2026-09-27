# Add `evergreen-check` to GitHub Actions

This check is **read-only**. It installs the published CLI in the caller's job,
scans Testnet ledger entries and fails the job when an observed entry is at or
below the threshold. It never signs, submits, extends or restores anything.
The public `Fatihmaull/evergreen@v1` tag was tested from a
[separate repository](https://github.com/rakhargo/evergreen-check-smoke/actions/runs/36255608415)
with `@evergreen-stellar/cli@0.1.0`: one green job exited 0 and one deliberate
low-TTL job exited 1. [Original run evidence](evidence/2026-09-26-action-v1-tag/README.md).

## Minimal workflow for a contract you own

Add `.github/workflows/evergreen-check.yml` to **your** repository:

```yaml
name: Check contract TTL
on:
  workflow_dispatch:
  schedule:
    - cron: '17 */6 * * *'

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5
      - uses: Fatihmaull/evergreen@v1
        with:
          contracts: YOUR_TESTNET_CONTRACT_ID
          keys-file: evergreen.keys.json
          threshold: '120960'
          version: '0.1.0'
```

Replace the contract ID and commit your own `evergreen.keys.json` (below). The
example cron checks every six hours, **best effort**, not an archival
guarantee; choose a threshold longer than your worst expected scheduling and
response delay. `120960` is ledgers (about one week at five seconds/ledger),
not seconds. Run `workflow_dispatch` once before relying on the schedule.
No npm token, signing key, pnpm installation or repository secret is needed.
The Action uses public Testnet RPC and the public npm package.

### Declare the storage scope

```json
{
  "dataKeys": ["YOUR_KNOWN_BASE64_XDR_LEDGER_KEY"]
}
```

The file lists **full Base64-encoded XDR ledger keys** for persistent and
temporary entries you know your contract uses. Replace the placeholder with
real keys; see the [verified A fixture](evidence/2026-09-08-scan-entry-types/data-keys.json)
for the encoding shape, not as keys to reuse for your contract. RPC cannot
enumerate arbitrary storage. The Action defaults to
`require-declared-scope: 'true'`; without a valid declaration, green cannot
mean your full intended storage scope is healthy. If your own contract has no
data keys beyond its instance, omit `keys-file` and use
`no-data-keys: 'true'`. Do **not** assert that for an unfamiliar contract just
to turn a red job green. `keys-file` supports exactly one contract; for
multiple contracts with different key sets, use separate jobs/steps.

Exit 0 means the declared/observed scope is healthy, 1 means a TTL is at or
below the threshold, 2 means input or execution error, and 3 means a degraded
or incomplete scan. All nonzero results fail the job; exit status never
authorizes a transaction. Review the job log and step summary to distinguish
an actual low-TTL finding from an RPC/input failure. You can reproduce the
same read locally with `npx @evergreen-stellar/cli@0.1.0 scan` and the
corresponding `--keys-file`, `--threshold` and
`--require-declared-scope` flags.

For reproducibility, pin both the Action and CLI versions. `@v1` is a public
major tag; for an immutable Action reference use commit
`2a4ab0a5a916ee156149c1f7e5a2ca8802c2fdc6` (the commit behind the
verified `v1` run). Update the pin deliberately after reviewing a new release.
