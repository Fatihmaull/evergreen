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

## The infrastructure in one table (read 2026-11-01; later cells are dated)

**Production has been live since 2026-10-29**, as recorded on 2026-11-01: auth secrets, Neon Launch, the sender domain `mail.evergreenstellar.biz.id`, the schema through 0009, and (from 2026-10-31) the production scheduler Worker.

The API serving commit and the Pages build, binding and branch-control cells were re-read on **2026-11-08 22:41 WIB** (15:41 UTC). Neon project metadata and a production `scheduler_ticks` aggregate were read on **2026-11-08 22:46 WIB** (15:46 UTC). The commit in the API rows is what `GET /api/v1/health` returned. The scheduler Worker commit was not read and is `undetermined`. The Neon branch `preview` was not queried.

| Thing | State | How it was read |
|---|---|---|
| Cloudflare | One account, shared with three unrelated Pages projects (`focu-studio-launchpad`, `eco-route-finder`, `ecoroute`). Do not touch those. | `wrangler pages project list` |
| Worker `evergreen-api` (production) | Six secrets (names in [`secrets.md`](secrets.md)), `fetch` and `scheduled` handlers (cron `*/15 * * * *` for the F10/F11 checks). Secret count, handlers and cron are the 2026-11-01 reading. Historical serving commit that day: `4210757…`. On 2026-11-08 22:41 WIB, `GET /api/v1/health` on `https://evergreen-stellar.pages.dev` returned HTTP 200, `service` `evergreen-api`, `environment` `production`, `commit` `816690834c32a264f564426d37a7afc075fecd33`. [API deploy run 41992369846](https://github.com/Fatihmaull/evergreen/actions/runs/41992369846) for that commit completed success; its production job ran 2026-11-08 22:20:48–22:21:18 WIB. The approver is not named here. | 2026-11-01: `wrangler secret list`, `wrangler versions view`, `/api/v1/health`, a tail of the 15:30 cron. 2026-11-08: `curl` of `/api/v1/health`; `gh run view 41992369846` |
| Worker `evergreen-api-preview` | Five secrets, no cron; preview is `main` unless a PR carries the label `deploy-preview` ([`deploy.md`](deploy.md)). Secrets and cron are the 2026-11-01 reading. On 2026-11-08 22:41 WIB, `GET /api/v1/health` on `https://preview.evergreen-stellar.pages.dev` returned HTTP 200, `service` `evergreen-api`, `environment` `preview`, `commit` `816690834c32a264f564426d37a7afc075fecd33`. | 2026-11-01: same Worker reads as the production row. 2026-11-08: `curl` of the preview host's `/api/v1/health` |
| Worker `evergreen-scheduler` (production) | Deployed 2026-10-31 04:33 UTC; `DATABASE_URL` only (no `TICK_TOKEN`); cron `*/15`. Those Worker facts are the 2026-11-01 reading. The Worker commit was not re-read. Historical tick count that day: 139 `scheduler_ticks` rows to 2026-11-01 15:15 UTC. Production aggregate on 2026-11-08 22:46 WIB: 806 rows, first tick 2026-10-31 11:45:23.105 WIB, last tick 2026-11-08 22:45:28.203 WIB, database time 22:46:47.977 WIB, staleness 1m 19.77s, last ledger 5625817. Gap figures are in the section below. `ok = false` is 0. Rows with `ok` NULL were not counted. | 2026-11-01: `wrangler secret list`, `scheduler_ticks` read-only. 2026-11-08: read-only aggregate `SELECT` on production `scheduler_ticks` (SQL in the PR) |
| Worker `evergreen-scheduler-preview` | `DATABASE_URL`, `TICK_TOKEN`; no cron, ticks by `POST /tick`. | `wrangler secret list` |
| Pages project `evergreen-stellar` | Git-connected, production branch `main` (2026-11-01, confirmed again 2026-11-08). The 2026-11-01 cell said every pushed branch also builds a preview unless Fatih's branch control (then pending his confirmation, [`pages-builds.md`](pages-builds.md)) was in place. That pending claim is superseded by the 2026-11-08 22:41 WIB read: GitHub source `Fatihmaull/evergreen`; production deployments enabled; preview branch control `custom`, include only `preview`, excludes empty; build command `corepack enable && pnpm install --frozen-lockfile && pnpm build && node apps/web/build.mjs`; output directory `apps/dashboard/public`; root directory an empty string; `NODE_VERSION` `plain_text` `24` on the production Pages config and on the preview Pages config. This cell is that project config. | 2026-11-01: `wrangler pages deployment list`. 2026-11-08: Cloudflare connector, read-only GET of Pages project `evergreen-stellar` |
| Pages Function proxy | [`functions/api/[[path]].ts`](../../functions/api/%5B%5Bpath%5D%5D.ts): `/api/*` to service binding `API`. On 2026-11-01 the binding targets were verified by behaviour on both hosts, and the binding configuration itself was `undetermined`. The 2026-11-08 22:41 WIB Pages project GET reads the configuration: the production config's `API` binding targets service `evergreen-api`; the preview config's `API` binding targets service `evergreen-api-preview`. Both bindings' `environment` field is `production`, the named Worker's script environment. | 2026-11-01: `curl` on both hosts. 2026-11-08: the Pages project GET, and `curl` of both `/api/v1/health` endpoints |
| Neon project `evergreen` | `icy-sun-89705623`, Postgres 18, AWS `ap-southeast-1`, `launch_v3`, re-read 2026-11-08 22:46 WIB. **Point-in-time history retention is 21600 seconds (6 hours).** K7, a 7-day history window, is still not set. **Snapshot retention is separate: the schedule is daily at 19:00 UTC (02:00 WIB), kept 604800 seconds (7 days).** This read found 7 automatic snapshots from 2026-11-02 through 2026-11-08 at 02:00 WIB, plus manual snapshots `pre-0010-20261104` and `pre-0011-20261105`. Neither retention was changed. Whether a restore drill has been exercised is `undetermined` from this read. Autoscaling 0.25 to 8 CU, roles `neondb_owner`, `eg_api`, `eg_scheduler`, and "12 tables on each" are the 2026-11-01 reading. `production` `br-proud-mountain-aon0gpyl` is ready, the default, and unprotected. `preview` `br-billowing-waterfall-aoa9ok0v` is its child, `current_state` `archived`, `state_changed_at` 2026-11-06 18:19:34 WIB. That is the Neon branch. The preview API host had already answered `/api/v1/health` at 22:41 WIB. Preview's database was not queried, and what a query would do to the archived state is `undetermined`. Production probes the same evening are compatible with 0010 and 0011 and lack 0012, 0013 and 0014 markers. That is not proof every older file was applied. Preview's migrations are unknown. | 2026-11-01: `neonctl projects get`, `branches list`, `snapshots list`, read-only SQL. 2026-11-08: Neon read-only `describe_project`, `list_branches`, `get_snapshot_schedule`, `list_snapshots`; production migration markers only. Preview not queried |
| GitHub | Environment `production`: Fatih the only required reviewer, admin bypass off, deploys from `main` only. Repo secrets `CLOUDFLARE_API_TOKEN` and `NOTION_TOKEN`; repo variable `CLOUDFLARE_ACCOUNT_ID`. | `gh api repos/Fatihmaull/evergreen/environments`, `.../actions/secrets`, `.../actions/variables` |

## Production `scheduler_ticks` gaps (read 2026-11-08 22:46 WIB)

Read-only aggregate on production only. Preview was not queried. The scheduler Worker commit was not read. The root cause of the gaps is `undetermined`. A read-only logs investigation is ongoing. This note does not call the gaps a code defect, and it does not change the floor.

| | |
|---|---|
| Rows | 806, from 2026-10-31 11:45:23.105 WIB (`2026-10-31T04:45:23.105Z`) to 2026-11-08 22:45:28.203 WIB (`2026-11-08T15:45:28.203Z`) |
| Database time | 2026-11-08 22:46:47.977 WIB (`2026-11-08T15:46:47.977Z`); staleness 1m 19.77s |
| Last ledger | 5625817 |
| Worst ledger gap | 541, twice |
| Median ledger gap | 180 |
| Negative ledger gaps | 0 |
| Zero ledger gaps | 0 |
| `ok = false` | 0. The count of `ok` NULL was not queried, so this is not a claim that every row succeeded |
| Worst elapsed gap | 45m 07.49s |
| Elapsed gaps over 20 minutes | 5 |

The ops record through 2026-11-04 00:15 UTC had one gap over 20 minutes: about 45:02 and 541 ledgers, ending 2026-11-03 15:45 WIB. That gap is the first row. The other four are later than that record.

| Gap end (WIB) | Elapsed | Ledgers |
|---|---|---|
| 2026-11-03 15:45:28 | 45m 02.54s | 541 |
| 2026-11-06 00:45:23 | 29m 53.72s | 359 |
| 2026-11-07 03:00:26 | 29m 57.10s | 359 |
| 2026-11-07 03:30:34 | 30m 07.25s | 362 |
| 2026-11-07 04:15:41 | 45m 07.49s | 541 |

The documented floor is 2165 ledgers. `4 × 541 = 2164`, one ledger under that floor. A worst ledger gap of 542 would make `4 × 542 = 2168`, above the documented floor. This read does not change the floor.

On this production read: 3 `watch_items`, 2 active, 0 with autopilot enabled, 0 with a non-null threshold. The minimum threshold actually in use is unset, so this read does not establish an actual protection threshold and does not establish that DoD-2 is met. No autopilot row enabled now is not evidence that a historical extend never ran. When the 14-day window starts is `undetermined`.

## Undetermined (settle these before relying on them)

- (Resolved 2026-11-08 22:41 WIB: the Pages build settings and the Pages `API` service-binding targets this list left `undetermined` on 2026-11-01. The table has the build command, output directory `apps/dashboard/public`, root directory an empty string, `NODE_VERSION` `plain_text` `24` on both Pages configs, preview branch control `custom` including only `preview` with excludes empty, and the binding targets `evergreen-api` and `evergreen-api-preview`. Source: Cloudflare connector, read-only GET of Pages project `evergreen-stellar`. `wrangler` still cannot read them. The resolved fields are the project config.)
- **Other Workers in the account.** `wrangler` has no command that lists them. Only the two API Workers and the two scheduler Workers were inspected.
- (Resolved 2026-11-04: production's `ALERTS_SEND` is exactly `send` and the production `DATABASE_URL` roles are `eg_api` and `eg_scheduler`, both set by Fatih himself, K4 and K5. See [`secrets.md`](secrets.md).)
- **Pages build quota.** About 50 builds a day were measured and the Free-plan limit is 500 a month; this account's own limit is `undetermined` (see [`pages-builds.md`](pages-builds.md)).
- **Which build the `preview.evergreen-stellar.pages.dev` alias serves.** It is believed to be the latest deployment of the git branch `preview` (the handoff says so, and `DASHBOARD_ORIGIN` for preview is that exact origin). The newest 25 deployments contain none from that branch, so the CLI window cannot confirm it.
- **Workers plan and usage pooling.** Fatih reads them in the dashboard. Workers Logs amounts are recorded in [`observability.md`](observability.md).
- **Scheduler Worker commit**, as of 2026-11-08 22:46 WIB. The production tick aggregate above is rows in `scheduler_ticks`, not the Worker commit.
- **Gap root cause**, the start of the 14-day DoD-2 window, and whether a restore drill has been exercised. The 22:46 WIB snapshot list does not say a drill never happened.
- **Preview migrations**, and what a query would do to Neon `preview` while `current_state` is `archived`. Preview was not queried on 2026-11-08. The production migration note is only compatibility with 0010 and 0011 and absent 0012, 0013 and 0014 markers.
