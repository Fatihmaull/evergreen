# W4-D27-04 — public npm CLI 0.1.1 readback

This is the publication record for the human archived-TTL display patch. It
does not close the structured core issue #235 or claim a GitHub Release for
0.1.1. The immutable npm 0.1.0 and `cli-v0.1.0` GitHub Release remain separate.

## Source and gate

- Source: clean `main@9a67696a977f42e30210c2ef04b2f11e25b23154`; Fatih
  merged the CLI display fix in #262 and version candidate in #265. The
  intervening #266 changed demo documentation, not CLI package files.
- `pnpm check` on this main: exit 0; 62 Vitest files and 816 tests passed,
  including publish-safety, bundle-secret, evidence-integrity and formatting
  gates. `pnpm publish --dry-run --access public`: exit 0 with normal git checks.
- `pnpm pack` produced five files: `LICENSE`, `README.md`, `package.json`,
  `dist/evergreen.mjs`, and its source map. It publishes only the CLI; the
  packed manifest has pinned runtime `@stellar/stellar-sdk@17.0.1`, while
  core/shared types remain private build dependencies.

## Registry publication and integrity

- User authorized the patch. `npm whoami` returned `rakhargo`; the public
  package was still 0.1.0 before the live command.
- Two `pnpm publish --access public` web-auth attempts ended
  `ERR_PNPM_WEBAUTH_TIMEOUT`; registry readback still showed only 0.1.0. The
  third attempt, after user browser authorization, exited 0 with
  `Published package @evergreen-stellar/cli@0.1.1`.
- Registry `time.0.1.1`: `2026-09-27T10:22:40.256Z`; `dist-tags.latest` is
  `0.1.1`. Public package:
  [`@evergreen-stellar/cli@0.1.1`](https://www.npmjs.com/package/@evergreen-stellar/cli/v/0.1.1).
- Registry `dist.integrity`:
  `sha512-ZprmdYGOkChI8q00ejlNIIZXkdnR2dRFsKgOH1V2QTdRDNckv8oCDZMig4KrAvHaTWzFeyLrXYqIPuHFJqc1WA==`.
  Registry `dist.shasum`: `08043876d672b6ed41e7416710e893e764287a5d`.
- Fresh `npm pack @evergreen-stellar/cli@0.1.1` downloaded the public tarball.
  Both registry and final-main tarballs have SHA-256
  `9db385fcbbb813a60b1653b39072c428b9c238464346817563a54f6fdb7fcb04`
  and the same five files. This is a byte-for-byte readback, not just a
  matching version string.

## Stranger-install and read-only Testnet smoke

In a new directory outside the monorepo,
`npm install @evergreen-stellar/cli@0.1.1 --prefix <temp>` exited 0 (42
packages installed). `node_modules/@evergreen-stellar/` contained only `cli`,
and the installed `evergreen --help` worked. Running that installed binary:

```text
evergreen scan CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL
  exit 1 at observed ledger 4,896,210
  instance: CRITICAL; remaining: none — EXPIRED (archived)
  ends at: not reported — RPC returns 0 for an archived entry
  no fabricated end ledger, date, or negative remaining count

evergreen scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
  exit 0 at observed ledger 4,896,210
  instance: HEALTHY; remaining: 1,474,051 ledgers
  ends at: ledger 6,370,261; live estimated expiry still rendered
```

Both scans disclosed limited coverage because no explicit data keys were
supplied; neither asserts full storage health. No signer, submit flag,
transaction, restore, or extend was used. B/C and shared Wasm remain untouched.
