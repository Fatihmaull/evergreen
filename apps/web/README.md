# `apps/web` — prototype

A working dashboard for a demo on 2026-09-18. **This branch does not merge.**

- **Live scanning** runs `@evergreen-stellar/core` in the browser. Core does not
  yet work there on its own (#194), so `src/shim/buffer-shim.js` supplies the one
  Node global it reaches for. The shim is held to `test/shim-parity.test.mjs`
  against Node's real `Buffer`, and both are deleted the day #194 lands.
- **Health, thresholds, sharing and blast radius** come from core. The verdict
  and the health block come from the CLI's library entry, which imports only
  core. Nothing is re-derived here; #195 moves the rest of the CLI's presentation
  rules into core.
- **The built site is committed** into `apps/dashboard/public`, because that is
  the directory the Cloudflare Pages project publishes and its build settings are
  shared with production. Building there gives this branch a preview deployment
  without touching those settings — and is one more reason this branch never
  merges.

## Commands

```bash
node apps/web/scripts/make-snapshot.mjs   # read-only scan of A, B and C → data/snapshot.json
node apps/web/build.mjs                   # build into apps/dashboard/public
node apps/web/build.mjs --commission      # prove the write-path guard can fail
node apps/web/scripts/serve.mjs 4317      # serve the built site locally
node --test apps/web/test/shim-parity.test.mjs
```

## What it will not do

No extend, renew, broadcast or XDR export — not even disabled. Nothing is signed
or submitted; the page makes read calls only. Every figure on screen is read live
or comes from the committed snapshot, which is labelled with the ledger it was
recorded at.
