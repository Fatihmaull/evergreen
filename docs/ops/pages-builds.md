# Pages builds and the build quota

**Status (2026-10-29): branch control is set.** Production builds from `main` (automatic production deployments on); **preview builds run only for the branch `preview`**. Set by DevOps through the Cloudflare API on 2026-10-29 (`source.config`: `preview_deployment_setting: custom`, `preview_branch_includes: ["preview"]`, `preview_branch_excludes: []`; it was `all` / `["*"]`), and read back from the project config afterwards. The 2026-10-28 note below that this needed Fatih's clicks is superseded.

**October 2026 count (2026-10-29):** **602 builds**, all on `evergreen-stellar` (preview 439, production 163; 3 of them failed). Counted from the Pages API deployment list for all four Pages projects on the account, entries with `created_on` in October (UTC); the other three projects had 0. That is **102 over a limit of 500**, yet builds were still succeeding (latest 2026-10-29 07:19 UTC). **Whether the limit is enforced for this account is `undetermined`.**

## The limit

Cloudflare's Pages limits page (read 2026-10-28): **Free: 500 builds a month and 1 concurrent build**; Pro 5,000 and 5; Business 20,000 and 20. Concurrency is per **account**, not per project. The page does **not** say whether Workers Paid changes these numbers, and it does not say what happens when the count is exceeded.

**This account's actual Pages build limit is `undetermined`.** It is not readable with `wrangler`, and the dashboard screens Fatih checked do not show build counts. Billing, Subscriptions would show a Pages line item if the project were on a paid Pages plan; its absence means Free.

## The measurement

Pages builds every pushed branch head (all non-production branches are the default), and the repo's CI runs on the same pushes, so **distinct pushed commits seen by CI are a proxy for Pages builds**. Counted on 2026-10-28 from `gh run list --workflow ci.yml --created '>=2026-10-06'`:

| | Builds |
|---|---|
| **Since 2026-10-14** (the earliest run the API returned; the cycle began 2026-10-06, so this is a **lower bound**) | **492** |
| of which pushes to `main` (production builds) | 140 |
| of which pushes to other branches (preview builds), across 156 branches | 352 |
| Last 7 days (2026-10-22 to 10-28) | 347, about **50 a day** |
| Projected to the cycle end, 2026-11-05, at that rate | **about 890**, roughly 1.8 times a limit of 500 |

Cross-check: on 2026-10-27, `wrangler pages deployment list` showed 25 deployments across 17 branches in about 13 hours, the same rate.

**What the numbers do not settle.** If the limit were 500 and counted per cycle, it would already have been reached, yet builds are still succeeding (one completed this morning). So one of these is true, and none can be read from here: the account's limit is higher, the count resets on a different boundary (the page says "per month"), or the limit is not enforced by stopping builds. **A stopped production build is the risk:** it would freeze the site mid-cycle while the API Worker, which deploys separately, kept moving.

## Recommendation (Fatih, 2026-10-28: restrict if above 50%; the projection is far above)

**Build production from `main` only, and previews only from the branch `preview`.** That keeps the production site and the one preview that can sign in (`preview.evergreen-stellar.pages.dev`: it is the only origin the API accepts, `DASHBOARD_ORIGIN`), and drops the per-branch previews, which cannot sign in anyway and all talk to the same preview Worker.

### The clicks (Fatih; DevOps cannot make this change)

The settings are in the Pages project and `wrangler` has no command for them. Changing them over the API needs a Cloudflare token, and an agent does not lift the `wrangler` login's credential out of its config file to call the API itself. Dashboard path per Cloudflare's branch-build-controls page:

1. Cloudflare dashboard, **Workers & Pages**, the project **`evergreen-stellar`**.
2. **Settings**, then **Builds** (older layout: *Builds & deployments*), then **Branch control** / **Configure Production deployments**.
3. **Production branch:** leave `main`, automatic production deployments **on**.
4. **Preview branches:** choose **Custom branches**, **Include** the exact name `preview`, add no excludes. A branch matching neither list is skipped.
5. **Save.**

### What changes

- Pull requests stop getting a Pages preview and a **Cloudflare Pages** check. That check is **not required** for merging (`main` requires only `typecheck · lint · test`, read 2026-10-27).
- WEBF and WEBR lose per-branch UI previews. To see a branch, merge it to `main` (it reaches `preview` and production) or ask DevOps.
- The `preview` branch builds on every merge to `main`, because [`preview-branch-sync.yml`](../../.github/workflows/preview-branch-sync.yml) fast-forwards it (until [#472](https://github.com/Fatihmaull/evergreen/pull/472) merges, DevOps does that by hand). Builds then roughly equal two per merge: about 140 merges in 15 days is 9 a day, about **19 a day**, down from 50. That is still about 150 more builds before 2026-11-05, so if the real limit is 500 and counts from 2026-10-06 even this is tight: see the next option.

### Further option: build watch paths

Pages can skip a build when no watched path changed (Settings, Builds, **Build watch paths**). Many merges touch only docs, the engine or the CLI. A conservative include list for this repo: `apps/**`, `functions/**`, `packages/core/**`, `packages/shared-types/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.nvmrc`. **Trade-off:** a path missing from the list means a stale site after a change that matters. Recommended only after two days of measurement under the first change, and with `packages/**` as the safe superset if the saving is small.

## Re-measuring

```bash
# distinct pushed commits since the cycle start (a proxy for Pages builds)
gh run list -R Fatihmaull/evergreen --workflow ci.yml --limit 1500 --created ">=2026-10-06" \
  --json event,headBranch,headSha --jq '[.[] | select(.event=="push" or .event=="pull_request") | [.headBranch,.headSha]] | unique | length'

# newest Pages deployments (wrangler lists 25 per environment, no timestamps)
wrangler pages deployment list --project-name evergreen-stellar --environment preview
```

Expected after the change: preview deployments only on branch `preview`. Record the date, the settings and the new rate here.
