# `apps/web` — twelve-page preview

A second preview for a demo, on `feat/W4-D22-02a-full-prototype`. **This branch does not merge.**

Twelve routes, one shared shell (sidebar, status bar, footer — `src/chrome.mjs`):

- `/` — landing, static, no JavaScript (kept from the first prototype)
- `/dashboard/` — overview: live stat strip + contract cards, snapshot fallback
- `/dashboard/scanner/` — one-contract scan console with rent estimate
- `/dashboard/blast-radius/` — multi-contract dependency graph
- `/dashboard/decay/` — three panels of recorded evidence, build-time SVG
- `/dashboard/contracts/` — what A, B and C are for, health graded by core
- `/dashboard/engine/` — what the scheduled job decided, refused, and delivered
- `/dashboard/history/` — every extension with its hash, fee and trigger
- `/docs/archival/` — live network config plus our measurements
- `/docs/` — CLI reference generated from the tool at build time
- `/evidence/` — bundle count, the verifier, honest deliverable status
- `/about/` — team, grant, method

## Commands

```bash
node apps/web/scripts/make-snapshot.mjs   # read-only scan of A, B and C + live archival settings → data/
node apps/web/scripts/grade-snapshot.mjs   # grade the snapshot with core's health rules → data/snapshot-grades.json
node apps/web/build.mjs                    # build into apps/dashboard/public
node apps/web/build.mjs --commission       # prove the write-path guard can fail
node apps/web/scripts/serve.mjs 4317       # serve the built site locally
node --test apps/web/test/shim-parity.test.mjs
```

`grade-snapshot.mjs` must run after every `make-snapshot.mjs`: the build refuses
grades that are not from the committed snapshot.

## What it will not do

No extend, renew, broadcast or XDR export — not even disabled. Nothing is signed
or submitted; live pages make read calls only. Static pages render committed
data at build time and say which ledger it was recorded at. Every figure on
screen is read live or comes from `docs/evidence/` with its source named. A
panel with no real number shows no number.

## Reuse, do not re-derive

Health, thresholds, sharing and blast radius come from `@evergreen-stellar/core`,
and the verdict and exit mapping from the CLI's library entry. Static health
grades are computed by core itself (`grade-snapshot.mjs`), never by the page.
The `/docs` page is extracted from `packages/cli/src/command.ts` and `scan.ts`;
the build fails when those sources move.
