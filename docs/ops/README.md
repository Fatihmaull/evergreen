# docs/ops — how Evergreen is deployed, migrated and rolled back

Owner: **DevOps** (`F · OPS`, [`phase-2/kickoff/DEVOPS.md`](../../phase-2/kickoff/DEVOPS.md)). These pages replace the runbooks that lived outside the repo (`/workspace/devops/evergreen/` on a box that is gone). Knowledge that only exists outside the repo is the thing this folder exists to prevent.

| Page | Answers |
|---|---|
| [`deploy.md`](deploy.md) | What deploys what, what triggers it, how production approval works, what a stale approval does |
| [`neon-migrations.md`](neon-migrations.md) | Applying a `apps/api/db` file to Neon, the `psql` exit-code trap, how to verify |
| [`secrets.md`](secrets.md) | Every secret by **name**, where it lives, who may set it, and the accepted token risk |
| [`rollback.md`](rollback.md) | Undoing a bad API Worker deploy or a bad Pages build |
| [`observability.md`](observability.md) | Workers Logs: what is logged, what is deliberately not, the privacy rule, included amounts, the budget alert |
| [`pages-builds.md`](pages-builds.md) | The Pages build quota, the measurement, and the setting that fixes it |
| [`backup-and-restore.md`](backup-and-restore.md) | Proposal: how DoD-2's "a backup restore has been exercised" can be met, with costs and the drill |
| [`preview-vs-production.md`](preview-vs-production.md) | Why "verified on preview" may not mean "verified on `main`", and the options to fix it |

## Rules that apply to every page

1. **No secret value appears here, in a PR, in chat or in argv.** Names only. A value is passed by naming an environment variable or typed at a prompt.
2. **Agents never approve a deployment and never modify a workflow to bypass the production gate** ([`AGENTS.md`](../../AGENTS.md) hard rule 11).
3. **Testnet only until DoD-2** ([`AGENTS.md`](../../AGENTS.md) hard rule 1). Nothing here changes that.
4. **Every fact below was read on a date, with the command that read it.** Where a fact could only be inferred, the page says `undetermined` and says what would settle it.
5. **Cloudflare and Neon are logged in by Fatih, never by an agent.** `wrangler login`, `neonctl auth` and `gh auth refresh -s workflow` are his to run. An agent never asks for or pastes a token.

## The infrastructure in one table (read 2026-11-01; API commit and Pages settings re-read 2026-11-08)

**Production has been live since 2026-10-29**: auth secrets, Neon Launch, the sender domain `mail.evergreenstellar.biz.id`, the schema through 0009, and (from 2026-10-31) the production scheduler Worker.

The API serving commit and the Pages build, binding and branch-control cells were re-read on **2026-11-08 22:41 WIB** (15:41 UTC). Every other cell remains the 2026-11-01 reading. The commit in the API rows is what `GET /api/v1/health` returned. The scheduler Worker commit, `scheduler_ticks`, and which Neon migrations are applied live were not read on 2026-11-08; those current values are `undetermined`.

| Thing | State | How it was read |
|---|---|---|
| Cloudflare | One account, shared with three unrelated Pages projects (`focu-studio-launchpad`, `eco-route-finder`, `ecoroute`). Do not touch those. | `wrangler pages project list` |
| Worker `evergreen-api` (production) | Six secrets (names in [`secrets.md`](secrets.md)), `fetch` and `scheduled` handlers (cron `*/15 * * * *` for the F10/F11 checks). Secret count, handlers and cron are the 2026-11-01 reading. Historical serving commit that day: `4210757…`. On 2026-11-08 22:41 WIB, `GET /api/v1/health` on `https://evergreen-stellar.pages.dev` returned HTTP 200, `service` `evergreen-api`, `environment` `production`, `commit` `816690834c32a264f564426d37a7afc075fecd33`. [API deploy run 41992369846](https://github.com/Fatihmaull/evergreen/actions/runs/41992369846) for that commit completed success; its production job ran 2026-11-08 22:20:48–22:21:18 WIB. The approver is not named here. | 2026-11-01: `wrangler secret list`, `wrangler versions view`, `/api/v1/health`, a tail of the 15:30 cron. 2026-11-08: `curl` of `/api/v1/health`; `gh run view 41992369846` |
| Worker `evergreen-api-preview` | Five secrets, no cron; preview is `main` unless a PR carries the label `deploy-preview` ([`deploy.md`](deploy.md)). Secrets and cron are the 2026-11-01 reading. On 2026-11-08 22:41 WIB, `GET /api/v1/health` on `https://preview.evergreen-stellar.pages.dev` returned HTTP 200, `service` `evergreen-api`, `environment` `preview`, `commit` `816690834c32a264f564426d37a7afc075fecd33`. | 2026-11-01: same Worker reads as the production row. 2026-11-08: `curl` of the preview host's `/api/v1/health` |
| Worker `evergreen-scheduler` (production) | Deployed 2026-10-31 04:33 UTC; `DATABASE_URL` only (no `TICK_TOKEN`); cron `*/15`; 139 `scheduler_ticks` rows to 2026-11-01 15:15 UTC. | `wrangler secret list`, `scheduler_ticks` read-only |
| Worker `evergreen-scheduler-preview` | `DATABASE_URL`, `TICK_TOKEN`; no cron, ticks by `POST /tick`. | `wrangler secret list` |
| Pages project `evergreen-stellar` | Git-connected, production branch `main` (2026-11-01, confirmed again 2026-11-08). The 2026-11-01 cell said every pushed branch also builds a preview unless Fatih's branch control (then pending his confirmation, [`pages-builds.md`](pages-builds.md)) was in place. That pending claim is superseded by the 2026-11-08 22:41 WIB read: GitHub source `Fatihmaull/evergreen`; production deployments enabled; preview branch control `custom`, include only `preview`, excludes empty; build command `corepack enable && pnpm install --frozen-lockfile && pnpm build && node apps/web/build.mjs`; output directory `apps/dashboard/public`; root directory an empty string; `NODE_VERSION` `plain_text` `24` on the production Pages config and on the preview Pages config. This cell is that project config. | 2026-11-01: `wrangler pages deployment list`. 2026-11-08: Cloudflare connector, read-only GET of Pages project `evergreen-stellar` |
| Pages Function proxy | [`functions/api/[[path]].ts`](../../functions/api/%5B%5Bpath%5D%5D.ts): `/api/*` to service binding `API`. On 2026-11-01 the binding targets were verified by behaviour on both hosts, and the binding configuration itself was `undetermined`. The 2026-11-08 22:41 WIB Pages project GET reads the configuration: the production config's `API` binding targets service `evergreen-api`; the preview config's `API` binding targets service `evergreen-api-preview`. Both bindings' `environment` field is `production`, the named Worker's script environment. | 2026-11-01: `curl` on both hosts. 2026-11-08: the Pages project GET, and `curl` of both `/api/v1/health` endpoints |
| Neon project `evergreen` | `icy-sun-89705623`, AWS `ap-southeast-1`, Postgres 18, **Launch since 2026-10-29**, history retention still **6 hours** (Fatih sets 7 days himself, K7, pending), autoscaling 0.25 to 8 CU. Branches `production` (default, only root, unprotected) and `preview` (its child); **12 tables on each**; roles `neondb_owner`, `eg_api`, `eg_scheduler`; a daily snapshot of `production` at 19:00 UTC kept 7 days. | `neonctl projects get`, `branches list`, `snapshots list`, read-only SQL |
| GitHub | Environment `production`: Fatih the only required reviewer, admin bypass off, deploys from `main` only. Repo secrets `CLOUDFLARE_API_TOKEN` and `NOTION_TOKEN`; repo variable `CLOUDFLARE_ACCOUNT_ID`. | `gh api repos/Fatihmaull/evergreen/environments`, `.../actions/secrets`, `.../actions/variables` |

## Undetermined (settle these before relying on them)

- (Resolved 2026-11-08 22:41 WIB: the Pages build settings and the Pages `API` service-binding targets this list left `undetermined` on 2026-11-01. The table has the build command, output directory `apps/dashboard/public`, root directory an empty string, `NODE_VERSION` `plain_text` `24` on both Pages configs, preview branch control `custom` including only `preview` with excludes empty, and the binding targets `evergreen-api` and `evergreen-api-preview`. Source: Cloudflare connector, read-only GET of Pages project `evergreen-stellar`. `wrangler` still cannot read them. The resolved fields are the project config.)
- **Other Workers in the account.** `wrangler` has no command that lists them. Only the two API Workers and the two scheduler Workers were inspected.
- (Resolved 2026-11-04: production's `ALERTS_SEND` is exactly `send` and the production `DATABASE_URL` roles are `eg_api` and `eg_scheduler`, both set by Fatih himself, K4 and K5. See [`secrets.md`](secrets.md).)
- **Pages build quota.** About 50 builds a day were measured and the Free-plan limit is 500 a month; this account's own limit is `undetermined` (see [`pages-builds.md`](pages-builds.md)).
- **Which build the `preview.evergreen-stellar.pages.dev` alias serves.** It is believed to be the latest deployment of the git branch `preview` (the handoff says so, and `DASHBOARD_ORIGIN` for preview is that exact origin). The newest 25 deployments contain none from that branch, so the CLI window cannot confirm it.
- **Workers plan and usage pooling.** Fatih reads them in the dashboard. Workers Logs amounts are recorded in [`observability.md`](observability.md).
