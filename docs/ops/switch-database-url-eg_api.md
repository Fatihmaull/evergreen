# Plan: switch the API Worker's `DATABASE_URL` from the owner to `eg_api`

**Status: plan only. Nothing has been executed.** Order: `evergreen-api-preview` first, then `evergreen-api` (production). **PM approval is required for every step below**, and production needs Fatih's go-ahead. Names only: never paste a password or connection string into a command, a doc, a log, or chat.

## 0. Preconditions
- 0008 and 0009 are applied on both branches (0009: 2026-10-31 ~09:59 WIB, see [`apply-0009.md`](apply-0009.md)).
- The Worker currently uses the owner connection. Keep that value available (password manager or Neon console) for rollback. Do not print it.

## 1. eg_api credentials (Neon)
- `eg_api` was created with SQL `CREATE ROLE ... LOGIN` (0008 precondition). Set or rotate its password with SQL as the owner (`ALTER ROLE eg_api PASSWORD ...`, value from a generator, entered without echo), or with the Neon console/API reset for that role.
- Build the connection string for the same host/database as the owner one, with user `eg_api` and pooled endpoint plus `sslmode=require` to match the current setup. Keep it only in the secret store.

## 2. Pre-checks (before each switch)
- Grep the SQL the API runs: `rg -n "FROM|INTO|UPDATE|JOIN" apps/api/src`. Tables seen 2026-10-31: `users`, `sessions`, `signin_codes`, `auth_rate_counters`, `wallets`, `wallet_challenges`, `watch_items`, `jobs`, `observations`, `scheduler_ticks`. Re-run the grep on the commit being deployed.
- For each table and operation the code uses, as owner: `SELECT has_table_privilege('eg_api', '<table>', '<SELECT|INSERT|UPDATE|DELETE>')`, plus `has_sequence_privilege` for any serial/identity sequence, and `has_database_privilege('eg_api', current_database(), 'CONNECT')`. Every needed operation must return `t`. Anything missing becomes a new numbered migration (Rakha), not a hand grant.
- Optional: connect once as `eg_api` from the box and run a read on `watch_items` and `scheduler_ticks`. This also closes the SET ROLE gap from 0009.

## 3. Switch (preview first)
- `wrangler secret put DATABASE_URL --name evergreen-api-preview` (value pasted at the prompt, never on the command line). Redeploy if the secret change does not roll a new version.
- Smoke tests: `GET /api/v1/health` returns 200; sign-in start (email code request) succeeds; an authenticated watchlist read returns 200.
- Watch Workers Logs / `wrangler tail` for at least 30 minutes for SQLSTATE `42501` (insufficient_privilege) or `permission denied`.
- Production: repeat the pre-checks, the switch, the smoke tests and the log watch on `evergreen-api`, only after preview is clean and with separate approval.

## 4. Rollback
- Run `wrangler secret put DATABASE_URL --name <worker>` again with the previous owner connection string and confirm health. Keep the owner value until production has run clean on `eg_api` for an agreed period.

(drafted with Fatih's PM assistant)
