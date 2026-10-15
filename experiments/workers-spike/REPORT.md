# Workers go/no-go spike: local (workerd) leg

Throwaway spike branch `spike/workers-go-no-go`, not intended for merge. Testnet only, no signing key used,
no transaction submitted. `packages/` untouched (core and cli are imported read-only from their built `dist/`).
Dates/times are from the box clock (2026-10-15).

## What ran
- Real CLI: `node packages/cli/dist/bin.js scan <A> [--json]` and `... extend <A> --ledgers 1000 --source-account <public G> --json` (dry-run, default).
- Worker (`src/worker.ts`) calls the same `runCli` and core functions from `dist`, under `wrangler dev` (workerd), two variants:
  - `:8788` compatibility_date 2024-01-01: global `Buffer` and `process` ABSENT (the plain Workers runtime).
  - `:8787` compatibility_date 2026-10-01: global `Buffer`/`process` PRESENT with no flag set. Matches Cloudflare docs: from 2026-08-04, `nodejs_compat` and `nodejs_compat_v2` are on by default.
- Subject: guinea-pig A `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L` (docs/ONBOARDING.md, docs/SETUP.md). B and C were scanned read-only, never written.

## Pinning to one ledger
RPC `getLedgerEntries` has no ledger parameter, so a live read cannot be pinned. Two methods:
1. **Record/replay (exact pin).** `tools/fetch-preload.mjs` records the CLI's RPC bytes (`EG_MODE=record`) and replays them to the CLI (`EG_MODE=replay`) and to the Worker (`?replay=1`); the clock is frozen to the recording instant. Both sides see identical chain data, so any diff is runtime behaviour. Script: `tools/compare-replay.sh`.
2. **Live, back-to-back** (CLI, Worker, CLI) with ledger drift masked: only `observedAtLedger` and `remainingLedgers` are masked, and `remainingLedgers == endsAtLedger - observedAtLedger` is asserted. Script: `tools/compare-live.py`, output `results/compare-live.txt`.

## Scan-vs-CLI result (output equality)
| Case | no-Buffer workerd | Buffer workerd |
|---|---|---|
| scan A `--json` (replay, byte for byte) | IDENTICAL | IDENTICAL |
| scan A human | IDENTICAL | IDENTICAL |
| scan A+B+C `--json` / human | IDENTICAL | IDENTICAL |
| extend A dry-run `--json` (incl. tx XDR and hash `4faafc59...5162c`) | **DIFFERS: fails** | IDENTICAL |
| live scan A and A+B+C vs CLI, ledgers differ by 0-1 | masked-identical, raw-identical in some pairs | same |

Live ledgers observed: CLI 5208536/5208537, Worker 5208537 (A); CLI 5208538, Worker 5208538/5208539 (A+B+C). The only live differences are ledger drift.
Negative control: the live CLI run (ledger 5208375) vs the replay run (ledger 5208397) differs exactly in `observedAtLedger`/`remainingLedgers` (22 ledgers); `endsAtLedger` is unchanged. The no-Buffer extend row shows the comparator detects a real difference.

**The scan does NOT mis-scan in Workers**, with or without global Buffer. The scan path was already fixed to use `atob`/`btoa` (core/src/scan-contract.ts, `test/browser-no-buffer.test.ts`).
**The extend path is NOT Buffer-safe** (finding below).

## Finding: extend path needs global `Buffer`
Without global `Buffer`, `prepareExtension` throws `ReferenceError: Buffer is not defined`
(`extensionKey` in core/src/extend.ts:41, called from `prepareExtension` in core/src/extend-rpc.ts). The CLI layer collapses it into
`SIMULATION_FAILED: Extension preparation or fee validation failed. Nothing was submitted.`, which hides the cause. It fails loudly, not silently.
Other `Buffer` uses in the same family: core/src/extend-rpc.ts:70, :115, :140 and core/src/ed25519-signer.ts:34.
The existing no-Buffer test only covers `scanContract`.
Practical impact: none while the Worker runs with a compatibility date >= 2026-08-04 or `nodejs_compat`. It bites on an older date or with `no_nodejs_compat`.

## Subrequests (counted by wrapping `fetch` inside the Worker)
- scan, 1 or 3 contracts: **3** (`getNetwork`, `getLedgerEntries` instance keys, `getLedgerEntries` code key). Independent of contract count (A vs A+B+C verified).
- extend dry-run: **7** (the 3 scan calls, `getLedgerEntries` for state-archival config, `getNetwork`, `getLedgerEntries` account, `simulateTransaction`).
- Submit path (not run): the 7 plus `sendTransaction`, at least one `getTransaction`, and the post-read scan. At least ~11 by reading `bin.ts`/`extend-rpc.ts`: inferred, not measured.

## CPU and wall (LOCAL, INDICATIVE: not free-plan enforcement)
CPU = on-CPU ns of the owning workerd process (`/proc/<pid>/task/*/schedstat`) / N warm sequential requests. It includes workerd HTTP handling, the dev proxy and GC. Cloudflare's billed CPU is not exposed locally, and in-Worker timers do not advance without I/O. `results/measure.jsonl` has the raw rows.
| Variant | Route | Mode | N | Subreq | CPU ms/req (warm) | client wall p50 / p90 ms |
|---|---|---|---|---|---|---|
| Buffer | scan json | replay | 50 | 3 | 1.71 | 5 / 7 |
| Buffer | scan human | replay | 50 | 3 | 1.61 | 5 / 6 |
| Buffer | extend dry-run | replay | 50 | 7 | 1.85 (1.9-2.0 in a later pair) | 7 / 10 |
| no-Buffer | scan json | replay | 50 | 3 | 2.01 | 5 / 8 |
| no-Buffer | scan human | replay | 50 | 3 | 1.47 | 4 / 6 |
| Buffer | scan json | live testnet | 10 | 3 | 2.50 | 1005 / 1174 |
| Buffer | extend dry-run | live testnet | 10 | 7 | 2.65 | 2255 / 2624 |
| no-Buffer | scan json | live testnet | 10 | 3 | 2.77 | 996 / 1171 |
- First request after a fresh `wrangler dev` start (3 runs each): scan 4.1-4.3 ms, extend dry-run 4.2-4.7 ms.
- Ed25519 signing with an ephemeral in-memory key (never funded or submitted): sign-bench vs dry-run differ by less than the noise (about 1.9 ms each).
- Node 24 baseline, same scan against the recording: 1.01 ms CPU/scan (`results/node-baseline.json`).
- Idle workerd CPU is about 0-2 ms per 2 s.
- Dev bundle 2.18 MB raw, 306 KB gzip (unminified, includes the Neon driver); the free plan's size limit has not been checked against the live docs here, so treat as undetermined.
Reading: locally, one scan or one dry-run extend is about 2-4 ms CPU, comfortably under 10 ms. This does NOT establish the deployed number (JIT state, isolate cold start, real submit and confirm polling are not covered).

## Neon (local workerd only, read-only)
**Reachable from workerd under `wrangler dev`: YES**, over both transports of `@neondatabase/serverless` 1.2.0, in both the Buffer (`compatibility_date 2026-10-01`, :8790) and no-Buffer (`2024-01-01`, :8791) variants. Target: pooled endpoint, ap-southeast-1 (Singapore). Code: `/neon?transport=http|ws&q=<queries>` in `src/worker.ts`; harness `tools/measure-neon.mjs`; raw rows `results/measure-neon.jsonl`.
- Queries sent: `SELECT 1` and `SELECT version()` only (server reported PostgreSQL 18.6). No tables, schema, roles, branches or projects created. Connection string came from a gitignored `.dev.vars` (checked with `git check-ignore`, deleted afterwards); Worker errors are scrubbed (URL, host, user, password, `postgres://...`, `ep-*` hosts); a grep of results, wrangler logs and source for the URL, host and password found no match. No errors occurred in 240 requests.
- **Transport and counting.** `neon()` (one-shot) uses **HTTPS fetch**: 1 subrequest per query (counted with a wrapper installed as `globalThis.fetch` and `neonConfig.fetchFunction`; all returned 200). `Client`/`Pool` use **one WebSocket** for the whole connection: handshake plus any number of queries = **1 subrequest** (counted by wrapping the `WebSocket` constructor passed in `neonConfig.webSocketConstructor`; 0 fetch calls). Verified by the counters, not by reading driver internals. A fresh Client per request is required in workerd (I/O objects cannot be shared across requests), so each request pays the connect.
- **Subrequests per request** (q = queries in the request): http q=1 -> 1, q=5 -> 5. ws q=1 -> 1, q=5 -> 1.
- **Wall times** (N=30 requests each, client wall p50/p95 ms; in-Worker `Date.now` advances on I/O so per-query timings are valid). Connection and warm figures from the Worker:
| Variant | Transport | q/req | req wall p50 / p95 | connect (WS handshake) p50 / p95 | 1st query p50 / p95 | warm query p50 / p95 | CPU ms/req (warm) |
|---|---|---|---|---|---|---|---|
| Buffer | http | 1 | 46 / 365 | n/a | 43 / 361 | n/a | 1.95 |
| Buffer | http | 5 | 137 / 233 | n/a | 26 / 44 | 26 / 34 | 2.08 |
| Buffer | ws | 1 | 145 / 207 | 82 / 99 | 32 / 64 | n/a | 2.47 |
| Buffer | ws | 5 | 239 / 557 | 77 / 233 | 29 / 169 | 25 / 35 | 2.93 |
| no-Buffer | http | 1 | 29 / 31 | n/a | 26 / 27 | n/a | 1.86 |
| no-Buffer | http | 5 | 131 / 172 | n/a | 25 / 40 | 25 / 33 | 2.32 |
| no-Buffer | ws | 1 | 142 / 221 | 82 / 143 | 31 / 55 | n/a | 2.24 |
| no-Buffer | ws | 5 | 239 / 354 | 78 / 156 | 30 / 38 | 25 / 33 | 2.31 |
  p95 over 30 samples is the 29th-ranked value, so it is noisy (the 365 ms http outlier is a single slow first request). Fresh-start first request CPU 2.0-3.3 ms.
- **CPU**: same method as above (workerd process on-CPU ns / N warm sequential requests, includes proxy, TLS and GC). About 1.9-2.9 ms per request including the Neon round trips: comfortably under 10 ms locally, WS a few tenths of a ms above HTTP (WebSocket + protocol handshake). **Not** free-plan enforcement; deployed CPU is undetermined.
- **Caveats.** Latency is from Rakha's computer to Singapore, not from a Cloudflare edge: deployed Worker -> Neon will differ (likely lower and colo-dependent, but not measured; Smart Placement and Hyperdrive untested). Local workerd does not enforce subrequest or CPU limits. The free-plan subrequest limit was not checked against live docs, but 1-5 subrequests is far below any documented limit I know of; treat as undetermined. Sessions are not pooled across requests here: Client opens a new WebSocket (Neon-side, a new pooled session) per request. Whether the pooled endpoint transaction pooling suits the database layer work (prepared statements, session state) is not tested.

## Not done / undetermined
- **Deployed leg: blocked, nothing deployed.** `wrangler whoami` with the `.env` token authenticated (Account API Token, account "the author's account"). `wrangler deploy --name evergreen-spike-tmp-1015` then stopped before upload: `You need to register a workers.dev subdomain before publishing to workers.dev` (non-interactive default answer: no). Registering a subdomain is an account-level resource, outside the "no other resources" instruction, so it was not done. Dashboard link given by wrangler: `https://dash.cloudflare.com/<account-id>/workers/onboarding`.
- Deployed CPU, deployed subrequest enforcement, deployed scan-vs-CLI diff: undetermined.
- Testnet extend submit and SEP-41 `transfer_from`: undetermined. `EVERGREEN_SIGNER_SECRET` (docs/SETUP.md) exists in `.env` but was not loaded or used. The #297 spike identities live only in the local `stellar` keystore, with no env var. A `transfer_from` leg needs the spender's secret as an env var (name to be chosen by Rakha) plus a live allowance; the old one may have expired (temporary storage).
- Queues on the free plan, Hyperdrive: undetermined (needs deploy/dashboard).
