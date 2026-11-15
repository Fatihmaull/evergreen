-- 0013_schema_migrations.sql  (PH2-E2-07, #463, #464)
--
-- The migration ledger: one row per file in apps/api/db that has run in this database, so
-- "what ran here?" is a lookup instead of the shape diff in docs/ops/neon-migrations.md.
--
-- How it is written: every numbered file from 0013 on ends with its own INSERT into this
-- table, inside the same transaction as its DDL (the apply line uses --single-transaction),
-- so a file that fails records nothing and a file that commits always records itself.
-- Re-running such a file bumps last_applied_at and apply_count instead of failing. A re-run
-- of a file below 0013 (0008, 0009, 0010 are re-run on purpose) is NOT counted: those files
-- carry no ledger INSERT, so only a file that ends with its own INSERT touches the ledger.
--
-- Files that ran before this table existed (schema.sql, 0002 onward) are NOT recorded here:
-- whether and when each ran differs per environment, and a migration cannot know that.
-- They are backfilled per environment as source = 'backfill' (NOTES.md, "Migration ledger").
--
-- No role but the owner touches it: eg_api and eg_scheduler get no grant (0008 sets no
-- default privileges; the REVOKE states it).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f apps/api/db/0013_schema_migrations.sql
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, and the INSERT upserts.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename         text        PRIMARY KEY
                   CONSTRAINT schema_migrations_filename_shape
                   CHECK (filename ~ '^(schema|[0-9]{4}_[a-z0-9_]+)\.sql$'),
  source           text        NOT NULL
                   CONSTRAINT schema_migrations_source_kind
                   CHECK (source IN ('applied', 'backfill')),
  first_applied_at timestamptz NOT NULL DEFAULT now(),
  last_applied_at  timestamptz NOT NULL DEFAULT now(),
  apply_count      integer     NOT NULL DEFAULT 1
                   CONSTRAINT schema_migrations_apply_count_positive CHECK (apply_count > 0)
);

COMMENT ON TABLE schema_migrations IS
  'Migration ledger (PH2-E2-07): files in apps/api/db that ran here. source=applied: the file wrote its own row; source=backfill: recorded after the fact for a file that ran before 0013.';

REVOKE ALL ON schema_migrations FROM PUBLIC, eg_api, eg_scheduler;

-- Ledger line. Every later file ends with this, its own filename in place of 0013's.
INSERT INTO schema_migrations (filename, source)
VALUES ('0013_schema_migrations.sql', 'applied')
ON CONFLICT (filename) DO UPDATE
  SET last_applied_at = now(),
      apply_count     = schema_migrations.apply_count + 1;
