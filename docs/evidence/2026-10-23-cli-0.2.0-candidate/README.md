# PH2-E1-06 — CLI 0.2.0 candidate (version on main; not yet on npm)

Version bump merged as [#401](https://github.com/Fatihmaull/evergreen/pull/401)
(`chore(release): prepare CLI 0.2.0 without the Support tip [PH2-E1-06]`).
`packages/cli/package.json` on `main` is **0.2.0**. This file does **not**
claim that npm `0.2.0` exists.

**Publish owner:** Rakha (`rakhargo` on npm). Do not npm publish or push
`cli-v0.2.0` from an agent run without an explicit OK.

## Scope (unchanged)

- Only `@evergreen-stellar/cli` publishes. `core` / `shared-types` stay bundled and `private`.
- **No Support tip** (`PH2-E1-08` / #379 not merged).
- Includes read-only mainnet scan (`PH2-E1-03`), mainnet `extend` refusal (`PH2-E1-04`),
  expired TTL JSON (`PH2-E1-01`), archived advice (`PH2-E1-05`), Buffer-free extend (`PH2-E1-09`).

## Rehearsal (CEF branch, before #401 merge)

Recorded against `cef/release-cli-0.2.0` / `origin/main@3bb2124` (includes #343):

- `pnpm build && node apps/web/build.mjs && pnpm check`: exit 0.
- `pnpm publish --dry-run --access public --no-git-checks` skipped publish (dry run only).
  **Never use `--no-git-checks` for the live publish.**
- Pack: `evergreen-stellar-cli-0.2.0.tgz`, 109,683 bytes, SHA-256
  `e81f70148f36bba8c2f03b7602030c71ecfbfdab404080bb29500109483ce6e7`
  (five files: LICENSE, README.md, package.json, dist/evergreen.mjs,
  dist/evergreen.mjs.map). Final main may hash differently — record at publish.
- Stranger install: `evergreen --help` shows `--network`; `extend --network mainnet`
  refused with exit 2 before RPC. No signing or submit.

## Remaining publish steps (Rakha)

1. Clean worktree at chosen `RELEASE_SHA` (ancestor of `origin/main`; tip at
   this prep commit's base was `a43b9095cf03ccd8416923e14fe4064fd3c75104` — re-resolve at publish time).
2. `pnpm install --frozen-lockfile` && `pnpm check` && `pnpm pack` in `packages/cli`.
3. Tag `cli-v0.2.0` on that SHA (annotated), then `pnpm publish --access public`
   as `rakhargo` (token via env only; never argv/chat/commits).
4. Readback + evidence under `docs/evidence/<date>-cli-0.2.0-published/`; flip BACKLOG `PH2-E1-06`.
