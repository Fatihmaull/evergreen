# Deploy

Source of truth for the triggers is [`.github/workflows/api-deploy.yml`](../../.github/workflows/api-deploy.yml). Read the file when this page and the file disagree; then fix this page.

## What deploys what

| Surface | Trigger | Where it lands | Approval |
|---|---|---|---|
| **API Worker, preview** | `pull_request` from a branch **in this repo** (never a fork) that touches `apps/api/**` or the workflow file, **including drafts**; or `workflow_dispatch` on **any** ref | `evergreen-api-preview` | none |
| **API Worker, production** | `push` to `main` that touches `apps/api/**` or the workflow file; or `workflow_dispatch` on `main` | `evergreen-api` | **required: Fatih, in the GitHub Environment `production`** |
| **Dashboard (Pages)** | Cloudflare's Git integration, not a GitHub workflow. Push to `main` = a production deployment. A push to **any other branch** = a preview deployment | project `evergreen-stellar` | none |
| **Pages Function proxy** | Part of the Pages build (`functions/` at the repo root) | with the dashboard | none |
| Router Rust CI, engine cron, flake hunt | Other workflows; they test or run, they do not deploy | n/a | n/a |

Each API job runs `pnpm --filter @evergreen/api run --if-present test` first, then `wrangler deploy` (`--env preview` for preview). Production then smoke-tests `https://evergreen-stellar.pages.dev/api/v1/health`.

Two deploys of the same ref never run at once and never cancel a running one (`concurrency: api-deploy-<ref>`, `cancel-in-progress: false`). A run that is **waiting** for approval is replaced when a newer run of the same ref queues: observed 2026-10-27, run 40440043390 (`a54a637`) was cancelled when run 40443658337 (`a2337eb`) queued behind it.

## The production approval gate

Set 2026-10-26 (Fatih's decision, K3), so that **no production secret is ever set while a merge can deploy unreviewed**:

| Setting | Value | Why |
|---|---|---|
| Required reviewer | `Fatihmaull` | the only person who may approve |
| Prevent self-review | off | Fatih merges and approves as the same account; turning it on would make production undeployable |
| Admin bypass | **off** | an admin cannot skip the hold |
| Deployment branches | `main` only | a branch cannot reach `production` |

Read it back at any time:

```bash
gh api repos/Fatihmaull/evergreen/environments/production \
  --jq '{bypass: .can_admins_bypass, rules: [.protection_rules[] | {type, reviewers: [.reviewers[]?.reviewer.login]}], branches: .deployment_branch_policy}'
```

**Agents never approve a deployment and never modify a workflow to bypass the production gate** ([`AGENTS.md`](../../AGENTS.md) hard rule 11). Every Fatih-side agent pushes and calls the API as `Fatihmaull`, so GitHub cannot tell an agent's approval from Fatih's. The rule is the only thing that separates them.

### How to approve

1. Open the waiting run (Actions, then **API deploy**, then the run marked *Waiting*).
2. **Read its commit SHA.** Approving deploys *that run's* SHA, not today's `main` (see below).
3. Approve only the **newest** waiting run.
4. Watch the smoke step. It now fails if the commit served is not the commit deployed ([#462](https://github.com/Fatihmaull/evergreen/pull/462), merged `0d7c78d`).

### Stale approvals deploy old code

`workflow_dispatch` and `push` runs check out the SHA the run was created at. A run created 36 hours ago and approved today **deploys the 36-hour-old commit**. That is how production is rolled back by accident. Observed in the commissioning run below: it was dispatched 2026-10-26 on `ab74675` and approved 2026-10-27, so it redeployed `ab74675`, which happened to be what production already ran.

Whether to make the workflow refuse a run whose SHA is behind `main` for `apps/api` is a decision for Fatih, not yet made: see **Decisions** in [`preview-vs-production.md`](preview-vs-production.md#decisions-for-fatih). Until then the rule is: approve the newest run, and read its SHA first.

### Commissioning record (2026-10-26 to 2026-10-27)

A gate nobody watched fail is a decoration, so it was exercised in both directions. [Run 40266644991](https://github.com/Fatihmaull/evergreen/actions/runs/40266644991), `workflow_dispatch` on `main` at `ab74675`:

| Observation | Result |
|---|---|
| Before the gate was set, `production` had **no protection rules** | The job already named `environment: production`, so the gate existed and gated nothing. Every merge deployed unreviewed. |
| Preview job | Started 2026-10-26 03:58:11Z, finished 03:58:44Z, success, **did not wait** |
| Production job | Held in `waiting` for **about 36 hours**; `pending_deployments` listed `Fatihmaull` as the only reviewer and `can_approve: true` |
| Approval | `Fatihmaull`, state `approved`, comment "good enough" |
| Production job after approval | Started 2026-10-27 16:16:11Z, finished 16:16:50Z, success; Worker version `e9cc479b-40ef-48ec-ab92-b929cc3a4caa` created 16:16:44Z |

So the hold holds, the approval path works, and the preview deploy is unaffected.

## The deployed commit

The workflow injects `DEPLOY_COMMIT` into the Worker (`wrangler deploy --var DEPLOY_COMMIT:<sha>`) and `GET /api/v1/health` reports it as `commit` (#460 and #462, merged 2026-10-28):

- **Preview** injects the **PR head** SHA. On `pull_request`, `github.sha` is GitHub's synthetic merge commit, which exists on no branch.
- **Production** injects `github.sha`, and the smoke step requires the served commit to equal it.
- The value is **not** in `wrangler.jsonc`: a committed value goes stale. `wrangler versions view` shows it as `(hidden)`, so `/health` is the only way to read it.

> **A deploy deletes dashboard-set plain vars.** `wrangler deploy` without `--keep-vars` removes every var not in the config or on the command line before applying. Put plain vars in `wrangler.jsonc` or `--var`; never in the dashboard. Secrets are separate and survive deploys.

## Pages

- The project is Git-connected, so a GitHub workflow is not involved. Production deploys from `main`. The build command is documented in [`AGENTS.md`](../../AGENTS.md) rule 10 (Node 24, `corepack enable && pnpm install --frozen-lockfile && pnpm build && node apps/web/build.mjs`); the dashboard's actual setting was not read (`undetermined`).
- `apps/dashboard/public/` is never committed. To change the site, change `apps/web/`.
- Every pushed branch builds a preview at `<branch>.evergreen-stellar.pages.dev`. Those previews talk to the **preview** Worker. The API's CSRF check accepts exactly one origin per environment (`DASHBOARD_ORIGIN`), and for preview that is `https://preview.evergreen-stellar.pages.dev`, so **signed-in flows only work on that alias**, not on a branch preview.
- The git branch `preview` is not deployed by any workflow. It was fast-forwarded to `main` by hand. As of 2026-10-27 it is **9 commits behind `main`** (`51320ef` vs `0da486a`). See [`preview-vs-production.md`](preview-vs-production.md).

## Manual deploys

```bash
# Preview from any ref (a human or DevOps with Fatih's go)
gh workflow run api-deploy.yml -R Fatihmaull/evergreen --ref <branch>

# Production from main: queues a run that WAITS for Fatih
gh workflow run api-deploy.yml -R Fatihmaull/evergreen --ref main
```

A production run queued this way waits for approval like any other. Do not queue one you do not intend Fatih to approve: it sits there for up to 30 days and can be approved stale.

## Health checks

```bash
for h in evergreen-stellar.pages.dev preview.evergreen-stellar.pages.dev; do
  for p in /api/v1/health /api/v1/watchlist /api/v1/nope; do
    printf '%s%s -> ' "$h" "$p"; curl -sS -m 15 -w ' [%{http_code}]\n' "https://$h$p"
  done
done
```

Expected on 2026-10-27: production `/health` 200 `environment: production`, `/watchlist` **503** `UPSTREAM_UNAVAILABLE` (production deliberately has no database or auth secrets), `/nope` 404 JSON; preview `/health` 200 `environment: preview`, `/watchlist` **401** `UNAUTHENTICATED`, `/nope` 404 JSON. A 200 `text/html` from `/api/*` means the proxy binding is missing.
