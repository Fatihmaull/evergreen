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

## The infrastructure in one table (read 2026-10-27)

| Thing | State | How it was read |
|---|---|---|
| Cloudflare | One account, shared with three unrelated Pages projects (`focu-studio-launchpad`, `eco-route-finder`, `ecoroute`). Do not touch those. | `wrangler pages project list` |
| Worker `evergreen-api` (production) | No secrets. Plain vars: `ENVIRONMENT`, `DASHBOARD_ORIGIN`, `DEPLOY_COMMIT` (injected since [#462](https://github.com/Fatihmaull/evergreen/pull/462), merged `0d7c78d`; reaches production with the first approved deploy after it). | `wrangler secret list`, `wrangler versions view` |
| Worker `evergreen-api-preview` | Secrets: `CHALLENGE_SIGNING_KEY`, `DATABASE_URL`, `EMAIL_API_KEY`, `SIGNIN_CODE_PEPPER`. Plain vars: `ENVIRONMENT`, `DASHBOARD_ORIGIN`, `EMAIL_FROM`. | same |
| Pages project `evergreen-stellar` | Git-connected. Production = branch `main`. Every pushed branch also builds a preview. | `wrangler pages deployment list` |
| Pages Function proxy | [`functions/api/[[path]].ts`](../../functions/api/%5B%5Bpath%5D%5D.ts): `/api/*` to service binding `API`. Binding targets verified by behaviour: production `/api/v1/health` answers `environment: production`, preview answers `preview`. The binding configuration itself is dashboard-only: `undetermined`. | `curl` on both hosts |
| Neon project `evergreen` | `icy-sun-89705623`, AWS `ap-southeast-1`, Postgres 18.6, Free plan, history retention **6 hours**. Branches `production` (default, **empty**) and `preview`. Only the `neondb_owner` role exists on both. | `neonctl projects get`, `neonctl branches list`, `neonctl roles list` |
| GitHub | Environment `production`: Fatih the only required reviewer, admin bypass off, deploys from `main` only. Repo secrets `CLOUDFLARE_API_TOKEN` and `NOTION_TOKEN`; repo variable `CLOUDFLARE_ACCOUNT_ID`. | `gh api repos/Fatihmaull/evergreen/environments`, `.../actions/secrets`, `.../actions/variables` |

## Undetermined (settle these before relying on them)

- **Pages build settings** (build command, Node version, root directory, preview-branch control) and **the Pages service-binding configuration.** Neither is readable with `wrangler`; the build command is documented in [`AGENTS.md`](../../AGENTS.md) rule 10 but the dashboard was not read. Needs Fatih to read the project's Settings page or a dashboard read-out.
- **Other Workers in the account.** `wrangler` has no command that lists them. Only the two API Workers were inspected.
- **Pages build quota.** About 50 builds a day were measured and the Free-plan limit is 500 a month; this account's own limit is `undetermined` (see [`pages-builds.md`](pages-builds.md)).
- **Which build the `preview.evergreen-stellar.pages.dev` alias serves.** It is believed to be the latest deployment of the git branch `preview` (the handoff says so, and `DASHBOARD_ORIGIN` for preview is that exact origin). The newest 25 deployments contain none from that branch, so the CLI window cannot confirm it.
- **Workers plan and usage pooling.** Fatih reads them in the dashboard. Workers Logs amounts are recorded in [`observability.md`](observability.md).
