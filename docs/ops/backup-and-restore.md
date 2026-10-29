# Backup and restore for DoD-2: proposal

**Status: decided by Fatih 2026-10-28.** Option **A** (Neon Launch with scheduled snapshots) happens **together with his "ya" for the production secrets, not before**. Until then option **C**: one manual snapshot on `production` before each production migration, logged in [`neon-migrations.md`](neon-migrations.md#before-each-production-migration-one-manual-snapshot-fatih-2026-10-28). Nothing else changes before the beta. Production has no database today and Neon `production` has no tables, so there is nothing to lose yet.

The requirement ([`PHASE2-PLAN.md`](../../phase-2/PHASE2-PLAN.md) DoD-2): *"a Neon backup restore has been exercised"*, alongside the failure-mode list of `PH2-E4-05`. The problem: the Free plan keeps **6 hours** of history (21600 s, read from the project 2026-10-27), which is a recovery window for a bad deploy, not a backup.

## What Neon offers (read 2026-10-28)

| | Free | Launch | Scale |
|---|---|---|---|
| History window (point-in-time restore) | **6 hours** | up to 7 days, $0.20/GB-month | up to 30 days, $0.20/GB-month |
| Snapshots (manual) | **1** | 100 | 100 |
| Scheduled snapshots (daily/weekly/monthly) | **no** (paid plans) | yes | yes |
| Snapshot retention | manual: until deleted | scheduled: 35 days default and maximum | same |
| Snapshot storage | n/a | $0.09/GB-month (the first scheduled snapshot in full, later ones incrementally) | same |
| Compute | 100 CU-hours/project included | $0.106/CU-hour, no monthly minimum stated | $0.222/CU-hour |
| Storage | 1 GB/project | $0.35/GB-month | $0.35/GB-month |
| Scale-to-zero | always on after 5 min, cannot be disabled | can be disabled | configurable |
| Branches | 10/project | 10/project, extra $1.50/branch-month | 25/project |

Sources: `neon.com/docs/introduction/plans`, `.../introduction/branch-restore`, `.../guides/backup-restore`. Business and Agent plans were not evaluated.

**This project today:** the database is about 32 MB (`preview`), so storage costs are cents at every tier. `production` is the **only root branch** and `preview` is its **child** (`parent_id` read 2026-10-28). Neon restores a root branch in place; a child branch does not support instant restore, so **a restore drill cannot be rehearsed on `preview`**. `production` is also **not protected** (`protected: false`); whether protection is available on Free is `undetermined`.

## Options

### A. Neon Launch, with scheduled snapshots (recommended)

Upgrade the project, enable a daily snapshot schedule on `production` (35-day retention), and the history window goes from 6 hours to up to 7 days.

- **Cost, with the assumptions shown:** compute is the only real line. At 0.25 CU, a 15-minute tick that keeps the database awake about 8 hours a day is about 60 CU-hours a month, or **about $6**; always-on at 0.25 CU is about 182 CU-hours, or **about $19** (the design in #461 reaches the same figure). Storage, history and snapshots are **cents** at 32 MB. Preview's own compute adds to it unless it idles. These are estimates from list prices; the plan page states no monthly minimum, and checkout is the only proof.
- **Gains:** restore to any point in 7 days; a daily snapshot for 35 days; no secret leaves Neon; no new code or workflow.
- **Costs:** vendor-held, so an account or region problem loses both the data and its backup. Snapshots restore only into Neon.

### B. Scheduled `pg_dump` to object storage

A job dumps the database on a schedule to an encrypted object in Cloudflare R2, which is also the exit route if Neon is ever left.

- **Cost:** R2 storage is small at this size (price not read here: `undetermined`). Free of Neon plan changes, which is its main attraction: it works on Free.
- **Risks, each real here:**
  - **GitHub's scheduled cron is unreliable.** This repo measured it delivering about **11% of its declared cadence** (median gap 136 minutes, from `packages/core/src/config.ts`). A "daily" backup would skip days. A Cloudflare cron could trigger a `workflow_dispatch` instead; that is more moving parts.
  - **It needs a database credential in CI.** A read-only role in a dedicated GitHub Environment `backup` (no reviewers, `main` only) keeps it away from pull-request jobs, but it widens the secret surface [`secrets.md`](secrets.md) already flags.
  - **Never as a workflow artifact:** this repository is public, so artifacts are downloadable by anyone. The dump must be encrypted before it leaves the runner, with the key held outside the repo.
  - `pg_dump` must be Postgres 18 or newer to read a Postgres 18 server; the runner's default client is older, so the job installs a newer one.
  - The restore is slower (replay a dump) than a Neon branch swap.

### C. Free plan stopgap: one manual snapshot, taken by hand

Before each production migration, replace the single manual snapshot (`neonctl snapshots create --branch production --name pre-migration`). Covers a bad migration, not a bad week.

- **Cost:** $0. **Gives:** one restore point, as old as the last migration. **Does not** meet "a backup restore exercised" for a 30-day DoD-2 window by itself.

### Recommendation

**A, upgraded at the moment production gets its first secret** (the first real data), not before. Add **B only if Fatih wants an off-Neon copy**, as a later card, because it adds a credential, a scheduler and an encryption key for a risk A does not remove. **C** is the bridge until then. Decide the date of the upgrade together with the production-secrets "ya"; the two travel together.

## Restore drill (what DoD-2 needs exercised)

The drill proves three numbers, not that a button exists: **how much data a restore loses** (RPO), **how long it takes** (RTO), and **that the application still connects after it**.

Run on `production` data only once production holds data, **never in place** (`--finalize` is for a real restore, not a drill):

1. **Baseline.** Record, with the read-only helper from [`neon-migrations.md`](neon-migrations.md): row counts for every table; `sum` of the fee ledger amounts; the structural `shape.sql` output; the time.
2. **Snapshot.** `neonctl snapshots create --branch production --name drill-<yyyymmdd>` (on Launch, the daily schedule supplies this).
3. **Restore into a new branch, without finalizing:** `neonctl snapshots restore <snapshot-id> --target-branch production --name drill-<yyyymmdd>`. Per the docs the production compute is untouched until a finalize; **confirm that on the first run by checking `production` still answers**, because that sentence is the drill's safety assumption.
4. **Verify the restored branch** with step 1's queries: counts and fee-ledger sum equal the baseline (or differ exactly by what happened after the snapshot), and `shape.sql` matches.
5. **Connect as the application would.** A preview Worker (or a local `psql` over the pooled endpoint) reaches the drill branch with a role that has only the app's grants.
6. **Time it** from step 2 to a passing step 4: that is the measured RTO.
7. **Delete the drill branch** (`neonctl branches delete`) and record the result in `docs/evidence/` (append-only, dated) and against the `PH2-E4-05` failure mode "database loss".

Also exercise the **history-window** path once on a throwaway root branch: `neonctl branches restore <target> <source>@<timestamp>` (add `--preserve-under-name`, which Neon requires when restoring a branch onto its own history). Whether a throwaway root branch can be created cheaply is `undetermined` until tried.

## Drill run 2026-10-29 (DevOps, Neon API)

Plan: the org (`org-delicate-violet-65283800`) is on **Launch** (billing page, 2026-10-29). Project `icy-sun-89705623` (Postgres 18, `aws-ap-southeast-1`), history window `history_retention_seconds: 21600` (6 hours). One manual snapshot exists: `snap-fancy-bar-aonzvey1` (`pre-schema-0001-0005`, from `production`, 2026-10-29 10:00:21 UTC, taken **before** the schema was applied). Neither restore touched `production` or `preview`; both drill branches were new branches, never finalized onto `production`.

| Step | What | Result |
|---|---|---|
| Point-in-time | `POST /branches` with `parent_id` = `production`, `parent_timestamp` 10:48:33 UTC, one read-write endpoint → `br-delicate-wave-ao33tub1` (`drill-e0-12-pitr`) | created 10:50:33 UTC, ready **about 12 s** later (polled 17:50:45 WIB). Neon resolved the parent point to 10:06:18 UTC, the last write (no writes since the migrations) |
| Verify | the read-only shape query from [`neon-migrations.md`](neon-migrations.md) (columns, constraints, indexes, enums, triggers, function md5, tables, extensions) on the drill branch and on `production` | **12 tables, whole shape identical** to `production` and to the post-migration record. Query took 4 s |
| Snapshot | `POST /snapshots/snap-fancy-bar-aonzvey1/restore` `{name: drill-e0-12-snapshot}` → `br-round-bread-ao31oi6p` | created 10:51:01 UTC, ready **about 7 s** later (17:51:08 WIB), `restored_from: snap-fancy-bar-aonzvey1` |
| Verify | shape query | **0 tables**, extensions equal the pre-migration record: the snapshot restores the state it was taken from |
| Clean up | `DELETE /branches/<id>` for both | both 404 afterwards; branch list is back to `preview`, `production` (17:51:28 WIB) |

**Measured RTO** (create to a verified shape): under 30 s each, on an almost empty database. **RPO** for point-in-time: the last commit inside the 6-hour window. Not yet exercised: row-count/fee-ledger comparison (production holds no rows yet) and connecting with an app-grants role (no least-privilege role yet, #385). **Next:** take a post-migration snapshot or turn on the Launch snapshot schedule, since the only snapshot predates the schema.

## Decisions (Fatih, 2026-10-28)

1. **Backup: option A**, executed with the production-secrets "ya". **Option C until then.**
2. **When to upgrade:** with the production-secrets "ya".
3. **Protect the `production` Neon branch on Free: `undetermined`, probably not available.** Neon's protected-branches page says the feature is for "paid plans" (Launch: up to 2 protected branches, Scale: up to 5), does not list Free, and documents no CLI or API way to set it (`neonctl branches` has no such subcommand, verified 2026-10-29). It is set in the console (Branches, select the branch, **Protect**). Fatih can settle Free by looking for the Protect button; if it is absent, the Launch upgrade brings it. What protection stops: deletion, reset from the parent, archiving for inactivity. The page does not say it blocks restore or role changes. `production` is not protected today (`protected: false`).
