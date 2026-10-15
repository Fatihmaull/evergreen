# Cloudflare Workers hosting spike — can the scan and extend engine run on Workers?

**Testnet, 2026-10-15. Reads only: no signing key was used and no transaction
was submitted.** `packages/` is untouched; core and the CLI were imported
read-only from their built `dist/`. Where something could not be established it
says `undetermined`.

The spike code is not in this pull request. It lives on the branch
`spike/workers-go-no-go` (head `010e947`) under `experiments/workers-spike/`.
Reason: it is throwaway harness code with its own `package.json`, a vendored
recording and Python tooling, none of which the repository's lint, format and
type gates are set up for, and nothing depends on it. This bundle holds the
write-up and the small result summaries the numbers come from.

Related: the hosting decision is in #310, the extend-path finding in #311.

| | |
|---|---|
| Subject | guinea-pig A, `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L`; B and C scanned read-only |
| Payer for dry-run extend | a public testnet account; its secret was never loaded |
| Runtime variants | `nobuf`: compatibility date 2024-01-01 (no global `Buffer`/`process`); `buf`: 2026-10-01 (global present, no flag set; Cloudflare turns Node compatibility on by default from 2026-08-04) |
| Deployed | two disposable Workers on a free account, then deleted (see Cleanup) |

---

## Verdict

**Recommended: Workers Paid (about $5 per month) for the Worker that runs the
scan and extend engine; Workers Free only for thin Neon-over-HTTP endpoints.**

1. **Output is correct.** Scan matches the CLI byte for byte on recorded RPC
   data and 30 of 30 times live, on both runtime variants.
2. **CPU is the constraint.** Cloudflare's own per-invocation CPU figure is
   10-20 ms median for a scan and 17-29 ms for an extend dry run, against the
   free limit of 10 ms. Nothing failed in about 1,900 requests, but that is
   Cloudflare's documented tolerance for occasional overruns, not headroom.
3. **Neon is reachable and cheap over HTTP** (CPU p50 3-4 ms, one subrequest per
   query) from the edge.
4. **One real finding:** extend preparation needs a global `Buffer` (§5, #311).

---

## 1 · Scan and extend against the CLI

Live RPC cannot be pinned to a ledger (`getLedgerEntries` has no ledger
parameter), so there are two comparisons: **record/replay** (the CLI's RPC bytes
are recorded, then replayed to both the CLI and the Worker with the clock frozen;
any difference is runtime behaviour) and **live back-to-back** with only ledger
drift masked.

| Case | `nobuf` | `buf` |
|---|---|---|
| scan A, JSON and human, replay, byte for byte | identical | identical |
| scan A+B+C, JSON and human, replay, byte for byte | identical | identical |
| scan A, JSON, live, deployed, N=30 (ledger fields masked) | 30/30 | 30/30 |
| scan A+B+C, JSON, live, deployed, N=30 | 30/30 | 30/30 |
| extend A dry run, replay, byte for byte (incl. prepared XDR and hash) | **differs: `SIMULATION_FAILED`, exit 2** | identical |
| extend A dry run, live, deployed, N=30 (wider mask, below) | 0/30 (same cause) | 30/30 |

Wider mask for live extend: also `extendToLedgers`, `recordedAt`,
`simulatedAtLedger`, `transactionXdr`, `transactionHash`, `feeStroops` and
`estimatedFeeStroops`. Two back-to-back CLI runs differ in exactly those fields
(timebounds change the XDR and hash; the simulated fee moved between 8,458 and
8,461 stroops). Unmasked equality was 0-2 of 30. Hashes here are **prepared
hashes from a dry run, not transactions**.

Negative control: a live CLI run (ledger 5208375) against the replay run (ledger
5208397) differs exactly in `observedAtLedger` and `remainingLedgers` (22
ledgers); `endsAtLedger` is unchanged. The failing `nobuf` extend row shows the
comparator does detect a real difference.

## 2 · Subrequests (counted by wrapping `fetch` inside the Worker)

| Path | Subrequests |
|---|---|
| scan, 1 or 3 contracts | **3** (`getNetwork`, `getLedgerEntries` for instance keys, `getLedgerEntries` for the code key); independent of contract count |
| extend dry run | **7** (the 3 scan calls, state-archival config, `getNetwork`, account, `simulateTransaction`); `nobuf` fails after 6 |
| Neon `neon()` over HTTP | **1 per query** |
| Neon WebSocket `Client` | **1 per request**, for any number of queries (1, 2, 5) |
| extend submit | not run; about 11 by reading the code (inferred, not measured) |

The free limit is 50 per request (Cloudflare docs, read 2026-10-15). No
subrequest error occurred.

## 3 · CPU time, deployed (free plan)

**Source:** `wrangler tail --format json`, field `cpuTime` (integer ms) per
request, joined to the client's requests by `cf-ray`. This is the figure
Cloudflare enforces against. It is rounded to whole milliseconds and includes
the spike's own instrumentation (a `fetch` wrapper that clones each request and
reads each body twice). Cross-check: Workers GraphQL analytics
(`workersInvocationsAdaptive`, account-wide): 1,747 successes, **p50 9.7 ms, p90
32.0, p99 60.8, p99.9 88.9**, 0 errors.

Sequential, N=30 per row, ms, p50 / p90 / max:

| Route | `buf` | `nobuf` |
|---|---|---|
| platform baseline `/facts` (no I/O) | 1 / - / 2 | |
| scan A, JSON | 14 / 39 / 44 | 20 / 47 / 82 |
| scan A, human | 10 / 21 / 46 | n/a |
| scan A+B+C, JSON | 12 / 43 / 50 | 14 / 27 / 56 |
| extend A dry run | 29 / 76 / 79 | 17 / 36 / 46 (fails early) |
| core `scanContract` only, no CLI layer, A | 9 / 16 / 18 | n/a |
| Neon HTTP, 1 query | 3 / 10 / 11 | 3 / 7 / 8 |
| Neon HTTP, 2 queries | 3 / 6 / 11 | 4 / 8 / 11 |
| Neon WebSocket, 1 query | 12 / 23 / 31 | 10 / 30 / 31 |
| Neon WebSocket, 2 queries | 6 / 16 / 24 | 7 / 13 / 20 |
| Neon WebSocket, 5 queries | 6 / 11 / 17 | 8 / 21 / 23 |

Sustained-load probe on `buf` (read only; tail drops events under load, so CPU
is from the matched subset): scan A at concurrency 24, 300 requests (about 20
per second): 300/300 HTTP 200, 228 matched events, CPU p50 11 / p90 36 / max 54.
Extend dry run at concurrency 8, 60 requests (about 3 per second): 60/60 HTTP
200, 53 matched, CPU p50 25 / p90 53 / max 89.

**The local figure was far too optimistic.** Under local `wrangler dev` a scan
or dry run was 2-4 ms CPU (`raw/measure.jsonl`, Node 24 baseline 1.01 ms per
scan). Deployed is about 3-5 times higher (cold isolates in several data
centers, edge CPU, SDK work, instrumentation). Local numbers are not free-plan
enforcement and should not be quoted as such.

**Does this reflect the free 10 ms limit being enforced?** The figure is the one
Cloudflare enforces against, and a large share of requests exceed 10 ms, yet
there was **no** `exceededCpu`, error 1102 or non-200 in about 1,900 requests
(all tail outcomes `ok`, GraphQL errors 0). The docs say each isolate has "some
built-in flexibility" and is terminated only if it "starts hitting the limit
consistently". So: no errors observed, but this is tolerance, not headroom. At
what volume and CPU mix it flips to 1102 is `undetermined`.

Worker startup time was 58-64 ms (limit 1 s); the bundle (2,298 KiB raw, 351 KiB
gzip, includes the Neon driver) was accepted on the free plan.

## 4 · Neon from the edge (read only)

Queries were `SELECT 1` and `SELECT version()` only (PostgreSQL 18.6) against a
pooled endpoint in ap-southeast-1 (Singapore) with the serverless driver 1.2.0.
No tables, schema, roles, branches or projects were created. 300 deployed
requests, 0 errors. Times are in-Worker wall ms. Latency follows the Cloudflare
data center that served the request, so the table splits it out.

| Transport | Variant | q/req | subreq | request wall p50 all / p90 | p50 Singapore only | connect p50 | 1st query p50 SIN / HKG / MRS |
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

Reading: the first query takes about 8-49 ms when the request is served in
Singapore (same region as the database), 40-158 ms in Hong Kong and 146-456 ms in
Marseille. Requests from one client landed in Singapore about 66% of the time,
Hong Kong 19%, Marseille 12% and Osaka 3%, so the data center is not stable.
Smart Placement and Hyperdrive were not tried, so whether they remove the
Hong Kong and Marseille tail is `undetermined`. Over HTTP Neon is not the CPU
problem (p50 3-4 ms); over WebSocket it costs more (p50 6-12 ms, p90 11-30),
because every request opens a new TLS, WebSocket and Postgres handshake and a
`Client` cannot be reused across requests in workerd.

The earlier local run (workerd on the author's computer, 240 requests, 0 errors)
showed the same transports working, a warm query at about 25 ms, and the same
subrequest counts (`raw/measure-neon.jsonl`).

## 5 · Finding: the extend path needs a global `Buffer` (#311)

Without a global `Buffer`, `extensionKey` throws `ReferenceError: Buffer is not
defined` at `packages/core/src/extend.ts:41`. `executeExtensions` catches it and
records `SIMULATION_FAILED: Extension preparation or fee validation failed.
Nothing was submitted.`, which hides the cause (`raw/diff-nobuffer.extend.json.txt`
shows the failing record against the passing one). It fails loudly, not silently,
and the same behaviour reproduced on the deployed `nobuf` Worker.

Other `Buffer` uses in the same family: `extend-rpc.ts:70`, `:115`, `:140` and
`ed25519-signer.ts:34`. The scan path was already fixed to use `atob`/`btoa`;
`packages/core/test/browser-no-buffer.test.ts` covers only `scanContract`.
Impact: none on a Worker with compatibility date 2026-08-04 or later or with
`nodejs_compat`; it breaks an older date, `no_nodejs_compat` and a browser.
`packages/core` was not edited.

## 6 · Cleanup

`wrangler delete --force` on both Workers returned "Successfully deleted".
Readback: listing the account's Worker scripts returned an empty result; asking
for one of them returned "This Worker does not exist on your account"; both
workers.dev URLs return 404. Secrets went with the Workers. No `.dev.vars` or
token is in the tree. Raw `wrangler tail` output, which contains the client
address, was kept outside the repository; only a per-request CPU extract was
kept (on the spike branch). A grep of this bundle for connection strings, hosts,
account identifiers, tokens, IPv4 addresses and email addresses found nothing.

## Undetermined

- The free-plan CPU enforcement threshold under real traffic; the split between
  warm and cold isolates (tail does not expose an isolate id).
- Extend submit and SEP-41 `transfer_from`: no signing key was supplied. Submit
  subrequests (about 11, inferred) and CPU including signing (Ed25519 signing was
  about 2 ms locally) are not measured.
- Smart Placement, Hyperdrive and Queues: not created or tested.
- Scaling beyond three contracts: only A, B and C exist; scan stayed at 3
  subrequests with similar CPU for one versus three contracts.
- Whether the pooled Neon endpoint suits the database layer (prepared
  statements, session state).

## Files

| File | What it is |
|---|---|
| `raw/measure.jsonl` | local workerd CPU and wall, per run |
| `raw/measure-neon.jsonl` | local Neon probes |
| `raw/node-baseline.json` | Node 24 CPU per scan against the recording |
| `raw/compare-live.txt` | live scan-vs-CLI comparison, local |
| `raw/diff-nobuffer.extend.json.txt`, `raw/worker-nobuffer.extend.json.out` | the failing extend dry run without `Buffer`, local |
| `raw/deployed/cpu-by-route.json` | deployed CPU distribution per route and variant |
| `raw/deployed/graphql-analytics.json` | account-wide analytics cross-check |
| `raw/deployed/neon-summary.json` | deployed Neon results per transport and data center |
| `raw/deployed/summary-*.json`, `run-log-nobuf-scan-extend.txt` | per-route summaries of the live comparison |
| `raw/deployed/burst-log*.txt` | sustained-load probes |
| `raw/deployed/diff-nobuf.extend.json.txt` | deployed extend diff without `Buffer` |
| `SHA256SUMS` | integrity manifest, checked by `pnpm check:evidence-integrity` |

Per-request rows, the `wrangler tail` extract, replay outputs and the harness
are on `spike/workers-go-no-go` (`experiments/workers-spike/results/` and
`tools/`).
