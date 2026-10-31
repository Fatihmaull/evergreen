# Runbook: apply migration 0009 (preview, then production)

File: `apps/api/db/0009_connect_and_scheduler_ticks_select.sql` (Rakha, [#551](https://github.com/Fatihmaull/evergreen/pull/551)). It does two things:

1. `GRANT CONNECT ON DATABASE <current_database()> TO eg_api, eg_scheduler`.
2. `GRANT SELECT ON scheduler_ticks TO eg_api` (F11 heartbeat alert, #517).

`eg_scheduler` keeps INSERT only on `scheduler_ticks` (no SELECT, K1). The file is idempotent. Apply it after 0008. Re-running 0008 drops the `scheduler_ticks` grant, so re-run 0009 after any 0008 re-run.

Names only in this file. No connection strings or secrets. `DATABASE_URL` comes from the environment and holds the **owner** connection for the branch being changed.

## 1. Preconditions

- [ ] #551 is merged to `main`. Apply only from a fresh checkout of `origin/main`, never from the PR branch.
- [ ] `git log -1 --format=%H -- apps/api/db/0009_connect_and_scheduler_ticks_select.sql` on `origin/main` shows the merge commit. Record it.
- [ ] 0008 is already applied on the target branch (roles `eg_api` and `eg_scheduler` exist and are not superusers).

## 2. Snapshot / PITR

Neon Free keeps 6 hours of history ([`backup-and-restore.md`](backup-and-restore.md)). Before each apply, write down the UTC time (or LSN) so a point-in-time branch restore is possible. 0009 only adds grants, so the REVOKE rollback in step 6 is the normal undo. PITR is the fallback.

## 3. Apply on Neon `preview`

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0009_connect_and_scheduler_ticks_select.sql
```

`-v ON_ERROR_STOP=1` is required: without it psql exits 0 after a failed statement. CONNECT is a no-op on preview, because it was granted by hand.

## 4. Verify (as owner, same session)

```sql
SELECT has_database_privilege('eg_api',       current_database(), 'CONNECT');   -- t
SELECT has_database_privilege('eg_scheduler', current_database(), 'CONNECT');   -- t
SELECT has_table_privilege('eg_api',       'scheduler_ticks', 'SELECT');        -- t
SELECT has_table_privilege('eg_scheduler', 'scheduler_ticks', 'SELECT');        -- f

BEGIN;
SET LOCAL ROLE eg_api;
SELECT * FROM scheduler_ticks ORDER BY ticked_at DESC LIMIT 1;  -- succeeds (a row, or 0 rows on an empty table)
ROLLBACK;

BEGIN;
SET LOCAL ROLE eg_scheduler;
SELECT * FROM scheduler_ticks ORDER BY ticked_at DESC LIMIT 1;  -- ERROR: permission denied for table scheduler_ticks
ROLLBACK;
```

Every result must match the comment. If one doesn't, stop and do not touch production.

## 5. Production

Repeat steps 2, 3 and 4 against the production branch with the production owner connection. The checks and expected results are the same. Report the results, the UTC apply time, and the `main` commit.

**Out of scope:** switching the production Worker's `DATABASE_URL` to the `eg_api` role is a separate step. It needs its own approval from Fatih and is not part of this runbook.

## 6. Rollback

```sql
REVOKE SELECT ON scheduler_ticks FROM eg_api;
-- Only if CONNECT was not present before 0009 (it already was on preview):
DO $$ BEGIN EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM eg_api, eg_scheduler', current_database()); END $$;
```

Revoking CONNECT locks both roles out. Do not run it on a branch where a Worker already connects as one of them.

(drafted with Fatih's PM assistant)
