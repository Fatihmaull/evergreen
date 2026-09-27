# W4-D27-04 — CLI 0.1.1 candidate rehearsal

This is a **pre-publication** check of branch `release/W4-D27-04-cli-0.1.1`
at `025fe58`, based on `origin/main@0baea11` (which includes #262). It does
not claim that npm `0.1.1` exists. The source PR must be reviewed and merged
before a fresh final-main pack, gate, install and manual publish.

## Branch checks

- `pnpm exec vitest run packages/cli/test/display.test.ts`: exit 0, 24 tests.
- `pnpm check`: exit 0, 62 Vitest files / 816 tests; all check gates passed.
- `pnpm publish --dry-run --access public`: refused the non-main branch with
  `ERR_PNPM_GIT_NOT_CORRECT_BRANCH`. The shell tool reported exit 0 despite the
  displayed refusal, so this command is **not** counted as a passed dry-run.
- `pnpm publish --dry-run --access public --no-git-checks`: exit 0, branch-only
  rehearsal; prepack built TypeScript and the 87.6 kB bundled CLI. It printed
  `Skip publishing ... (dry run)`. Never use `--no-git-checks` for the live publish.

## Tarball and stranger-install check

`pnpm pack --pack-destination /tmp/evergreen-cli-011-pack-p43Qf9` produced
`evergreen-stellar-cli-0.1.1.tgz` with SHA-256
`9db385fcbbb813a60b1653b39072c428b9c238464346817563a54f6fdb7fcb04`.
The five packed files were `LICENSE`, `README.md`, `package.json`,
`dist/evergreen.mjs`, and `dist/evergreen.mjs.map`. The packed manifest exposes
only `@evergreen-stellar/cli@0.1.1`; its sole runtime dependency is
`@stellar/stellar-sdk@17.0.1`. `core` and `shared-types` remain private workspace
build dependencies, not independently published packages.

Outside the monorepo, `npm install <tarball> --prefix <fresh temp dir>` exited
0 and installed 42 packages. The installed `evergreen --help` worked. A first
install attempt in the restricted sandbox was interrupted while unable to
reach the registry; the successful clean install used approved network access.

## Read-only Testnet smoke from the installed tarball

Both commands used the installed CLI, no transaction, signer or write flag:

```text
evergreen scan CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL
  exit 1; observed ledger 4,895,360
  instance: CRITICAL; remaining: none — EXPIRED (archived)
  ends at: not reported — RPC returns 0 for an archived entry
  no fabricated expiry date or negative remaining ledgers

evergreen scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
  exit 0; observed ledger 4,895,362
  live instance: HEALTHY; remaining: 1,474,899 ledgers
  ends at: ledger 6,370,261; estimated expiry date still rendered
```

The first restricted-network RPC attempt returned exit 2 without reading
anything; the successful read-only scans used approved Testnet network access.
Both scans disclosed limited scope: no explicit data keys, so they do not
assert full contract-storage health. This smoke tests **human CLI display**;
it does not close the structured core issue #235 or alter any B/C evidence.

Publisher auth is a separate final-main gate: `npm whoami` returned `E401` at
candidate preparation, so Rakha must refresh login/2FA before live publish.
