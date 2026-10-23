# PH2-E1-06 — CLI 0.2.0 candidate rehearsal

This is a **pre-publication** check of branch `cef/release-cli-0.2.0`, based on
`origin/main@3bb2124`, which includes #343 (`PH2-E1-04`). It does not claim that npm
`0.2.0` exists. Once this PR merges, the live publish follows the 0.1.1 process
(see [the 0.1.1 readback](../2026-09-27-cli-0.1.1-published/README.md)): a fresh
final-main pack, gate, install, and a manual publish by the npm owner.

## Scope

- Version: `@evergreen-stellar/cli` 0.1.1 → 0.2.0. This is the only package
  that publishes. `core` and `shared-types` are still bundled and `private`.
- **No Support tip.** #379 (`PH2-E1-08`) is still a draft and is not merged.
  The bundle contains no Support tip text.
- New since 0.1.1, from `packages/cli`, `core` and `shared-types` history:
  `--network testnet|mainnet` / `EVERGREEN_NETWORK` with a read-only mainnet
  scan (`PH2-E1-03`, #338), `extend` refused on mainnet (`PH2-E1-04`, #343),
  structured archived TTL (`PH2-E1-01`, #235), archived-entry advice
  (`PH2-E1-05`), and Buffer-free core extend (`PH2-E1-09`).

## Branch checks

- `pnpm build && node apps/web/build.mjs && pnpm check`: exit 0.
- `pnpm publish --dry-run --access public --no-git-checks`: this is a
  branch-only rehearsal and printed `Skip publishing @evergreen-stellar/cli@0.2.0 (dry run)`.
  **Never use `--no-git-checks` for the live publish.**

## Tarball and stranger install

`pnpm pack` produced `evergreen-stellar-cli-0.2.0.tgz`, which is 109,683 bytes with
SHA-256 `e81f70148f36bba8c2f03b7602030c71ecfbfdab404080bb29500109483ce6e7`.
It contains five files: `LICENSE`, `README.md`, `package.json`,
`dist/evergreen.mjs` (93,892 B), and `dist/evergreen.mjs.map`. The only runtime
dependency is `@stellar/stellar-sdk@17.0.1`. A tarball built from final main may
have a different hash, so the published hash gets recorded at publish time.

The tarball was installed outside the monorepo with `npm install <tarball>` (exit 0).
`node_modules/@evergreen-stellar/` contained only `cli`. The installed
`evergreen --help` lists `--network testnet|mainnet`. The installed
`evergreen extend --network mainnet <id>` refused with exit 2 before any RPC call.
No transaction, signer or network write was used.
