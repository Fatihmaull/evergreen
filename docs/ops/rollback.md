# Rollback

Who may do what: **an agent proposes the exact command; Fatih (or DevOps with Fatih's explicit go) runs a production rollback.** A rollback changes production without passing the approval gate, so it is treated as a production deploy.

## API Worker

Every `wrangler deploy` creates a Worker *version*. A rollback re-points traffic at an earlier one.

```bash
# find the last good version (newest first); the Created time tells you when
wrangler versions list                      # production
wrangler versions list --name evergreen-api-preview
wrangler deployments list                   # what was live, and when

# roll back (flags as of wrangler 4.153.0)
wrangler rollback <version-id> --message "<why>"                          # production
wrangler rollback <version-id> --name evergreen-api-preview --message "<why>"
```

Then **read what is serving**, not what you sent:

```bash
curl -sS https://evergreen-stellar.pages.dev/api/v1/health      # production
curl -sS https://preview.evergreen-stellar.pages.dev/api/v1/health
```

Since #462, `commit` shows the SHA of the code answering. If the rolled-back version predates #460 the field is absent.

Things to know before you do it:

- **The next merge to `main` that touches `apps/api` deploys forward again**, after Fatih approves. A rollback is not a revert. Revert the bad commit on `main` too, or the next approval redeploys it.
- **Whether a rollback also reverts secrets and plain vars is `undetermined`.** Not exercised on this account. Do not rely on a rollback to undo a bad secret change; fix the secret.
- **Do not roll production back by approving an old run.** An old waiting run redeploys its own old SHA ([`deploy.md`](deploy.md#stale-approvals-deploy-old-code)).
- Production has no database, so a rollback never has a data component today.

## Database

There is no automated rollback, and migrations are forward-only: fix a bad migration with the next numbered file ([`neon-migrations.md`](neon-migrations.md)).

For a destructive mistake **on `preview`**, Neon can restore a branch to an earlier point within the history window, which is **6 hours** on this project: `neonctl branches restore <target> <source>[@timestamp]` with `--preserve-under-name` to keep the replaced branch (flags from `neonctl branches restore --help`, 2026-10-27). **Not exercised yet.** Exercising a restore is a DoD-2 criterion (plan DoD-2: "a Neon backup restore has been exercised") and a 6-hour window will not be enough for production; both are open.

## Pages (the dashboard and the `/api/*` proxy)

A bad dashboard build does not touch the API Worker, and a bad API deploy does not touch Pages. They roll back separately.

- **Fastest:** in the Cloudflare dashboard, project `evergreen-stellar`, Deployments, pick the last good *Production* deployment, **Rollback to this deployment** (Cloudflare's documented Pages rollback; **not exercised** on this account).
- **Find the last good deployment from the CLI:** `wrangler pages deployment list --project-name evergreen-stellar` (the Source column is the commit).
- **Durable:** revert the commit on `main` and let Cloudflare rebuild. A dashboard rollback is overwritten by the next push to `main`.
- `wrangler` has no `pages` rollback command, so this one is a dashboard action by Fatih.
