# PH2-E1 — CLI 0.2.1 candidate rehearsal

This is a **pre-publication** check of branch `claude/cli-0.2.1`, based on
`origin/main@ebf0498`, which includes #663 (top-level help and `--version`).
It does not claim that npm `0.2.1` exists. Once this PR merges, the live publish
follows the 0.2.0 process
([candidate](../2026-10-23-cli-0.2.0-candidate/README.md),
[readback](../2026-10-23-cli-0.2.0-published/README.md)): a fresh pack from final
`main`, the same checks, then a manual publish by the npm owner and a readback.

## Scope

- Version: `@evergreen-stellar/cli` 0.2.0 → 0.2.1. This is the only package
  that publishes. `core` and `shared-types` are still bundled and `private`.
- New since `cli-v0.2.0`, user-visible:
  - `evergreen --help` / `evergreen help` print a short overview of both
    commands. The overview is 20 lines and at most 79 columns. The text is
    DES's, from `components.md` § "CLI help and version" (#648, #664).
  - Bare `evergreen` prints the same overview on stderr and exits 2.
  - `--version` / `-v` print the bare version, which is read from the shipped
    `package.json`.
  - An unknown command names `scan` and `extend` and exits 2.
  - `evergreen scan --help` keeps the full scan reference. `extend --help`
    is unchanged.
- Other commits since 0.2.0 under `packages/core` add the hosted money path
  helpers. The CLI does not import those, so they do not change CLI
  behaviour. Exit codes, `--json`, option names and the colour rules are
  unchanged.
- **No Support tip.** #379 (`PH2-E1-08`) is still not merged.

## Branch checks

- `pnpm build`: exit 0.
- `vitest packages/cli`: 282 passed. This includes the built-artifact test,
  which reads the version from `package.json`.
- `pnpm typecheck` and `pnpm lint`: exit 0.
- `pnpm publish --dry-run --access public --no-git-checks` printed
  `Skip publishing @evergreen-stellar/cli@0.2.1 (dry run)`. This is a
  branch-only rehearsal. **Never use `--no-git-checks` for the live publish.**

## Tarball and stranger install

`pnpm pack` produced `evergreen-stellar-cli-0.2.1.tgz`, 115,665 bytes, SHA-256
`7278f1df8fd570ac962217163296c39c2d5f774e33aac1e7cf4dac534dfaaf2c`. It holds
five files: `LICENSE`, `README.md`, `package.json`, `dist/evergreen.mjs`
(96,492 B) and `dist/evergreen.mjs.map`. The only runtime dependency is
`@stellar/stellar-sdk@17.0.1`. A tarball packed from final `main` may hash
differently, so the published hash is recorded at publish time.

Installed outside the monorepo, in an empty directory, with
`npm install <tarball>`. Node was v22 in this container; the package declares
`>=24`, so repeat this on Node 24 at publish.

| command | result |
|---|---|
| `npm install` | exit 0; `node_modules/@evergreen-stellar/` holds only `cli` |
| `evergreen --version` | `0.2.1` |
| `evergreen --help` | 20 lines, widest 77 columns |
| `evergreen` | exit 2 |
| `evergreen frob` | exit 2 |
| `evergreen scan NOT_A_CONTRACT` | exit 2 |
| `evergreen extend --network mainnet <id>` | exit 2, refused before any RPC call |

No transaction, signer or network write was used.
