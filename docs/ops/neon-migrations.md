# Neon migrations

## Current status (read 2026-11-01 15:25 UTC, read-only transactions on both branches)

| File | `preview` (`br-billowing-waterfall-aoa9ok0v`) | `production` (`br-proud-mountain-aon0gpyl`) | Evidence read |
|---|---|---|---|
| `schema.sql` | applied | applied | 12 public tables on each: `allowance_observations`, `auth_rate_counters`, `fee_ledger`, `jobs`, `observations`, `scheduler_ticks`, `sessions`, `signin_codes`, `users`, `wallet_challenges`, `wallets`, `watch_items` |
| `0002` | applied | applied | `jobs_daily_limit_idx` includes `user_id` |
| `0003` | applied | applied | `auth_rate_counters`, `wallet_challenges` present |
| `0004` | applied | applied | `users.reactivated_at` present |
| `0005` | applied | applied | `scheduler_ticks` present |
| `0006` | applied | applied | 6 `jobs.*_submitted_*` columns |
| `0007` | applied | applied | `fee_ledger_job_subsidy` columns `job_id,evergreen_fee,network_fee,margin,fully_refunded,subsidised` |
| `0008` | applied 2026-10-29 21:52 WIB | applied 2026-10-29 22:04 WIB, after roles `eg_api`/`eg_scheduler` were created | triggers `fee_ledger_no_update_delete`, `fee_ledger_no_truncate`; roles `eg_api` (13 table grants), `eg_scheduler` (3) on each |
| `0009` (`0009_connect_and_scheduler_ticks_select.sql`, #551) | applied 2026-10-31 ~09:59 WIB ([`apply-0009.md`](apply-0009.md)) | applied, same time | read 2026-11-01: `CONNECT` is `true` for both roles; `eg_api` has `SELECT` on `scheduler_ticks` and no write; `eg_scheduler` has no table-level privilege |
| `0010` ([#570](https://github.com/Fatihmaull/evergreen/pull/570)), `0011` ([#571](https://github.com/Fatihmaull/evergreen/pull/571)), `0012` ([#572](https://github.com/Fatihmaull/evergreen/pull/572)) | **not applied** | **not applied** | the PRs are open and none has a "ready to merge" from Rakha; #570 has a changes-requested review. Procedure: [Pre-approved production applies](#pre-approved-production-applies-0010-0011-0012-fatih-2026-11-01) |

The two branches are at the same migration level, and the **migration ledger still does not exist** (`PH2-E2-07` is a card), so this is inferred from objects. Project plan: Neon **Launch** since 2026-10-29. The production scheduler is writing `scheduler_ticks`: 139 rows on 2026-11-01 15:25 UTC, the first at 2026-10-31 04:45 and the newest at 15:15 (one every 15 minutes); preview holds 473 rows from the earlier tests.

### Which role each production Worker uses

The secrets' names don't say, and their values can't be read. The database can: on 2026-11-01 DevOps ran a read-only session as the owner and sampled `pg_stat_activity` every 0.5 s from 15:30:18 to 15:30:35 UTC, around the 15:30 cron (the API cron's `scheduledTime` was 15:30:16). Pooled sessions as **`eg_api`** (seen from 15:30:18) and **`eg_scheduler`** (from 15:30:23) were present, and **none as `neondb_owner`** apart from the sampling session.

- This is **evidence, not a read of the secret**: the sessions are pooler connections that sit idle, so it shows both roles in use around the cron, not which Worker holds which session.
- The repo **records no switch**. [`switch-database-url-eg_api.md`](switch-database-url-eg_api.md) still says "plan only", and [`apply-0009.md`](apply-0009.md) says the switch needs its own approval. The API Worker's `Secret Change` versions at 2026-10-31 03:52 UTC (an hour after 0009) and 10:41 UTC, and the scheduler's at 05:02 UTC, are the candidates. Who changed what is unrecorded and is for the PM to confirm.
- The earlier note here ("the role is undetermined, no session was seen in the 2026-10-30 polls") is superseded.

### Open K1 gap: `eg_scheduler` can still name `ticked_at`

Fatih's K1 (2026-11-01, via CEF): **the scheduler must not be able to write its own heartbeat time**, because `scheduler_ticks.ticked_at` is the DoD-2 evidence for the scheduler gap. **Today it can** (read 2026-11-01 on both branches): `has_column_privilege('eg_scheduler','scheduler_ticks','ticked_at','INSERT')` is `true`, from 0008's column grant `(ticked_at, observed_ledger)`. Postgres needs no privilege on a column an `INSERT` leaves to its default, so the tick works without it, and the scheduler's own statement only names `observed_ledger`. A revoke has to arrive as a new numbered file (0010), because 0008 is already applied.

**Security consequence for this runbook:** 0008 still contains `GRANT INSERT (ticked_at, …)`. **Re-running 0008 alone re-opens the forging path** until 0009 and 0010 are re-run. After any re-run of 0008, re-run 0009 and then 0010 immediately; treat it as a security step, not a convenience.

Rakha's agent (CER) owns the schema and writes the SQL under [`apps/api/db/`](../../apps/api/db/). **DevOps applies it to Neon** and verifies it. When a PR adds a file under `apps/api/db/`, DevOps applies it to the **preview** branch and checks it; production is a separate, gated step (below).

## Where things are (read 2026-10-27; plan, roles, retention and compute updated 2026-11-01)

| | |
|---|---|
| Project | `evergreen`, id `icy-sun-89705623`, AWS `ap-southeast-1`, Postgres 18, **Launch since 2026-10-29 09:53 UTC** (`launch_v3`; billing periods are calendar months) |
| Branches | `preview` (a **child** of `production`) and `production` (the default and only root; **not protected**). Both have 12 tables. |
| Roles | 2026-10-27: only `neondb_owner`. Since 2026-10-29: `neondb_owner`, `eg_api`, `eg_scheduler` on both branches. |
| Database | `neondb` on both |
| History retention | **21600 s (6 hours), still, on Launch** (read 2026-11-01). Launch allows up to 7 days at $0.20/GB-month; the project has not been changed. The daily snapshots (below) are the older restore points. |
| Compute | autoscaling **0.25 to 8 CU** (project default, changed from 2 with the plan); suspend timeout at the default (5 minutes) |
| Migration tracking | **none.** There is no migrations table; "which migrations are applied" can only be inferred from the structure. |

Read with: `neonctl projects get icy-sun-89705623 --org-id <org> --output json`, `neonctl branches list --project-id icy-sun-89705623 --org-id <org>`, `neonctl roles list ...`. (`--org-id` is required once the account has an organization; `neonctl projects list` without it opens an interactive prompt.)

## Applied state of `preview` (verified 2026-10-28)

`schema.sql`, `0002`, `0003`, `0004` and `0005` are applied, and the result is **structurally identical to a clean build of those five files**: same columns, constraints, indexes, enums, triggers and function bodies. Method in [Verify](#verify). The only difference found was `fips_mode`, which belongs to the `pgcrypto` extension (1.4 on Postgres 18; the local reference ran Postgres 16) and is not drift.

| File | Applied to `preview` | Evidence |
|---|---|---|
| `schema.sql` | yes | 11 tables present, matching the reference build |
| `0002_jobs_daily_limit_per_user.sql` | yes | `jobs_daily_limit_idx` is `(user_id, network, contract_id, pulled_at) WHERE kind = 'extend-now' AND pull_tx_hash IS NOT NULL`, the file's definition, not the cross-user one from `schema.sql` |
| `0003_auth_rate_counters_wallet_challenges.sql` | yes | `auth_rate_counters(key PK, count NOT NULL DEFAULT 0)` and `wallet_challenges(id PK, session_hash bytea FK to sessions(id_hash) ON DELETE CASCADE, expires_at)` |
| `0004_users_reactivated_at.sql` (#456) | yes, **2026-10-28**, `psql -v ON_ERROR_STOP=1 --single-transaction` exit 0 (`ALTER TABLE`, `COMMENT`) | `users.reactivated_at` is `timestamptz`, nullable, no default, with the file's column comment; the one preview user row is `NULL`; the whole-schema diff above was repeated with 0004 in the reference build and still differs only by `fips_mode` |
| `0005_scheduler_ticks.sql` (#465) | yes, **2026-10-28**, from `main` at `6c9478c`, `psql -v ON_ERROR_STOP=1 --single-transaction` exit 0 (`CREATE TABLE`, `CREATE INDEX`) | `scheduler_ticks`: `id bigint GENERATED ALWAYS AS IDENTITY` PK, `ticked_at timestamptz NOT NULL DEFAULT now()`, `observed_ledger bigint NOT NULL CHECK (> 0)`, index on `(ticked_at)`; zero rows; whole-schema diff with 0005 in the reference build differs only by `fips_mode` |
| `0006` (#466, submitted hashes) | **applied 2026-10-29**: preview 19:58 WIB, production 19:59 WIB (from `04a7328`, blob `48472ae`), one transaction each, Neon WS driver | 6 nullable columns on `jobs` (`{pull,extend,refund}_submitted_hash` text, `{pull,extend,refund}_submitted_expires_at` timestamptz) present on both branches, still 12 tables |
| `0007` (#478, network-fee evidence views) | **applied 2026-10-29**: preview 21:52 WIB, production 21:52 WIB (from `85918dc`, blob `679cc56`), one transaction each, Neon WS driver | `fee_ledger_job_balance` and `fee_ledger_job_subsidy` replaced on both branches; subsidy columns `job_id,evergreen_fee,network_fee,margin,fully_refunded,subsidised`; still 12 tables |
| `0008` (#479, roles and grants) | **preview only, 2026-10-29 21:52 WIB** (from `a7acf6f`, blob `178cf04`), plus `GRANT CONNECT ON DATABASE neondb TO eg_api, eg_scheduler`. **Production: applied 2026-10-29 22:04 WIB** once the roles existed (snapshot `snap-spring-butterfly-ao3sy187` before) | preview: triggers `fee_ledger_no_update_delete` and `fee_ledger_no_truncate`; `eg_api` and `eg_scheduler` have CONNECT, no CREATE on `public`, only the file's table and column grants |

**The migration ledger does not exist yet.** #464 added only its card (`PH2-E2-07`, a `schema_migrations` table written by each file); until that table is built, this table is the record of what ran where.

**Production** (`br-proud-mountain-aon0gpyl`) got `schema.sql` + `0002`-`0005` on **2026-10-29 at about 17:01 WIB**, applied from `main` at `211ff128`, on Fatih's yes. Each file ran as a single transaction with stop-on-error (Neon WS driver). Result: **12 tables**, and the full shape is identical to `preview`. `0006` followed at 19:59 WIB (row above); `0007` followed at 21:52 WIB; `0008` followed at 22:04 WIB after the roles were created.

Preview holds a little test data (a user, a session, sign-in codes and rate counters from login tests). Counts only were read.

## The `psql` trap: always `-v ON_ERROR_STOP=1`

```text
$ psql --single-transaction -f bad.sql          # CREATE a; SELECT nope(); CREATE b;
exit=0   tables created=0                       # failed and rolled back, and exited 0
$ psql --single-transaction -v ON_ERROR_STOP=1 -f bad.sql
exit=3   tables created=0
```

Reproduced 2026-10-27 on Postgres 16.15. Without `ON_ERROR_STOP`, psql keeps going after an error, the final `COMMIT` becomes a `ROLLBACK`, and the exit code is **0**, so a migration that applied nothing reads as success. [`apps/api/db/NOTES.md`](../../apps/api/db/NOTES.md) shows the command without the flag; this page is the correct one. Do not trust the exit code of a migration that ran without it. (Whether the earlier applications of 0002 and 0003 hit this was checked: they did not, see the table above.)

## Procedure: apply a file to `preview`

1. **Read the SQL.** Numbering is strict (`0004_<name>.sql` after `0003`), and a file is never edited after it is applied; the next change is a new number.
2. **Connect without putting the connection string in argv or on screen.** Define this once in your shell. It asks `neonctl` for the string and turns it into `PG*` environment variables inside one command:

   ```bash
   neon_env() {  # usage: neon_env preview
     local uri; uri="$(neonctl connection-string --project-id icy-sun-89705623 \
       --org-id org-delicate-violet-65283800 --branch "$1" \
       --database-name neondb --role-name neondb_owner 2>/dev/null)" || return 1
     eval "$(NEON_URI="$uri" python3 -I -c '
   import os, shlex
   from urllib.parse import urlparse, parse_qs, unquote
   u = urlparse(os.environ["NEON_URI"]); q = parse_qs(u.query)
   out = {"PGHOST": u.hostname, "PGPORT": str(u.port or 5432), "PGUSER": unquote(u.username or ""),
          "PGPASSWORD": unquote(u.password or ""), "PGDATABASE": u.path.lstrip("/"),
          "PGSSLMODE": q.get("sslmode", ["require"])[0]}
   if "channel_binding" in q: out["PGCHANNELBINDING"] = q["channel_binding"][0]
   for k, v in out.items(): print("export %s=%s" % (k, shlex.quote(v)))')"
   }
   ```

3. **Check the target before you write.** Read-only first:

   ```bash
   neon_env preview && PGOPTIONS='-c default_transaction_read_only=on' \
     psql -X -tA -c "select current_database(), version()" \
                 -c "select string_agg(tablename, ', ' order by tablename) from pg_tables where schemaname = 'public'"
   ```

4. **Apply, with the flag, and look at the exit code:**

   ```bash
   neon_env preview && psql -X -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0004_<name>.sql; echo "exit=$?"
   ```

   `exit=0` is required, but **not sufficient**: go on to Verify.
5. **Verify** (below), then record it in the PR that added the file: file name, branch, the object-level evidence.

Never run a migration against `production` without Fatih's explicit "ya", and **take a snapshot first** (next section). Production waits on a least-privilege app role, append-only grants on `fee_ledger`, and the production approval gate ([`deploy.md`](deploy.md)).

## Verify

**1. Object-level:** query the objects the file creates and compare to the SQL (an index's `indexdef`, a table's columns, constraints and foreign keys), as the table above does.

**2. Whole-schema drift:** build the files into a throwaway local Postgres and diff the structure against Neon. This catches an object the file did not create and a file that never applied.

```bash
export LC_ALL=en_US.UTF-8                      # macOS: without a valid locale, postmaster aborts at startup
# Pick a free port FIRST. 54329 was already held by another project's Postgres on 2026-10-27.
PORT=55871; lsof -nP -iTCP:$PORT -sTCP:LISTEN && echo "port busy: set PORT to a free one before continuing"
D=$(mktemp -d); initdb -D "$D" -U t -A trust >/dev/null
pg_ctl -D "$D" -o "-p $PORT -c unix_socket_directories='' -c listen_addresses=127.0.0.1" -l "$D.log" -w start
psql "host=127.0.0.1 port=$PORT user=t dbname=postgres" -c "create database ref"
for f in schema.sql 0002_*.sql 0003_*.sql; do   # every file, in order
  psql "host=127.0.0.1 port=$PORT user=t dbname=ref" -q -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/$f
done
```

Save this as `shape.sql`:

```sql
select 'col  '||table_name||'.'||column_name||' '||data_type||' null='||is_nullable||' def='||coalesce(column_default,'-') from information_schema.columns where table_schema='public' order by table_name, column_name;
select 'con  '||conrelid::regclass||' '||conname||' '||pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace and contype<>'n' order by 1;
select 'idx  '||indexdef from pg_indexes where schemaname='public' order by indexname;
select 'enum '||t.typname||': '||string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_type t join pg_enum e on e.enumtypid=t.oid group by t.typname order by 1;
select 'trg  '||tgrelid::regclass||' '||tgname from pg_trigger where not tgisinternal order by 1;
select 'fn   '||proname||' md5='||md5(prosrc) from pg_proc where pronamespace='public'::regnamespace order by 1;
```

```bash
psql "host=127.0.0.1 port=$PORT user=t dbname=ref" -tA -f shape.sql > shape.ref
neon_env preview && PGOPTIONS='-c default_transaction_read_only=on' psql -X -tA -f shape.sql > shape.preview
diff shape.ref shape.preview && echo identical
pg_ctl -D "$D" stop -m fast && rm -rf "$D" "$D.log"
```

Expected diff on 2026-10-27: one line, `fn   fips_mode ...`, from `pgcrypto`. Anything else is drift: stop and report it. (`contype<>'n'` skips Postgres 18's named NOT NULL constraints, which older Postgres does not list.)

## What this procedure does not give you

- **No migration ledger.** There is no table recording which files ran, so the answer comes from the diff above, not from a lookup. Adding one is a schema decision for Rakha (CER); DevOps recommends it before production.
- **CI does not lock the SQL.** It does not apply `apps/api/db` to anything, so a file that does not apply is discovered at the Neon apply (flagged as a follow-up on #440).
- **No rollback script.** Migrations are forward-only; see [`rollback.md`](rollback.md).

## Pre-approved production applies: 0010, 0011, 0012 (Fatih, 2026-11-01)

Fatih has pre-approved applying these three files to **production**, in this order after 0009, on **three conditions, all required**:

1. **The PR is merged.** Merging belongs to Rakha: **K2 (Fatih, 2026-11-01): DevOps never merges a `rakhargo`-authored PR unless Rakha has written "ready to merge" on it**, and never approves a deployment.
2. **It is applied and verified on `preview` first.**
3. **A snapshot is taken before each production apply**: created and listed first, and recorded in the log below.

Any other file, or a file that fails a check below, is not covered: stop and report to the PM.

### Before and after: the grants comparison

Save as `grants.sql`. It lists every column, table, database and schema privilege `eg_api` and `eg_scheduler` hold. Run it on a branch **before** the apply and **after**; the difference must be exactly the `GRANT` and `REVOKE` statements in the file, and nothing else.

```sql
select 'col '||r||' '||c.relname||'.'||a.attname||' '||p
from unnest(array['eg_api','eg_scheduler']) r
cross join pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join unnest(array['SELECT','INSERT','UPDATE']) p
where c.relkind in ('r','p') and has_column_privilege(r, c.oid, a.attnum, p)
order by 1;
select 'tbl '||r||' '||c.relname||' '||p
from unnest(array['eg_api','eg_scheduler']) r
cross join pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) p
where c.relkind in ('r','p') and has_table_privilege(r, c.oid, p)
order by 1;
select 'db '||r||' CONNECT='||has_database_privilege(r, current_database(), 'CONNECT')||' CREATE='||has_database_privilege(r, current_database(), 'CREATE') from unnest(array['eg_api','eg_scheduler']) r;
select 'schema '||r||' public CREATE='||has_schema_privilege(r, 'public', 'CREATE') from unnest(array['eg_api','eg_scheduler']) r;
```

**Baseline, read 2026-11-01 15:35 UTC:** 267 lines on **both** branches, identical: 247 column lines, 16 table lines, and `CONNECT=true CREATE=false` on the database and `CREATE=false` on `public` for both roles. The relevant `eg_scheduler` lines are `scheduler_ticks.observed_ledger INSERT` and `scheduler_ticks.ticked_at INSERT`, the latter being the K1 gap.

### Each file

Apply only from a **fresh checkout of `origin/main` at the merge commit** (record the commit and the file's blob), never from the PR branch.

| File | What must be true after the apply, on `preview` first |
|---|---|
| **0010** `scheduler_ticks` gets `rpc_ms`, `ok` | `rpc_ms integer NULL` with `CHECK (>= 0)`; `ok boolean NOT NULL DEFAULT true`; `observed_ledger` nullable; every existing row `ok = true`; the named checks present. **K1 gate: `has_column_privilege('eg_scheduler','scheduler_ticks','ticked_at','INSERT')` must be `false`.** `observed_ledger`, `rpc_ms` and `ok` are `true`; `eg_scheduler` still has no table-level `SELECT`, `UPDATE` or `DELETE`; `eg_api` still `SELECT`. **If `ticked_at` is still `true`, the merged file still lets the scheduler write its own heartbeat time: do not apply it to production, and report to the PM.** At the head of #570 read on 2026-11-01 (`23905b0`) the file reads `GRANT INSERT (ticked_at, observed_ledger, rpc_ms, ok)`, which would leave it `true`, so the check is live. |
| **0011** alert outbox and preferences | tables `alert_outbox` and `alert_preferences` (14 public tables), with the constraints and the two partial indexes the file defines; the grants comparison differs by exactly the file's grant lines for `eg_scheduler` and `eg_api`, and `eg_scheduler` gains nothing on the auth or ledger tables |
| **0012** per-user autopilot dedupe | `jobs_autopilot_uq` is `UNIQUE (user_id, network, contract_id, autopilot_window) WHERE kind = 'autopilot'`, same name, no other index changed, **no grant change** (the comparison shows no difference) |

Also, after each: the whole-schema comparison from [Verify](#verify) (extend the reference build with the new file; the only difference allowed is `fips_mode`), and the table count.

### Applying to production

```bash
P=icy-sun-89705623; O=org-delicate-violet-65283800
neonctl snapshots create --branch production --name pre-<file>-<yyyymmdd> --project-id $P --org-id $O
neonctl snapshots list --project-id $P --org-id $O                    # it must be listed before the next line
neon_env production && psql -X -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/<file>.sql; echo "exit=$?"
```

`exit=0` is required and **not sufficient**: run the checks in the table, the grants comparison and the whole-schema comparison, then log the apply and tell CEF and Rakha on the PR.

### Apply log (from 2026-11-01)

| File | Branch | UTC time | Applied from `main` at | Snapshot | Result |
|---|---|---|---|---|---|
| (none yet) | | | | | |

## Before each production migration: a manual snapshot (Fatih, 2026-10-28; Launch since 2026-10-29)

The project has been on Launch since 2026-10-29, so the Free limit of one manual snapshot no longer applies: **take a new named snapshot before every production apply and keep the old ones.** A daily schedule runs as well (below).

```bash
P=icy-sun-89705623; O=org-delicate-violet-65283800
neonctl snapshots create --branch production --name pre-<migration-file>-<yyyymmdd> --project-id $P --org-id $O
neonctl snapshots list --project-id $P --org-id $O      # confirm it exists BEFORE you migrate
```

Snapshots exist only on root branches, and `production` is the only root (Neon refuses one on `preview`). Record every snapshot here, in the PR or ops note that applies the migration.

| Date (UTC) | Migration applied next | Snapshot name | Created by |
|---|---|---|---|
| 2026-10-29 10:00 | schema.sql + 0002-0005 | `pre-schema-0001-0005` (`snap-fancy-bar-aonzvey1`) | DevOps |
| 2026-10-29 11:07 | (post-schema baseline) | `post-schema-0001-0005-20261029` (`snap-bold-brook-ao0wyvhr`) | DevOps |
| 2026-10-29 12:58 | 0006 | `pre-0006-20261029` (`snap-sweet-tree-ao8i2oue`) | DevOps |
| 2026-10-29 14:52 | 0007 (+0008 once roles exist) | `pre-0007-0008-20261029` (`snap-spring-butterfly-ao3sy187`) | DevOps |
| **none** | **0009**, applied to production 2026-10-31 ~02:59 UTC | **no manual snapshot was taken.** The nearest restore point was the scheduled `br-proud-mountain-aon0gpyl-20261030-190006` (`snap-quiet-frog-aobgi618`), about 8 hours earlier. 0009 only adds grants, so the `REVOKE` rollback in `apply-0009.md` was the real undo. Recorded as a departure from this rule. | DevOps |

**Schedule (read 2026-11-01 with `neonctl snapshots schedule get --branch production`):** daily at 19:00 UTC (02:00 WIB), each kept 7 days (`604800 s`). Three scheduled snapshots exist (2026-10-29, 10-30, 10-31 19:00 UTC); `preview` has no schedule and cannot have one (not a root).

## Compute budget on the Free plan (historical: the project left Free on 2026-10-29)

Neon Free allows **100 CU-hours per project per month**, shared by every branch's compute (`neon.com/docs/introduction/plans`, read 2026-10-28). The compute here is 0.25 CU (the endpoint minimum; observed average 0.256 while active) and suspends after **5 idle minutes, which cannot be changed on Free**. The billing period ran 2026-10-22 to 2026-11-01 and had used **0.57 CU-hours** on 2026-10-28.

A scheduler that touches the database every N minutes wakes it every N minutes. Whether the 5 idle minutes before suspension count as active time is **not stated in Neon's docs**. It was **measured here on 2026-10-28** (below): they do count. Both readings are kept for comparison (30.4 days, 0.25 CU, 10 s of work per tick):

| Tick every | CU-h per month, idle window **billed** | idle window **not billed** |
|---|---|---|
| 60 min | 15.7 | 0.5 |
| 30 min | 31.4 | 1.0 |
| **15 min (96 wake-ups a day)** | **62.8** (73.0 with 60 s of work) | 2.0 |
| 10 min | 94.2 | 3.0 |
| 5 min | 182.4 (always on) | 6.1 |

- **Only one branch may tick at 15 minutes.** Two is about 146 CU-h. A preview scheduler runs on manual dispatch or every 6 hours (about 3 more).
- **Keep-alive pings cannot work on Free:** staying awake is 182.4 CU-h.
- Paid alternative: Launch at $0.106 per CU-hour is about $7 to $8 a month for the same 15-minute hours, and about **$19.3** a month with scale-to-zero disabled (always on), which allows any cadence.
- **The measurement.** The `production` branch has no other traffic, so one read-only query there isolates one wake. Baseline 2026-10-28 11:43 UTC: `active_time_seconds` 600, `compute_time_seconds` 152. After one `select 1`, read at 14:09 UTC: **964 and 244, so one wake added 364 s of active time and 92 compute-seconds (0.253 CU).** A wake that costs a query's few milliseconds would have added about zero; 364 s is the **5-minute idle window plus about a minute**, so **the idle window is billed**. At that cost, 96 wakes a day is about 9.7 hours, which is **about 74 CU-hours a month** at 15 minutes (the 60 s-of-work row above is the same figure). One sample, so treat the extra minute as approximate. Neon's per-branch counters lag: they had not moved after 10 minutes and had by 26. Re-measure (`neonctl branches list --project-id <id> --org-id <org> --output json`, field `active_time_seconds`) before relying on a different interval.
- **Decision (Fatih, 2026-10-28): stay on Free; 15-minute ticks on `production` only; the preview scheduler is manual.**
- Read consumption daily once a scheduler runs; flag at 70 CU-h.

The numbers and options were posted for CEF on [#461](https://github.com/Fatihmaull/evergreen/pull/461).

## Compute and cost on Launch (read 2026-11-01)

Launch has no monthly minimum: the bill is metered usage. List prices (Neon's plans page, read 2026-10-28 and 2026-11-01): **$0.106 per CU-hour**, $0.35 per GB-month of storage, $0.20 per GB-month of history, $0.09 per GB-month of snapshots, $1.50 per extra branch-month beyond the 10 included. Read the metered numbers with `neonctl api` (it uses `neonctl`'s own login; no credential is handled):

```bash
neonctl api /consumption_history/v2/branches -Q project_ids=icy-sun-89705623 -Q org_id=org-delicate-violet-65283800 \
  -Q from=2026-10-22T00:00:00Z -Q to=2026-11-02T00:00:00Z -Q granularity=daily -Q metrics=compute_unit_seconds
neonctl api /consumption_history/v2/projects ...      # same, project level (adds snapshot_storage_bytes_month, extra_branches_month)
```

### Last billing period: 2026-10-29 09:53 UTC to 2026-11-01 00:00 UTC (Launch)

(Data before the plan change is under the legacy endpoint and is not in these numbers; the Free period used 0.57 CU-hours by 2026-10-28.)

| Branch | CU-hours | At $0.106 |
|---|---|---|
| `preview` | **10.040** | $1.06 |
| `production` | **2.519** (0.213 on 10-29, 0.316 on 10-30, 1.990 on 10-31) | $0.27 |
| three short-lived branches | 0.005 together | under a cent |
| **Total** | **12.565** | **$1.33** |

Preview's 10 CU-hours were test traffic (6.0 on 10-30 alone) with no cron; preview idles to zero between uses. Storage was about 3 MB on production and the preview child about 1 MB, which prices in fractions of a cent; snapshot storage was 12.8 MB-months and history 0.12 MB-months in the period (cents or less). `extra_branches_month` reads 66 in the period and 16 so far in the new one with **units not given by the API and two real branches**, so whether any extra-branch line will appear on the bill is `undetermined`: Fatih's invoice will show it.

### This billing period: 2026-11-01 00:00 UTC onward

**1.431 CU-hours so far (production only, to 15:22 UTC), $0.15.**

### Projection at the current production crons (API `*/15` and scheduler `*/15`)

Both crons fire within about 20 seconds of each other, so they share one wake-up per 15 minutes: 96 wakes a day, each billed at about 364 s of active time at 0.25 CU (measured 2026-10-28, above), which is 2.43 CU-hours a day by arithmetic. Measured: **2.23 CU-hours on 2026-11-01** (rate over 15.4 hours) and 2.37 over the full 34.6 hours since the first tick.

| Basis | CU-hours / 30 days | At $0.106 |
|---|---|---|
| Measured 2026-11-01 rate | 67.0 | **$7.11** |
| Measured since first tick | 71.2 | $7.54 |
| Arithmetic (96 wakes x 364 s x 0.25 CU) | 72.8 | $7.72 |
| For comparison: scale-to-zero disabled, always on | 180 | $19.08 |

**About $7.1 to $7.7 a month for production compute**, plus preview when it is used (a heavy test day of 6 CU-hours is $0.64) and cents of storage and snapshots. **Nothing is metered against the 100 CU-hours of Free any more.**

### The $5 spending notification

The organization's spending limit reads **`spending_limit_cents: 500`** (`GET /organizations/{org_id}/billing/spending_limit`, read-only). Per Neon's documentation (the spending-notifications page and the API reference for the endpoint, read 2026-11-01) it is **alert-only**: "notifications fire at 80% and 100%, but computes are not suspended". Emails go to the organization's admins at **$4 and $5** of metered charges for the month (checked every 15 minutes, weekly reminders after), and a banner shows in the console. **It does not stop usage.** A true hard cap exists only as per-project consumption quotas, and this project has none set (`quota: null`).

- **Has one fired? No.** Charges this period are about $0.15, and last period's were $1.33; neither threshold is near. Whether an email was sent is not readable by DevOps (there is no API for it), but there is nothing to have triggered it.
- **When it will fire at the current rate:** the 80% alert ($4) around **16 to 18 November** and the 100% alert ($5) around **20 to 22 November** (a rate of $0.237 to $0.257 a day). A $5 threshold is below a month of production compute (about $7.1 to $7.7), so **it will fire about two-thirds of the way through every month**. That is the notification doing its job, or it is set too low: Fatih's call.
- **What Fatih compares against the invoice:** compute CU-hours by branch above; 12.565 CU-hours for the 2026-10-29 period, and the current period's compute as it accrues at about 2.2 to 2.4 CU-hours a day.

