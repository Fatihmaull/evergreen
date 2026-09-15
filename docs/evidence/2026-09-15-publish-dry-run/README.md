# `W4-D27-01` — publish dry run against the real registry

**2026-09-15.** Pulled forward from Week 4 because it is independent of the crossings
and `pnpm publish` has never touched the registry — the same shape as the packaging
defects that got past six green gates in September.

Everything except the final command. Nothing was published.

## Result: the artifact is clean

`pnpm publish --dry-run` runs `prepack` (build + bundle) and reports
`Skip publishing @evergreen-stellar/cli@0.0.0 (dry run)`.

`W4-D27-01` asks for three things, checked against
[the tarball that will actually ship](tarball-contents.txt):

| | |
|---|---|
| **No secrets** | ✅ no Stellar seed present — see the scanner note below |
| **No junk** | ✅ 33 files, all under `dist/` plus `package.json`, `README.md`, `LICENSE` |
| **Correct `files` field** | ✅ `["dist"]` is honoured; nothing outside it except the three npm always includes |

`@evergreen-stellar/cli` does not exist on the registry yet, so the name is free at
publish time. The org `evergreen-stellar` is ours (`W1-D5-01`).

## The scanner was commissioned before its result was believed

The first run of this check reported **no secrets found** over **zero files**.
`rm -rf /tmp/unpack/*` failed on an empty glob, the `&&` chain stopped before `tar`
ran, and `grep` over an empty directory is silent. A clean result and a broken
instrument are the same output.

So the scanner was proved first: a decoy seed (`S` + 55 base32 characters) was
planted in the unpacked tree and the scan was confirmed to find it, then the decoy
was removed and the real scan run over 33 files.

**What the real scan matched, and why none of it is a secret:** `secretEnv`,
`--secret-env`, `SECRET_KEY` and prose warning against putting a secret in
arguments. The seed-shaped pattern `S[A-Z2-7]{55}` matches **nothing**.

## The npm-versus-pnpm divergence still reproduces

`W4-D27-02` says to publish with `pnpm publish`, never `npm publish`. Re-verified
today rather than assumed, because the rule is from Sep 10:

| Packer | `workspace:` in the published `package.json` |
|---|---|
| `npm pack` | **present** — `"@evergreen-stellar/core": "workspace:*"` ([captured](npm-packed-package.json)) |
| `pnpm pack` | **absent** — rewritten to `0.0.0` ([captured](published-package.json)) |

It survives only in `devDependencies`, which installers skip, so a consumer would
not hit `EUNSUPPORTEDPROTOCOL` from this today. That is luck about which field it
landed in, not a reason to relax: the rule holds and the two commands still differ.

**I ran the wrong one first.** The task was corrected on 2026-09-12 from
`npm publish --dry-run` to `pnpm publish --dry-run`, for exactly this reason —
*"verifying contents with `npm` and shipping with `pnpm` checks an artifact nobody
will receive"* — and I ran `npm publish --dry-run` before reading the row. Both are
recorded above, which is the only useful thing about the mistake.

## What a dry run cannot prove, and is not claimed here

- **Authentication, 2FA and org membership.** `npm whoami` returns `E401` in this
  environment. The dry run validates *packaging*, not *permission*. Whether the
  publishing account can publish into this scope is unverified and remains part of
  `W4-D27-02`.
- **That a stranger can install it.** A dry run never leaves the monorepo.
  `W2-D14-02b` covers that separately, by packing and installing into an empty
  directory outside the repo — and it is the check that caught the runtime-dependency
  defect the dry run could not.

Running the bundle straight from this tarball exits non-zero with
`Cannot find package '@stellar/stellar-sdk'`. That is correct: the SDK is marked
external so it is installed rather than inlined, and an unpacked tarball has no
`node_modules`. It is not evidence that the CLI is broken, and it is not a substitute
for `W2-D14-02b`.

## Version

The tarball is `0.0.0`. `W4-D27-02` sets the real version at publish time; nothing
here asserts what it should be.
