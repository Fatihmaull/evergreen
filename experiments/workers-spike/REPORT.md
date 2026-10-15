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

---

# Deployed leg (2026-10-15, Rakha's free Cloudflare account, workers.dev subdomain `evergreen-cer`)

Supersedes the "Deployed leg: blocked" bullet above. Testnet reads only; no extend submit, no `transfer_from`, no signing key used. Two disposable Workers were deployed, measured, and **deleted** (see "Cleanup").
Raw data: `results/deployed/` (`requests-{buf,nobuf}.jsonl` per-request rows, `tail-slim.json` per-request CPU/wall/outcome from `wrangler tail`, `cpu-by-route.json`, `neon-summary.json`, `graphql-analytics.json`, `replay/` byte-for-byte diffs, `burst-log*.txt`, `cli-*`/`worker-*` last-response JSON). Tools: `tools/measure-deployed.py`, `compare-replay-deployed.sh`, `burst.py`, `analyze-deployed.py`, `graphql-analytics.py`, `cf-get.py`.

## What was deployed
| Worker | compatibility_date | global Buffer / process |
|---|---|---|
| `evergreen-spike-tmp-1015-nobuf` | 2024-01-01 | absent / absent (`/facts` confirmed) |
| `evergreen-spike-tmp-1015-buf` | 2026-10-01 | present / present (`/facts` confirmed; no flag set) |
Deploy: `wrangler deploy --name <n> --compatibility-date <d>` with `wrangler.toml` unchanged; only binding is a plain-text var `RPC_URL` (+ secret `NEON_DATABASE_URL`, piped on stdin by a script reading `.env`; never in argv/output). Bundle 2298 KiB raw / 351 KiB gzip accepted on the Free plan; **Worker Startup Time 58-64 ms** (limit 1 s). No KV/D1/R2/Queues/Hyperdrive, no routes, no account setting changed. Account has no subscription (`/subscriptions` empty) = Workers Free; worker settings carry no `limits` override. The only code change vs. the local leg: `x-colo` header and `colo` in `/neon` JSON (from `request.cf.colo`).
Note: `.env` has `NEON_DATABASE_URL=postgresql://...&channel_binding=require` **unquoted**; `. ./.env` treats `&` as a shell operator so the variable comes out EMPTY. The secret was set by parsing the file directly. Quote the value in `.env` if anything sources it.

## Scan / extend vs the CLI, deployed (N=30 sequential requests per row)
Live RPC cannot be pinned to a ledger, so for live runs only `observedAtLedger`/`remainingLedgers` are masked for scan; for extend dry-run the mask is widened (see below). Exact comparison is the replay one.
| Case | nobuf (2024-01-01) | buf (2026-10-01) |
|---|---|---|
| scan A `--json`, live vs CLI, masked | 30/30 identical | 30/30 identical |
| scan A+B+C `--json`, live vs CLI, masked | 30/30 identical | 30/30 identical |
| scan A/A+B+C json+human, **replay, byte for byte** vs CLI | IDENTICAL (4/4) | IDENTICAL (4/4) |
| extend A dry-run, **replay, byte for byte** (incl. tx XDR/hash) | **DIFFERS: `SIMULATION_FAILED`, exit code 2** | IDENTICAL |
| extend A dry-run, live vs CLI, widened mask | 0/30 (fails, same cause as local: no `Buffer`) | 30/30 identical |
| scan A human, live | not comparable live (embeds ledger numbers); replay identical | same |
Widened mask for live extend: also `extendToLedgers`, `recordedAt`, `simulatedAtLedger`, `transactionXdr`, `transactionHash`, `feeStroops`, `estimatedFeeStroops`. Reason, verified with two back-to-back CLI runs: timebounds (-> XDR, hash), the ledger number, and the simulated resource fee (8458-8461 stroops) change from call to call. Everything else is identical. Raw (unmasked) equality was 0-2 of 30, i.e. only when ledgers happened to align.
The extend failure without `Buffer` reproduces exactly on the deployed runtime (with `compatibility_date` 2024-01-01); with `2026-10-01` it works.

## Subrequests (counted inside the Worker, deployed)
scan (1 or 3 contracts) **3**; extend dry-run **7** (nobuf extend fails after 6); Neon `neon()` HTTP **1 per query**; Neon WebSocket `Client` **1 per request regardless of query count (1, 2 or 5)**. Free limit is 50 per request (docs, fetched 2026-10-15). No "too many subrequests" error occurred. The submit path (inferred ~11) was not run.

## CPU time: source, values, enforcement
**Source: `wrangler tail --format json`, field `cpuTime` (integer ms) and `wallTime`, one event per request, joined to my requests by `cf-ray`.** This is Cloudflare's own per-invocation CPU figure (docs: "Tail Workers/Logpush: CPU time and wall time at the top level of the Workers Trace Events"). It is the platform-measured value, but integer-rounded, and includes my instrumentation (the fetch wrapper clones each `Request` and reads each body twice). Cross-check: Workers GraphQL Analytics `workersInvocationsAdaptive` (read-only, the token can query it; units are microseconds; script name is reported as `__unknown__`, so it is account-wide): 1747 successes, **p50 9.7 ms, p90 32.0, p99 60.8, p99.9 88.9 ms**, 0 errors; it agrees with tail (same order of magnitude, same tail).
Platform baseline `/facts` (no I/O): p50 1 ms, max 2.
Sequential, N=30 each (tail `cpuTime` ms; p50 / p90 / max):
| Route | buf | nobuf |
|---|---|---|
| scan A json | 14 / 39 / 44 | 20 / 47 / 82 |
| scan A human | 10 / 21 / 46 | n/a |
| scan A+B+C json | 12 / 43 / 50 | 14 / 27 / 56 |
| extend A dry-run | 29 / 76 / 79 | 17 / 36 / 46 (fails early) |
| core `scanContract` only (no CLI layer), A | 9 / 16 / 18 | n/a |
| Neon HTTP, 1 query | 3 / 10 / 11 | 3 / 7 / 8 |
| Neon HTTP, 2 queries | 3 / 6 / 11 | 4 / 8 / 11 |
| Neon WebSocket, 1 query | 12 / 23 / 31 | 10 / 30 / 31 |
| Neon WebSocket, 2 queries | 6 / 16 / 24 | 7 / 13 / 20 |
| Neon WebSocket, 5 queries | 6 / 11 / 17 | 8 / 21 / 23 |
Sustained-load probe on `buf` (read-only; tail drops events under load, so CPU is from the matched subset): scan A at concurrency 24, 300 requests (~20 req/s): 300/300 HTTP 200, matched 228 events cpu p50 11 / p90 36 / max 54 ms. An earlier 400 requests at concurrency 24 and 200 at 8: all 200. Extend dry-run at concurrency 8, 60 requests (~3 req/s): 60/60 200, matched 53 cpu p50 25 / p90 53 / max 89 ms.
**Locally measured 2-4 ms was far too optimistic**: deployed scan is ~3-5x higher (cold isolates in several colos, edge CPU, SDK work, my wrapper).
**Does this reflect free-plan 10 ms enforcement?** The figure is the one Cloudflare enforces against, and a large share of requests exceed 10 ms (scan p50 ~10-20, extend dry-run p50 17-29), yet **zero** `exceededCpu`/error 1102/non-200 occurred in ~1,900 requests (all tail outcomes `ok`, no exceptions; GraphQL errors 0). Docs say each isolate has "some built-in flexibility" and is terminated only if it "starts hitting the limit consistently". So: no errors observed, but this is tolerance, not headroom; what request volume/CPU mix flips to 1102 is **undetermined** (not probed beyond ~20 req/s for a few seconds).

## Wall time and colo
Client wall includes Rakha's computer (Jakarta) to the edge. Worker-side wall (`x-wall-ms`) p50: scan A 930-990 ms, A+B+C 780-850, extend dry-run ~2.2 s; all dominated by testnet RPC round trips (3 and 7). Client p50: scan A 1269/1345 ms (buf/nobuf), A+B+C 1028/1063, extend 2437 (buf). 
**Colo is not stable**: requests from the same client landed in SIN (~66%), HKG (~19%), MRS (Marseille, ~12%), KIX (~3%) (`request.cf.colo`, and `cf-ray` suffix). The Worker runs where the request enters.

## Neon from the edge (read-only: `SELECT 1`, `SELECT version()`; PostgreSQL 18.6; pooled endpoint, ap-southeast-1)
All 300 requests OK (0 errors). Times are in-Worker wall ms (clock advances on I/O). `p50 all` includes every colo; `p50 SIN` only requests that ran in the Singapore colo (same region as the DB).
| Transport | Variant | q/req | subreq | request wall p50 all / p90 | p50 SIN-only | connect p50 | 1st query p50 SIN / HKG / MRS |
|---|---|---|---|---|---|---|---|
| HTTP `neon()` | buf | 1 | 1 | 130 / 462 | 49 | n/a | 49 / 153 / 456 |
| HTTP | buf | 2 | 2 | 37 / 250 | 27 | n/a | 16 / 125 / 163 |
| HTTP | nobuf | 1 | 1 | 48 / 341 | 19 | n/a | 19 / 158 / 430 |
| HTTP | nobuf | 2 | 2 | 50 / 322 | 31 | n/a | 15 / 47 / 175 |
| WS `Client` | buf | 1 | 1 | 130 / 721 | 54 | 117 | 8 / 40 / 146 |
| WS | buf | 2 | 1 | 67 / 869 | 34 | 39 | 9 / 43 / 146 |
| WS | buf | 5 | 1 | 47 / 385 | 45 | 20 | 9 / 43 / 147 |
| WS | nobuf | 1 | 1 | 84 / 883 | 39 | 71 | 8 / 44 / 147 |
| WS | nobuf | 2 | 1 | 74 / 917 | 40 | 41 | 9 / 46 / 146 |
| WS | nobuf | 5 | 1 | 49 / 1293 | 49 | 19 | 9 / 57 / 147 |
Reading: latency is governed by which colo serves the request (SIN ~10-20 ms/query; HKG ~45; MRS ~147 for the first query). Smart Placement / Hyperdrive were not tried (no resources created), so whether placement near the DB removes the HKG/MRS tail is undetermined. CPU: HTTP p50 3-4 ms, p90 6-10; **WebSocket p50 6-12, p90 11-30**, i.e. WS costs more CPU per request (a new TLS/WS/PG handshake each request). No `Client` reuse across requests is possible in workerd. Neon is **not** the CPU problem over HTTP; over WS it can alone exceed 10 ms.

## Cleanup
`wrangler delete --force` on both Workers: "Successfully deleted". Readback: `GET /accounts/<id>/workers/scripts` returns `result: []`; `GET .../scripts/evergreen-spike-tmp-1015-buf/settings` returns "This Worker does not exist on your account" (code 10007); both workers.dev URLs return 404 (`error code: 1042`). Secrets went with the Workers. No `.dev.vars` or token in the tree (a grep of this directory and the raw tail files for the Neon URL, host, password, user and Cloudflare token found nothing; raw tail output, which contains the client IP, was kept outside the repo in /tmp and only `tail-slim.json` is committed).

## Still undetermined
- Free-plan CPU enforcement threshold under real traffic (above); isolate warm vs cold split (tail does not expose isolate id).
- Testnet extend submit and SEP-41 `transfer_from` (no signing key); submit path subrequests (~11 inferred) and CPU including signing (ed25519 sign measured ~2 ms locally).
- Smart Placement, Hyperdrive, Queues on the free plan (not created); Neon pooled-endpoint suitability for the database layer work.
- Per-contract-count scaling: scan is 3 subrequests for 1 or 3 contracts, CPU p50 similar (A 14 vs A+B+C 12 ms); no larger set exists (only A, B, C), so the breaking point is undetermined.
