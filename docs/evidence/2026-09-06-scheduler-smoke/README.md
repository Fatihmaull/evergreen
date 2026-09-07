# W1-D5-03 — local scheduler runtime check

**Status:** local read path verified; GitHub manual/scheduled runs pending.

The initial scheduler candidate is GitHub Actions with Node 24. This record verifies the local SDK read path used by the prepared workflow, before publication.

| Field | Recorded value |
|---|---|
| Captured | 2026-09-06 06:34:37 UTC / 13:34:37 WIB |
| Node | 24.13.0 |
| `@stellar/stellar-sdk` | 17.0.1, pinned in the root manifest and lockfile |
| Network | Stellar Testnet, verified against `Networks.TESTNET` |
| Protocol version | 28 |
| Contract | `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L` (A) |
| Entry | A's contract instance |
| Response ledger | 4,530,578 |
| Live until ledger | 4,712,648 |
| Remaining TTL | 182,070 ledgers |
| Script result | `status: "ok"`, 667 ms |

## Capture and reproduction

With the pinned Node version and `pnpm install --frozen-lockfile --ignore-scripts` completed:

```bash
node scripts/scheduler-smoke.mjs > docs/evidence/2026-09-06-scheduler-smoke/local-run.jsonl
```

[`local-run.jsonl`](local-run.jsonl) is the unedited stdout from this capture: one start record and one successful result. It contains the script's derived summary of SDK responses, not full RPC JSON. For a fresh check, run `pnpm scheduler:smoke`; preserve this dated recording. Ledger numbers and TTL will differ as Testnet progresses.

The script only calls `getNetwork()` and `getLedgerEntries()` for A's instance. It loads no `.env` or signing secret and submits no transaction. SDK 17.0.1's fetch transport reads its timeout from `server.httpClient.defaults.timeout`; the script sets that to 10,000 milliseconds per request.

## Offline validation

`pnpm check` covers typecheck, lint, formatting, the five existing package placeholder tests, and nine scheduler regression tests. The scheduler tests cover the network guard, the requested instance key, ledger/TTL calculation, malformed or missing entries, RPC failures, the inclusive TTL boundary, and the command's structured error/nonzero exit. All use recorded fixtures or a stubbed transport, with no network calls.

## What remains

Preparation published for review in [PR #24](https://github.com/Fatihmaull/evergreen/pull/24), tracking [Issue #23](https://github.com/Fatihmaull/evergreen/issues/23). After review and merge to the default branch:

1. Run the workflow manually and capture its run URL, event, commit SHA, and exported logs.
2. Capture at least one successful **schedule** event with the same artifacts.
3. Add the records to `docs/EVIDENCE.md` and update the task status in the repo and Notion.

The prepared UTC schedule is every 15 minutes at `7,22,37,52`. GitHub schedules are best-effort. This probe does not prove engine decision logic, fee payment, signing, durable locking, or unattended TTL extension.
