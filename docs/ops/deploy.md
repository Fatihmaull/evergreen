# Deploy

Source of truth for the triggers is [`.github/workflows/api-deploy.yml`](../../.github/workflows/api-deploy.yml). Read the file when this page and the file disagree; then fix this page.

## What deploys what

| Surface | Trigger | Where it lands | Approval |
|---|---|---|---|
| **API Worker, preview** | **`push` to `main`** that touches `apps/api/**` or the workflow file (restores `main` as the baseline); a `pull_request` from a branch **in this repo** (never a fork) that is **not a draft**, touches those paths, **and carries the label `deploy-preview`**; or `workflow_dispatch` on **any** ref | `evergreen-api-preview` | none |
| **API Worker, production** | `push` to `main` that touches `apps/api/**` or the workflow file; or `workflow_dispatch` on `main`. Runs only after the preview job succeeds (`needs: preview`) | `evergreen-api` | **required: Fatih, in the GitHub Environment `production`** |
| **Scheduler Worker, preview and production** | **Manual only**: `workflow_dispatch` of [`scheduler-deploy.yml`](../../.github/workflows/scheduler-deploy.yml) with `target=preview` or `target=production`. It never runs on a push. The Worker's 15-minute cron lives on the **production** Worker (`apps/scheduler/wrangler.jsonc`), so a production deploy starts the cron at once. | `evergreen-scheduler-preview`, `evergreen-scheduler` | preview none; **production behind the same `production` Environment approval** |
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
2. **Read its commit SHA.** Approving deploys *that run's* SHA, not today's `main`; the guard below refuses it if `main` has moved past it for `apps/api`.
3. Approve the run you mean to ship, normally the newest.
4. Watch the smoke step. It now fails if the commit served is not the commit deployed ([#462](https://github.com/Fatihmaull/evergreen/pull/462), merged `0d7c78d`).

### Stale approvals are refused

`push` and `workflow_dispatch` runs check out the SHA the run was created at, so approving a run created 36 hours ago would deploy the 36-hour-old commit. That is how production gets rolled back by accident. The production job therefore starts with a step, **after** the approval, that compares the run's commit with `main` for `apps/api/**` and the workflow file and **fails the job if they differ** ("main changed apps/api or this workflow after `<sha>`. Reject this run and approve the newest one."). A commit that `main` has passed only in docs, web or engine code still deploys.

How runs queue (observed 2026-10-27 and 2026-10-28): a run **waiting for approval** holds the group `api-deploy-refs/heads/main`; the next run waits behind it, and a still-newer run **replaces** that pending one (the replaced run shows `cancelled`). So approve or reject the **oldest** waiting run first; with the guard, an old one fails at once instead of deploying, and the next run then starts.

**Observed in production since the guard shipped:** it refused four approved runs (listed in [the approvals record](#production-approvals-2026-10-29-to-2026-10-31)), each within 8 seconds of the approval, each because `main` had moved past it for `apps/api`.

Observed before the guard existed: [run 40266644991](https://github.com/Fatihmaull/evergreen/actions/runs/40266644991) was dispatched on `ab74675` and approved 36 hours later, so it redeployed `ab74675`, which happened to be what production already ran.

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

## Production approvals, 2026-10-29 to 2026-10-31

**Fatih confirmed (2026-11-02, relayed by the PM on 2026-11-04) that every approval and rejection in the Grok window, 2026-10-29 07:20 to 2026-10-31, was his.** GitHub records the reviewer as `Fatihmaull` for every one of them, the account all Fatih-side agents share, so **GitHub itself cannot say "personally"**: that part is Fatih's confirmation, and the rule that agents never approve ([`AGENTS.md`](../../AGENTS.md) rule 11) is what stands behind it.

**The counts, verified by DevOps on 2026-11-04** from `actions/runs/<id>/approvals` for every `push` run of `api-deploy.yml` and every run of `scheduler-deploy.yml` since 2026-10-29. The `production` Environment gates **both** workflows, and exactly one scheduler run used it (run 41168994480, approved, 2026-10-31). Windows are by run creation time:

| Window | `api-deploy` | + `scheduler-deploy` (production) | **Approved in total** | **Rejected** |
|---|---|---|---|---|
| **The Grok window**, 2026-10-29 07:20 UTC to 10-31 | 17 (14 deployed + 3 refused by the stale-approval guard) | 1, deployed | **18** (15 deployed, 3 refused) | **7** |
| **From 2026-10-29 00:00 UTC** (the last production run so far was 2026-10-31 06:19) | 19 (15 deployed + 4 refused) | 1, deployed | **20** (16 deployed, 4 refused) | **7** |

These agree with the PM's counts. The earlier "13" was a miscount, and the first version of this section counted `api-deploy` alone (15 deployed, 19 approved), which is why it differed. The runs outside the Grok window: the 4th refusal (`fb4d197`, run 40806680733, 02:29 UTC) and one deployed run (`3e3d73e`, 03:49 UTC) are before 07:20 UTC. Also in the period: **10 cancelled by concurrency** (9 in the Grok window), which had no review.

What each outcome means:

| Outcome | What happened |
|---|---|
| **Approved and deployed** | the production job ran and succeeded |
| **Approved, then refused by the stale-approval guard** | the job started and failed at the step `refuse a commit that main has moved past` |
| **Rejected in the review** | the job never started: `failure`, **zero steps** |
| **Cancelled by concurrency** | a newer run replaced a pending one; no review was made |

The 15 deployed `api-deploy` runs, newest last (`push` events on `main`; the scheduler's production run is under [Scheduler Worker deploys](#scheduler-worker-deploys)):

| UTC created | Run | Commit |
|---|---|---|
| 2026-10-29 03:49 | [40814264461](https://github.com/Fatihmaull/evergreen/actions/runs/40814264461) | `3e3d73e` |
| 2026-10-29 10:19 | [40856711687](https://github.com/Fatihmaull/evergreen/actions/runs/40856711687) | `626823f` |
| 2026-10-29 11:28 | [40865615238](https://github.com/Fatihmaull/evergreen/actions/runs/40865615238) | `954bf72` |
| 2026-10-29 12:52 | [40876924812](https://github.com/Fatihmaull/evergreen/actions/runs/40876924812) | `04a7328` |
| 2026-10-29 13:26 | [40881985435](https://github.com/Fatihmaull/evergreen/actions/runs/40881985435) | `ad3118a` |
| 2026-10-29 15:21 | [40900683022](https://github.com/Fatihmaull/evergreen/actions/runs/40900683022) | `ce99abb` |
| 2026-10-29 15:35 | [40903141751](https://github.com/Fatihmaull/evergreen/actions/runs/40903141751) | `4554665` |
| 2026-10-29 17:03 | [40917578645](https://github.com/Fatihmaull/evergreen/actions/runs/40917578645) | `72c453f` |
| 2026-10-29 19:01 | [40936303350](https://github.com/Fatihmaull/evergreen/actions/runs/40936303350) | `7cf1893` |
| 2026-10-29 19:11 | [40937798838](https://github.com/Fatihmaull/evergreen/actions/runs/40937798838) | `8d51da8` |
| 2026-10-30 05:58 | [41011336564](https://github.com/Fatihmaull/evergreen/actions/runs/41011336564) | `40d0255` |
| 2026-10-30 10:09 | [41038627088](https://github.com/Fatihmaull/evergreen/actions/runs/41038627088) | `30b342a` |
| 2026-10-31 02:59 | [41162373955](https://github.com/Fatihmaull/evergreen/actions/runs/41162373955) | `179fae0` |
| 2026-10-31 03:35 | [41165036693](https://github.com/Fatihmaull/evergreen/actions/runs/41165036693) | `e7fb0aa` |
| 2026-10-31 06:19 | [41176139056](https://github.com/Fatihmaull/evergreen/actions/runs/41176139056) | `4210757` |

### Why three production runs "failed" with no steps

Runs [40916908287](https://github.com/Fatihmaull/evergreen/actions/runs/40916908287) (`bc1008b`, 2026-10-29 16:59), [41038330619](https://github.com/Fatihmaull/evergreen/actions/runs/41038330619) (`08e5114`, 2026-10-30 10:06) and [41163782188](https://github.com/Fatihmaull/evergreen/actions/runs/41163782188) (`f1a598e`, 2026-10-31 03:18) each show the production job as `failure` with **no steps executed**. **Cause: each was rejected in the `production` Environment review by `Fatihmaull`, with a comment naming the newer commit that replaced it.** Read from the run, job and approvals metadata:

| Run | Review | Comment | The run it gave way to |
|---|---|---|---|
| 40916908287 | `rejected` | "superseded by 72c453f" | [40917578645](https://github.com/Fatihmaull/evergreen/actions/runs/40917578645), created 17:03:14Z, success |
| 41038330619 | `rejected` | "Stale: superseded by 30b342a" | [41038627088](https://github.com/Fatihmaull/evergreen/actions/runs/41038627088), created 10:09:10Z, success |
| 41163782188 | `rejected` | "Stale; superseded by e7fb0aa." | [41165036693](https://github.com/Fatihmaull/evergreen/actions/runs/41165036693), created 03:35:29Z, success |

How to tell the three causes apart, so the next failed run takes one look:

- **Rejected review:** production job `failure`, **0 steps**, and `approvals` shows `state: rejected` with the reviewer's comment. The job is marked started at the moment preview finished and completed when the reviewer rejected it (5 to 18 minutes later here).
- **Stale-approval guard:** production job `failure`, but with steps, the failing one named `refuse a commit that main has moved past`, and `approvals` shows `state: approved`. Four runs: `fb4d197` (40806680733), `781e79a` (40850278533), `62d8100` (40861087873), `a7acf6f` (40888186486). The log carries the guard's diffstat and "main changed apps/api or this workflow after `<sha>`. Reject this run and approve the newest one."
- **Concurrency cancel:** run `cancelled`, **no review at all**. A newer run replaced a pending one (10 runs).

The other four rejected runs follow the same pattern and each comment names its replacement: `b5e214c` (40863864691), `1fcfb75` (40867215684, "superseded by run 40876924812 (04a7328), which deploys after 0006 is on prod"), `77b4f2f` (40897723343, "superseded by f508337") and `62e059a` (40899905042, "superseded by ce99abb").

## Production approvals from 2026-11-04

Counted from `actions/runs/<id>/approvals` and the run's jobs; updated as Fatih acts. Everything is the `production` Environment's `Fatihmaull` reviewer. Totals above (Grok window and since 10-29) are unchanged by these rows and run to 2026-10-31.

| Run | Commit | Created (UTC) | Outcome | Counts as |
|---|---|---|---|---|
| [41766591396](https://github.com/Fatihmaull/evergreen/actions/runs/41766591396) | `d15c52f` | 2026-11-04 03:21 | production job `cancelled`, zero steps, **no review recorded**: replaced by the newer run behind it | **cancelled by concurrency** (superseded), not a rejection |
| [41769762578](https://github.com/Fatihmaull/evergreen/actions/runs/41769762578) | `b8f69e4` | 2026-11-04 03:52 | approved by `Fatihmaull`; production job success (14 steps, started 09:02) | **approved, deployed** |
| [41833547148](https://github.com/Fatihmaull/evergreen/actions/runs/41833547148) | `9ba3624` (the 2165 floor, #590) | 2026-11-04 12:56 | waiting for review as of 2026-11-05 07:40 UTC | pending |
| [41969447493](https://github.com/Fatihmaull/evergreen/actions/runs/41969447493) | `96fabde` (0011 merge) | 2026-11-05 04:42 | pending as of 2026-11-05 07:40 UTC | pending |

Subtotal so far, 2026-11-04 onward: **1 approved (1 deployed), 0 rejected, 1 cancelled by concurrency, 2 pending.** Running total since 2026-10-29 00:00 UTC, with those two settled: **21 approved (17 deployed, 4 refused by the guard), 7 rejected**, plus 1 cancelled. A concurrency cancel is not counted as a rejection because GitHub records no review for it; if Fatih meant to reject run 41766591396, it never reached him as a review.

## Scheduler Worker deploys

[`scheduler-deploy.yml`](../../.github/workflows/scheduler-deploy.yml) is manual: `workflow_dispatch` with `target` = `preview` or `production`. A **production** run sits behind the same `production` Environment approval; the first one **creates** the Worker, and its `*/15 * * * *` cron is live the moment the deploy finishes.

| Date (UTC) | Run | Target | Commit | Result |
|---|---|---|---|---|
| 2026-10-31 04:32 | [41168994480](https://github.com/Fatihmaull/evergreen/actions/runs/41168994480) | **production** | `e7fb0aa` | approved by `Fatihmaull`, success; Worker version `2429392b` created 04:33. The Worker's first `scheduler_ticks` row is at 04:45. |
| 2026-10-31 06:20 | [41176200443](https://github.com/Fatihmaull/evergreen/actions/runs/41176200443) | preview | `4210757` | success; the production job was skipped |

Its secrets are in [`secrets.md`](secrets.md#inventory-now-read-2026-11-01-1525-to-1535-utc-names-only): production has `DATABASE_URL` only and **must not** have `TICK_TOKEN`.


## The deployed commit

The workflow injects `DEPLOY_COMMIT` into the Worker (`wrangler deploy --var DEPLOY_COMMIT:<sha>`) and `GET /api/v1/health` reports it as `commit` (#460 and #462, merged 2026-10-28):

- **Preview** injects the **PR head** SHA. On `pull_request`, `github.sha` is GitHub's synthetic merge commit, which exists on no branch.
- **Production** injects `github.sha`, and the smoke step requires the served commit to equal it.
- The value is **not** in `wrangler.jsonc`: a committed value goes stale. `wrangler versions view` shows it as `(hidden)`, so `/health` is the only way to read it.

> **A deploy deletes dashboard-set plain vars.** `wrangler deploy` without `--keep-vars` removes every var not in the config or on the command line before applying. Put plain vars in `wrangler.jsonc` or `--var`; never in the dashboard. Secrets are separate and survive deploys.

### Version metadata

Each `wrangler deploy` in [`api-deploy.yml`](../../.github/workflows/api-deploy.yml) and [`scheduler-deploy.yml`](../../.github/workflows/scheduler-deploy.yml), preview and production, also records the run on the Worker version. The workflows pin `wrangler@4.156.0`. `wrangler deploy --tag` and `--message` were added in wrangler 4.66.0 ([workers-sdk release `wrangler@4.66.0`](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.66.0)); 4.156.0 is the version last seen on a production deploy, and its `deploy --help` still lists both flags.

| Flag | Value | Annotation |
|---|---|---|
| `--tag` | first 7 characters of `github.sha` | `workers/tag` (maximum 100 bytes) |
| `--message` | the full `github.sha`, one space, then `github.run_id` | `workers/message` (truncated at 1000 bytes) |

These are `github.sha`, the commit the job checked out. On an API preview deploy from a pull request, `DEPLOY_COMMIT` is the PR head and `github.sha` is GitHub's merge commit, so the two differ. `DEPLOY_COMMIT` stays a plain var. `wrangler versions view` still shows that var as `(hidden)`.

Wrangler 4.156.0 writes the flags as `annotations["workers/tag"]` and `annotations["workers/message"]`, and reads those same keys back from the Workers versions API:

```
GET /accounts/{account_id}/workers/scripts/{script_name}/versions
GET /accounts/{account_id}/workers/scripts/{script_name}/versions/{version_id}
```

The list's published schema example (Cloudflare API, read 2026-11-10) shows `id`, `metadata`, and `number` and does not show `annotations`. The Version model that documents the keys is `GET /accounts/{account_id}/workers/workers/{worker_id}/versions`: `annotations["workers/tag"]` and `annotations["workers/message"]`. A live call of either endpoint was not made here. `script_name` is `evergreen-api`, `evergreen-api-preview`, `evergreen-scheduler`, or `evergreen-scheduler-preview`. The list docs say the first item is the latest version.

```bash
# Names only: CLOUDFLARE_API_TOKEN (repo secret), CLOUDFLARE_ACCOUNT_ID (repo variable).
curl -sS \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/evergreen-api/versions" \
  | jq '.result.items[] | {id, tag: .annotations["workers/tag"], message: .annotations["workers/message"]}'
```

One version, after taking `id` from that list:

```bash
curl -sS \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/evergreen-api/versions/${VERSION_ID}" \
  | jq '.result.annotations["workers/tag"], .result.annotations["workers/message"]'
```

## Deploying a PR to preview: the `deploy-preview` label

Preview is `main` unless somebody says otherwise. To test a PR's `apps/api` code on the real preview Worker:

```bash
gh pr edit <number> --add-label deploy-preview      # deploys now, and on every later push to that PR
gh pr edit <number> --remove-label deploy-preview   # stop deploying on pushes
```

- **Drafts never deploy**, even with the label; mark the PR ready first. Adding any other label does nothing.
- **It is still one Worker.** Last writer wins, so before you claim "verified on preview", read `GET /api/v1/health` and quote `commit`: it is your PR's **head** SHA if you were the last to deploy, someone else's, or `main`'s.
- **To put preview back on `main`:** `gh workflow run api-deploy.yml -R Fatihmaull/evergreen --ref preview` (the `preview` branch equals `main`, and a dispatch from it can never queue a production run). A merge to `main` does it automatically.
- The label is created in the repo (`deploy-preview`, green).

## Pages

- The project is Git-connected, so a GitHub workflow is not involved. Production deploys from `main`. The build command is documented in [`AGENTS.md`](../../AGENTS.md) rule 10 (Node 24, `corepack enable && pnpm install --frozen-lockfile && pnpm build && node apps/web/build.mjs`); the dashboard's actual setting was not read (`undetermined`).
- `apps/dashboard/public/` is never committed. To change the site, change `apps/web/`.
- Every pushed branch builds a preview at `<branch>.evergreen-stellar.pages.dev`. Those previews talk to the **preview** Worker. The API's CSRF check accepts exactly one origin per environment (`DASHBOARD_ORIGIN`), and for preview that is `https://preview.evergreen-stellar.pages.dev`, so **signed-in flows only work on that alias**, not on a branch preview.
- The git branch `preview` is kept equal to `main` by [`preview-branch-sync.yml`](../../.github/workflows/preview-branch-sync.yml): on every push to `main` it fast-forwards `preview` (never forced; a diverged `preview` fails the job loudly). Before that it was moved by hand and was 9 commits behind on 2026-10-27. Cloudflare's Git integration then rebuilds the `preview` alias. See [`preview-vs-production.md`](preview-vs-production.md).

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

Expected on 2026-11-01: **production and preview both** answer `/health` 200 with their `environment` and the deployed `commit` (both served `4210757…` that day), `/watchlist` **401** `UNAUTHENTICATED` (production has had a database and the auth secrets since 2026-10-29; before that it answered 503), `/nope` 404 JSON. A 200 `text/html` from `/api/*` means the proxy binding is missing.
