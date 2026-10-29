# Neon migrations

Rakha's agent (CER) owns the schema and writes the SQL under [`apps/api/db/`](../../apps/api/db/). **DevOps applies it to Neon** and verifies it. When a PR adds a file under `apps/api/db/`, DevOps applies it to the **preview** branch and checks it; production is a separate, gated step (below).

## Where things are (read 2026-10-27)

| | |
|---|---|
| Project | `evergreen`, id `icy-sun-89705623`, AWS `ap-southeast-1`, Postgres 18.6, **Free plan** |
| Branches | `preview` and `production` (the default). **`production` has no tables.** |
| Roles | only `neondb_owner`, on both branches. No least-privilege app role exists yet. |
| Database | `neondb` on both |
| History retention | **21600 s (6 hours)**. A restore can only reach back that far. |
| Compute | autoscaling 0.25 to 2 CU (project default) |
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
| `0006` (#466, submitted hashes) | **not yet**, the PR is open | apply after it merges, the same way |

**The migration ledger does not exist yet.** #464 added only its card (`PH2-E2-07`, a `schema_migrations` table written by each file); until that table is built, this table is the record of what ran where.

The `production` branch has **nothing applied**. That is deliberate: production has no `DATABASE_URL`.

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

## Before each production migration: one manual snapshot (Fatih, 2026-10-28)

Until the Neon Launch upgrade ([`backup-and-restore.md`](backup-and-restore.md), option C now, option A later), the only restore point older than Free's 6-hour history is **one manual snapshot**, and Free allows **exactly one**. Production has no tables and no migration yet, so the log below is empty.

```bash
P=icy-sun-89705623; O=org-delicate-violet-65283800
neonctl snapshots list --project-id $P --org-id $O                       # find the old one
neonctl snapshots delete <old-snapshot-id> --project-id $P --org-id $O  # Free keeps one; make room
neonctl snapshots create --branch production --name pre-<migration-file> --project-id $P --org-id $O
neonctl snapshots list --project-id $P --org-id $O                       # confirm it exists, then migrate
```

The delete-then-create gap leaves **no snapshot for a moment**, so create the new one immediately and do not migrate until `list` shows it. Snapshots exist only on root branches, and `production` is the only root. Record every snapshot here, in the same PR or an ops note that applies the migration:

| Date (UTC) | Migration applied next | Snapshot name | Created by |
|---|---|---|---|
| (none yet) | | | |

## Compute budget on the Free plan

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
