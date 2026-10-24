# PH2-E2-03 schema: apply candidate for Neon preview

`apps/api/db/schema.sql` is the apply candidate for the Neon `preview` database (Rakha, [#385](https://github.com/Fatihmaull/evergreen/issues/385#issuecomment-6357468666)). It is plain Postgres. Smoke-tested on a throwaway Postgres 17 container; not applied to Neon yet. Apply after this PR merges.

Preview may connect as the database owner. A least-privilege application role, and grants that make `fee_ledger` append-only (no `UPDATE` or `DELETE` for that role), land before production only. They do not block the preview apply.

## Migrations

No migration tool. Each file is applied with `psql --single-transaction`.

Numbered SQL files live under `apps/api/db/`:

- `schema.sql` is the initial schema, the `0001_initial` apply. The name stays `schema.sql` for this first apply.
- The next change is a new file, `0002_<short_name>.sql`, then `0003_*.sql`, in numeric order.
- Do not edit a file after it has been applied. Add the next number instead.

```
psql "$DATABASE_URL" --single-transaction -f apps/api/db/schema.sql
```

Applied in order:

| File | What it does |
|------|--------------|
| `schema.sql` | Initial schema (`0001_initial`). |
| `0002_jobs_daily_limit_per_user.sql` | Replaces `jobs_daily_limit_idx` with `(user_id, network, contract_id, pulled_at)`, same partial predicate. Implements D1. |

```
psql "$DATABASE_URL" --single-transaction -f apps/api/db/0002_jobs_daily_limit_per_user.sql
```

`schema.sql` still shows the cross-user index; it is not edited after apply. The live index is the one from `0002`.

## Mapping to #350 (docs/API.md)
| API | Table |
|---|---|
| §3 session cookie, CSRF token, idle/absolute lifetimes | `sessions` (hash of cookie id only) |
| §4 email code (hashed, single use, 10 min, 5 failures) | `signin_codes` |
| §4 wallets, `WALLET_LINKED_ELSEWHERE`, unlink refused while paying | `wallets` PK (network, account); `watch_items` FK ON DELETE RESTRICT |
| §6 WatchItem incl. autopilot, budget, `lastObservation` | `watch_items` + `observations` |
| §6 `extendNow.usedToday` / §3 `EXTEND_NOW_PER_CONTRACT_PER_DAY` | counted from `jobs` (`jobs_daily_limit_idx`) |
| §7 AllowanceState `lastKnown`, expired vs revoked vs none | `allowance_observations` |
| §7 Job + steps, `BumpRecord[]` unchanged | `jobs` (steps as columns/jsonb) |
| §7 Idempotency-Key, same key + other body -> 409, per user | `jobs (user_id, idempotency_key)` unique + `request_hash` |
| §7 "job ID is the engine's pull idempotency key" | `jobs.id`; one pull/refund per job also enforced by unique indexes on `fee_ledger` and `pull_tx_hash`/`refund_tx_hash` |
| §7 LedgerRow | `fee_ledger` |

## Where the schema disagrees with or adds to #350 (#350 says "your schema wins"; to discuss)
1. **`difference` ledger kind.** #350's sum lists "+ any recorded difference" but `LedgerRow.kind` had no kind for it. **Accepted (D7):** add `'difference'` so the reconcile sum closes with rows only (already in `schema.sql`).
2. **`evergreen-fee` with no tx hash.** The fee is part of the pull's amount. **Accepted (D8):** derived row like `rent`; `txHash` null (already in `schema.sql`).
3. **Daily limit:** #350 says per contract; plan §3.3 says per user. **Accepted (D1):** per `(user_id, network, contract_id)`; index fix in `0002_` after preview (see Accepted defaults).
4. **Idempotency key retention.** #350 says kept >= 24 h; schema keeps it on the job row. **Accepted (D3):** for the job’s lifetime; no 24h prune.
5. **Autopilot jobs have no client key.** Proposed `autopilot_window` dedupe column; the window definition belongs to PH2-E4-04 (undetermined).
6. **`observations` and `allowance_observations` are append-only history**, not in #350's surface; needed for `lastKnown` and for DoD-2 evidence. Retention: undetermined.
7. **`jobs.network` CHECK = 'testnet'** mirrors "writes refuse mainnet until DoD-2"; the domain still allows mainnet for reads (watch items).
8. **Stroops as numeric(39,0)** (bigint is i64; Stroops is i128 on chain). #350 serialises as decimal strings, which matches.

## Undetermined
- Refund semantics depend on the PH2-E4-02 spike (protocol refund of unused refundable fee): whether `reconcile` stores declared vs charged resource fee as separate columns. Placeholder: jsonb.
- Router-contract extends (PH2-E4-07) and their ledger rows.
- Personal-data deletion: resolved as soft delete via `deactivated_at` (**D5**); ledger untouched.
- Email change: **not supported in v1 (D6).**

---

## Revision 2026-10-22: aligned with #350 at 682ab6b and the #382 evidence

Previous versions are saved as `schema.v1.sql` and `NOTES.v1.md`. The revised `schema.sql` applies cleanly to a throwaway Postgres 17 container (podman). Smoke-tested there:
- a second email that differs only in case is refused;
- a removed watch item is restored by re-adding it;
- `cancelled` cannot be reached from `pulled`, and a cancelled job cannot move on;
- the daily-limit count sees only pulled jobs.

### Changes
1. **`job_status` gains `cancelled`** (API §7).
   - A trigger allows `cancelled` only from `queued`, and makes `cancelled` final.
   - A CHECK also requires `pull_tx_hash IS NULL` for a cancelled job.
   - `DELETE /watchlist` moves queued jobs to `cancelled`; pulled jobs run to completion.
   - Not enforced: inserting a row directly as `cancelled` (jobs are created `queued` by default).
2. **`watch_items.removed_at`** (soft delete, API §6).
   - Re-adding clears `removed_at` on the same row (`ON CONFLICT … DO UPDATE`), so the plain primary key on (user, network, contract) still works and jobs keep their `ON DELETE RESTRICT` target.
   - A removed item cannot have autopilot on (CHECK), and the autopilot index skips removed items.
   - **Accepted (D4):** restoring keeps old label, scope and budget; autopilot stays off until explicitly enabled.
3. **Daily limit** (API §3/§7): per contract, rolling 24 hours, counting only jobs that pulled.
   - New `jobs.pulled_at` (NOT NULL exactly when `pull_tx_hash` is set).
   - Partial index on `(network, contract_id, pulled_at) WHERE kind = 'extend-now' AND pull_tx_hash IS NOT NULL`; the query is in a comment.
   - The window runs on `pulled_at`, not `created_at`. **Accepted (D2):** `pulled_at`.
   - Index in this file is still cross-user `(network, contract_id)`. **Accepted (D1):** per (user, network, contract); change in `0002_` after preview.
4. **Users: one email, one account, ever** (API §4 and §10).
   - `deleted_at` is renamed `deactivated_at`.
   - `users_email_uq` is now a full unique index on `lower(email)`, with no partial `WHERE`.
   - Email sign-in for a deactivated row clears `deactivated_at`. It never inserts a second row.
   - Reactivation must not re-enable autopilot (**D5**). Preview: API-enforced; schema trigger optional later.

### Decided (recorded from #350 §10, Fatih 2026-10-22)
- **Idempotency keys live with the job row.** They are stored on `jobs` with `request_hash` and kept as long as the job exists. Pruning would follow only a job-retention decision.
- **History is kept until DoD-2.** `observations` and `allowance_observations` are kept forever until DoD-2's evidence is gathered; retention is decided again after that.
- **Personal data uses soft delete.**
  - Deactivation keeps the user row, its email and linked wallets, and revokes sessions.
  - All copy says "deactivated and can be reactivated by email", never "deleted".
  - The fee ledger is untouched by deactivation.

### Reconcile columns, from the #382 evidence (`docs/evidence/2026-10-21-fee-refund-spike/`)
What the evidence clearly supports, measured on 13 testnet transactions:
- **`*_fee_charged`** for the pull and the extend: the actual fee, `TransactionResult.feeCharged`. The source's balance fell by exactly this amount every time.
- **`*_fee_declared`**: the envelope fee, which is the inclusion fee plus the declared `resourceFee`. A CHECK requires charged ≤ declared, which held in every case.
- **Extend meta fields:** `extend_rent_charged` (`rent_fee_charged`), `extend_refundable_charged` (`total_refundable_resource_fee_charged`) and `extend_nonrefundable_charged` (`total_non_refundable_resource_fee_charged`).
- **The refund delta** (declared − charged) is supported as a fact about the source account. It is the part the protocol never takes, so it is derived (declared − charged) and not stored separately.

Undetermined:
- **Whether a separate "protocol refund" column is useful** beyond declared − charged. The evidence shows it is never a separate transfer.
- **Meta fields for the pull** (`transfer_from`). Measured once each, but whether reconcile needs them is undetermined; only the charged and declared fees are stored.
- **Failed extend:** the evidence shows only the non-refundable part plus the inclusion fee is charged (#5: 1,315 stroops). How that cost is recorded in the ledger (a `network-fee` row with no extend) is undetermined until pricing (`PH2-E5-03`).
- **Mainnet fee behaviour.** Measured on testnet only.

### Still open from #350 §10 item 8
- `fee_ledger.job_id` is NOT NULL, so router extends need a job (point 9; `PH2-E4-07`).
- The scheduler window behind autopilot dedupe (point 7; `PH2-E4-04`).
- Least-privilege app role and append-only `fee_ledger` grants: before production, not before the preview apply. Preview connects as the database owner. The role name and the exact grants are not in this file.

---

## Accepted defaults (Rakha, 2026-10-23) — D1–D8

Recorded on PR #391 after Rakha accepted the local proposal. Preview apply is **not** blocked; schema follow-ups that need DDL land as numbered `0002_*.sql` (or later) after apply.

1. **D1 — Daily extend-now limit:** **per `(user_id, network, contract_id)`**, rolling 24 hours, counting only extend-now jobs that pulled (`pull_tx_hash` / `pulled_at` set). The index in `schema.sql` is still `(network, contract_id)` (cross-user); `0002_jobs_daily_limit_per_user.sql` replaces it with `(user_id, network, contract_id, pulled_at)`.
2. **D2 — Window timestamp:** **`pulled_at`** (not `created_at`).
3. **D3 — Idempotency key retention:** keys stay on the job row for the **job’s lifetime**; no 24h prune. Broader job-retention policy remains undetermined.
4. **D4 — Watch item restore:** re-add clears `removed_at` on the same row and **keeps** label, scope and budget; **autopilot stays off** until the user turns it on.
5. **D5 — User deactivation:** soft delete via **`deactivated_at`** only; one email forever; reactivation clears the flag and must **not** re-enable autopilot (API-enforced for preview; schema trigger optional later).
6. **D6 — Email change:** **not supported in v1.**
7. **D7 — `difference` ledger kind:** **add** `'difference'` so reconcile can close with rows only. **Already in `schema.sql`** (`ledger_kind` includes `'difference'`).
8. **D8 — `evergreen-fee`:** **derived** row, `tx_hash` null (like rent). **Already in `schema.sql`** (CHECK ties `evergreen-fee` / `rent` / `difference` to null `tx_hash`).

Still undetermined (not in D1–D8): autopilot scheduler window (`PH2-E4-04`); app role / append-only grants (pre-prod); router extends needing `fee_ledger.job_id` (`PH2-E4-07`).

