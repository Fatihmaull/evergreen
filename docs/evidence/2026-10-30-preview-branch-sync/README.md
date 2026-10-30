# PH2-E0-11: preview-branch-sync matches the 2026-10-28 rule (read 2026-10-30 16:45 WIB)

**Rule** (Fatih, 2026-10-28, `BACKLOG.md` PH2-E0-11 and [`docs/ops/preview-vs-production.md`](../../ops/preview-vs-production.md)): preview is `main` by default. A push to `main` redeploys it. A PR deploys to preview only when it has the `deploy-preview` label and is not a draft. `preview-branch-sync.yml` fast-forwards the `preview` branch to `main`. The production job refuses a stale approval.

| Rule part | Where | Result |
|---|---|---|
| Sync on every push to `main`, plus manual dispatch | `preview-branch-sync.yml` `on: push: branches: [main]`, `workflow_dispatch` | matches |
| Fast-forward only, never forced | `git merge-base --is-ancestor` check, then plain `git push origin "$RUN_SHA:refs/heads/preview"` (no `--force`) | matches |
| A dispatch from another ref can't push | job `if: github.ref == 'refs/heads/main'` | matches |
| No overlapping syncs | `concurrency: preview-branch-sync`, `cancel-in-progress: false` | matches |
| PR preview deploys need the label and a non-draft PR | `api-deploy.yml` lines 53-55 (`draft == false`, label `deploy-preview`) | matches |
| Stale-approval guard | `api-deploy.yml` step "refuse a commit that main has moved past" | present |
| Pages previews only from `preview` | Pages API `source.config`: `production_branch: main`, `preview_deployment_setting: custom`, `preview_branch_includes: ["preview"]` | matches |

**State:** `origin/main` = `origin/preview` = `0f8e610` at 16:45 WIB.

**Last 10 runs** (`gh run list -w preview-branch-sync.yml`), all `push` to `main`, all `success`: 41034274735 (`0f8e610`), 41011336557 (`40d0255`), 41011018572 (`eb5b5b1`), 40940241626 (`73db340`), 40937798717 (`8d51da8`), 40937149560 (`3bc7cf2`), 40936303433 (`7cf1893`), 40934636474 (`cfd06e1`), 40917578217 (`72c453f`), 40916908249 (`bc1008b`).

No mismatch, so the workflow is unchanged.
