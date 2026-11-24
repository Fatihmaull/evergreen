# CLI 0.2.1 — release notes (draft until publish)

These notes describe `@evergreen-stellar/cli@0.2.1`. They do **not** publish
the package. The npm publish and the `cli-v0.2.1` tag are separate steps
taken by the npm owner.

## Install and try

Until the registry lists `0.2.1`, `latest` stays `0.2.0`. After publish:

```bash
npx @evergreen-stellar/cli@0.2.1 --help
npx @evergreen-stellar/cli --version
```

## What changed since 0.2.0

- **A first screen that fits.** `evergreen --help` now prints a 20-line
  overview of both commands (`scan`, `extend`) with four examples, at most 79
  columns, and no colour. The full scan reference moved to
  `evergreen scan --help`.
- **`--version` / `-v`** print the installed version. In 0.2.0 they printed
  the usage text instead.
- **Unknown commands** now get a one-line message naming `scan` and `extend`.
  The exit code is still 2.
- Bare `evergreen` prints the overview on stderr and exits 2, so a script
  that forgot its command still fails.

Unchanged: exit codes, `--json` output, option names, colour rules,
testnet-only `extend`, and the read-only mainnet `scan`.

## Provenance (fill at publish)

- npm: `@evergreen-stellar/cli@0.2.1` (link after publish)
- Version bump on `main`: this PR (`packages/cli/package.json` → `0.2.1`)
- Pre-publish rehearsal: [2026-11-23 candidate](../evidence/2026-11-23-cli-0.2.1-candidate/README.md)
- Publish from a clean worktree at the merge commit on `main`. Record the full
  SHA, the tag, `dist.shasum` and `dist.integrity`, and the fresh-pack
  SHA-256 in `docs/evidence/<date>-cli-0.2.1-published/`.

## Action pin

GitHub Action workflows can keep pinning `version: '0.2.0'`, since nothing
they use changed. They can move to `0.2.1` at will.
