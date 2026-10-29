# `@evergreen/scheduler`

The scheduler Worker of `PH2-E4-04`: **Stage 0**, a heartbeat, and **Stage 1**, a read-only, dry-run evaluation of the autopilot plan. Design and the reasons for each choice: [`docs/PH2-E4-04-SCHEDULER-DESIGN.md`](../../docs/PH2-E4-04-SCHEDULER-DESIGN.md).

**It signs nothing, submits nothing and holds no key.** Each tick reads the chain's latest ledger and records it in `scheduler_ticks` (migration 0005). That row is what the scheduler gap, DoD-2's check and `THRESHOLD_FLOOR_LEDGERS` are measured from. The money path (Stage 2) is not here yet.

## What it does

| Trigger | Where | What |
|---|---|---|
| Cron, every 15 minutes | **production only** | One tick |
| `POST /tick` with `Authorization: Bearer <TICK_TOKEN>` | the preview scheduler, which has **no cron** | One tick |
| `GET /health` | both | `{ ok, service, environment, commit }` |

The Neon allowance is per **project** (100 CU-hours), so two branches ticking every 15 minutes would not fit. `/tick` does not exist unless `TICK_TOKEN` is set.

A tick: ask the RPC for its network and refuse anything but the testnet passphrase, ask for the latest ledger, `INSERT INTO scheduler_ticks (observed_ledger) VALUES ($1)`. Failures are logged by **code only** (`RPC_UNREACHABLE`, `RPC_BAD_RESPONSE`, `NETWORK_MISMATCH`, `DB_FAILED`, `NOT_CONFIGURED`, or `INTERNAL` for a fault of ours), never by message, because an RPC or database error can carry a key. A failed tick is thrown, so the platform records the run as failed.

## Stage 1: evaluation (read-only, dry-run)

After a heartbeat is recorded, the tick reads the testnet autopilot plan with the engine's own queries (`PgTenantStore` and `planTenantsFromStore`, #440) and logs `scheduler.evaluate` with **counts only**: `payers`, `items`, `itemsWithoutBudget`, `dryRun: true`. It enqueues nothing and writes nothing. A failure is logged as `scheduler.evaluate_failed` with a code (`EVAL_DB_FAILED`, `EVAL_WRITE_REFUSED`) and does not fail the tick, because the heartbeat has already measured the gap. It does not read the chain yet, so whether an item is due is not decided here.

What it reads, all inside 0008's `eg_scheduler` grants: `watch_items` (the twelve granted columns), `wallets (network, account, user_id, linked_at)`, `users (id, reactivated_at, deactivated_at)`, `jobs` and `fee_ledger` (table-level `SELECT`).

**Two locks against a write.** 0008 lets this role insert into `jobs` and `fee_ledger` for Stage 2, so the grants alone would not stop an evaluation that wrote. `readOnlyQuery` refuses any statement that is not a single `SELECT` before it reaches the driver. `test/evaluate.pglite.test.ts` runs the evaluation as `eg_scheduler` with 0008 applied, inside a `READ ONLY` transaction, and shows that removing the wrapper lets a job insert through.

The engine is imported by file (`@evergreen/engine/dist/…`), not through its index, which also exports channels that import `node:crypto`.

## Settings (for the Worker config, which DevOps owns)

| Name | Kind | Needed | Meaning |
|---|---|---|---|
| `DATABASE_URL` | secret | yes | The scheduler's **own role**, never the owner's |
| `SOROBAN_RPC_URL` | var | no | Defaults to the testnet RPC in core. Another network's RPC is refused by passphrase |
| `TICK_TOKEN` | secret | preview only | Turns on `POST /tick` |
| `ENVIRONMENT` | var | yes | `production` or `preview` |
| `DEPLOY_COMMIT` | var | yes | Injected by the deploy workflow, as for the API (#462) |

There is no `wrangler.jsonc` in this package yet: the Worker name, the cron expression and the bindings are DevOps' (design §8). Import `NETWORKS` from core costs about 400 bytes in a bundle (the Stellar SDK is tree-shaken out).

## The database role needs very little

The tick needs **`INSERT (observed_ledger)` on `scheduler_ticks`, and nothing else**:

- **No `SELECT`.** So the statement has **no `RETURNING`**: `RETURNING id` needs `SELECT` on `id`, and the alert on a missing heartbeat must not run on the scheduler.
- **Not `ticked_at`.** It takes its default, the database clock. Granting it would let a compromised scheduler write its own heartbeat time and so forge the DoD-2 evidence. Postgres needs no privilege on a column that takes its default.

`test/heartbeat.pglite.test.ts` runs the tick on a real Postgres engine as exactly that role.

## Develop

```
pnpm build && pnpm exec vitest run apps/scheduler
```

No Node types are available to this package on purpose (`tsconfig.json`), so a stray `Buffer` or `process` fails typecheck instead of failing at the edge.
