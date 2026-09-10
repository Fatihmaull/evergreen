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

## ⛔ CORRECTION — the `pnpm pack` rehearsal below PASSED WHILE TESTING THE WRONG THING

**Added the same day, after Fatih asked the question this rehearsal exists to answer: what did `0.0.0` resolve from?**

It resolved from a local file. The rehearsal installed all three tarballs at once, so npm satisfied the CLI's `@evergreen-stellar/core@0.0.0` dependency from a sibling tarball on disk:

```
node_modules/@evergreen-stellar/core
   resolved: file:.../packtest/tar/evergreen-stellar-core-0.0.0.tgz
```

**A stranger's machine supplies no such file.** `@evergreen-stellar/core@0.0.0` has never been published, so their resolution goes to the registry and 404s — the Sep 9 failure arriving one resolution step later.

### The conclusive rehearsal, run afterwards

Only the CLI tarball. Fresh directory. No sibling tarballs. Clean cache. No workspace above it.

```
npm install --cache <fresh> ../evergreen-stellar-cli-0.0.0.tgz
```

```
404 Not Found - GET https://registry.npmjs.org/@evergreen-stellar%2fcore - Not found
```

**That is the stranger, and that is what they get.**

### Why this correction matters more than the defect

The rehearsal reported success twice — Sep 9 after its fix, and Sep 10 — while supplying something no user has. **A check that has never been observed failing has not been shown to be a check.** It now has: the failing case above was produced deliberately, so the rehearsal has a demonstrated ability to detect the thing it was built for.

This is the third instance of the family in two days, and the sharpest, because the false answer came from the guard itself.

**The rehearsal procedure is corrected accordingly:** install ONLY the top-level package, in a fresh directory with a clean cache and no siblings. Any passing run that supplies a dependency the registry does not have is not a rehearsal.

---

## Original entry — the `pnpm pack` run (valid for the `workspace:*` finding, invalid as an install proof)

The `workspace:*` finding below stands: it was observed directly in the tarball's own `package.json`, independent of how the install resolved. What does **not** stand is the "passes" claim.

## Rehearsal with `pnpm pack` — passes *(see correction above)*

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
