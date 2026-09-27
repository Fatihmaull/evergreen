# CLI 0.1.0 — GitHub Release notes (review draft)

The first public Testnet release of `@evergreen-stellar/cli` was published to
npm on **2026-09-24**. This GitHub Release is a source/provenance marker for that
already-published package; it does **not** republish or change the immutable
npm tarball.

## Install and try

```bash
npx @evergreen-stellar/cli@0.1.0 scan YOUR_TESTNET_CONTRACT_ID
```

Use the scoped npm name above. `npm i evergreen-stellar/cli` means a GitHub
dependency, not the published npm package.

The read-only scan reports observed TTL and health for instance/code entries
and for any data keys the caller supplies. It shows coverage explicitly:
Stellar RPC cannot enumerate arbitrary contract storage, so a healthy result
is **not** proof that undisclosed entries are healthy. `--json` gives a
machine-readable result; `--threshold N` controls the act-now boundary for a
run. The CLI also simulates extension cost and manual `extendTTL` operations
on Testnet; submission is opt-in, never the default. See the
[CLI guide](../../packages/cli/README.md) for keys, exit codes and the manual
simulation path.

## Verified publication

- npm: [`@evergreen-stellar/cli@0.1.0`](https://www.npmjs.com/package/@evergreen-stellar/cli/v/0.1.0)
- Published source commit to tag: `3d2ffa57fd081a973deac625f49aa1457f0dd74e`
- [Registry/clean-install verification](../evidence/2026-09-25-published-package-verification/README.md): the public package installs outside the monorepo, bundles private core/shared-types code, and runs real read-only Testnet scans with exit codes 0, 1, 2 and 3.

The planned tag is `cli-v0.1.0`, deliberately separate from the GitHub
Action's `v1` tag. The Action has its own
[external `@v1` CI proof](https://github.com/rakhargo/evergreen-check-smoke/actions/runs/36255608415)
and may point to a later repository commit than this npm package. Do not use
the Action tag as the source marker for the CLI tarball.

## Known limitation

An already-archived entry may be returned by Testnet RPC with
`liveUntilLedgerSeq: 0`. In CLI `0.1.0`, the archived assessment and label are
correct, but the raw remaining-ledger and projected-expiry fields can show a
negative count, ledger 0 and an implausible old date. Those numbers are **not
the real expiry ledger/date**; do not use them for recovery decisions. This is
tracked in [#235](https://github.com/Fatihmaull/evergreen/issues/235). There
is no `0.1.0` rebuild under the same version; a correction needs a new npm
version and its own verification.

Testnet only. No mainnet support, hosted engine, automatic restore or policy
signer enforcement is claimed by this release.
