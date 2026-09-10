# `W2-D14-02b` — pack-and-install rehearsal, and the second defect it caught

**2026-09-10.** `npm pack` all three packages, install the tarballs into an empty directory **outside the repo**, and run `evergreen scan` there. The front door a stranger uses, rehearsed eighteen days before publication.

## 🔴 It failed. Again, differently.

```
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

The tarballs produced by `npm pack` carry the literal workspace protocol:

```json
"dependencies": {
  "@evergreen-stellar/core": "workspace:*",
  "@evergreen-stellar/shared-types": "workspace:*"
}
```

`workspace:*` is a **pnpm-only** specifier. npm cannot resolve it, so **every user's install would have failed** — not with a subtle bug, with a hard error on the first command in the README.

## The cause, and the fix

`pnpm pack` rewrites the protocol to a real version. `npm pack` does not:

| Packed with | `@evergreen-stellar/core` resolves to |
|---|---|
| `npm pack` | `workspace:*` — **unresolvable** |
| `pnpm pack` | `0.0.0` — correct |

**So `W4-D27-02` must publish with `pnpm publish`, never `npm publish`.** That is now written onto the task rather than left as folklore, because the two commands look interchangeable and only one of them works.

## Rehearsal with `pnpm pack` — passes

Three tarballs installed into an empty directory outside the repo, no monorepo, no workspace links, `npm install` from local tarballs:

```
added 11 packages, and audited 12 packages
found 0 vulnerabilities
```

Then run as a real user would, via the installed binary:

```
./node_modules/.bin/evergreen scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
```

```
Coverage: known keys only — contract storage has NOT been fully enumerated.
HEALTHY  instance  AAAABgAAAA…
  remaining:  1,423,102 ledgers — live
  ends at:    ledger 6,025,589
```

Exit 0. `--json --cost` verified in the same installed copy.

## Why this check keeps earning its place

**This is the second distinct defect it has caught, and neither was visible from inside the monorepo.**

| Date | Defect | Would have shipped as |
|---|---|---|
| 2026-09-09 | `shared-types` declared as a runtime dep but never published | `E404` on every install |
| 2026-09-10 | `workspace:*` left literal by `npm pack` | `EUNSUPPORTEDPROTOCOL` on every install |

Both times **all local gates were green**, and both times `--dry-run` would not have caught it either: it packs without resolving. A check that never leaves the monorepo cannot answer a question about strangers.

The rehearsal was slipped to Week 4 earlier today to protect `W2-D11-01` on the critical path, then run anyway when Rakha took D11 himself. **Had it stayed slipped, this defect would have surfaced on Sep 28** — one day before publication, with no margin.

## Reproduce

```bash
pnpm build
for p in shared-types core cli; do (cd packages/$p && pnpm pack --pack-destination /tmp/tar); done
mkdir -p /tmp/fresh && cd /tmp/fresh && npm init -y
npm install /tmp/tar/evergreen-stellar-{shared-types,core,cli}-0.0.0.tgz
./node_modules/.bin/evergreen scan <contract-id>
```

Substituting `npm pack` for `pnpm pack` in line two reproduces the failure.
