# CLI 0.2.0 — GitHub Release notes (draft until publish)

These notes are the draft body for a GitHub Release after
`@evergreen-stellar/cli@0.2.0` is on npm and the `cli-v0.2.0` tag exists.
They do **not** publish the package. npm publish and the tag are separate
steps owned by Rakha under `PH2-E1-06`.

## Install and try

Until the registry lists `0.2.0`, `latest` remains `0.1.1`. After publish:

```bash
npx @evergreen-stellar/cli@0.2.0 scan YOUR_TESTNET_CONTRACT_ID
```

Or, once `dist-tags.latest` is `0.2.0`:

```bash
npx @evergreen-stellar/cli scan YOUR_TESTNET_CONTRACT_ID
```

## What changed since 0.1.1

- `--network testnet|mainnet` / `EVERGREEN_NETWORK` for **read-only** scans
  (`PH2-E1-03`). Mainnet has no default RPC; set `SOROBAN_RPC_URL`.
- `extend` **refuses mainnet** until DoD-2 (`PH2-E1-04` / `PH2-E5-02`).
- Archived entries in `--json` use a truthful `expired` TTL status (`PH2-E1-01` / #235) — **breaking**.
- Archived-entry advice strings (`PH2-E1-05`); Buffer-free core extend path (`PH2-E1-09`).
- **No Support tip** in this release (`PH2-E1-08` not merged).

## Provenance (fill at publish)

- npm: `@evergreen-stellar/cli@0.2.0` (link after publish)
- Version bump on `main`: #401 (`packages/cli/package.json` → `0.2.0`)
- Publish from a clean worktree at the chosen `RELEASE_SHA` on `main` (must be
  an ancestor of `origin/main`). Record full SHA, tag object, `dist.shasum`,
  and rebuild hash in `docs/evidence/<date>-cli-0.2.0-published/`.
- Pre-publish rehearsal: [2026-10-23 candidate](../evidence/2026-10-23-cli-0.2.0-candidate/README.md)

## Action pin

After publish, GitHub Action workflows that need mainnet scan should pin
`version: '0.2.0'` (see [ACTION-GUIDE](../ACTION-GUIDE.md)). Until then, pin
`0.1.1` for testnet-only examples.
