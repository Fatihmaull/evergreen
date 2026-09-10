# `W2-D14-01` — test coverage report

**SOW §6.1 requires a "test coverage report" for Deliverable 1.** This is it. Generated 2026-09-10 with `pnpm test:coverage` (Vitest + v8), against `main` at the commit this directory was added.

[Raw report](coverage-report.txt) — the unedited console output, ANSI codes stripped.

## Summary

| | |
|---|---|
| Statements | **93.24%** (676/725) |
| Branches | **85.29%** (464/544) |
| Functions | **97.64%** (83/85) |
| Lines | **94.57%** (627/663) |
| Offline tests | **309** vitest + 36 node |

## The target was never a percentage

`docs/CONVENTIONS.md` § Testing asks for *"meaningful coverage on `core` math/cost/decision logic (~80%). Don't chase 100% on glue code."* Measured against that, per module:

| Module | Stmts | What it is |
|---|---|---|
| `ttl.ts` | 98.07% | TTL math, the two boundary predicates |
| `liveness.ts` | 96.77% | the run liveness assertion |
| `rent.ts` | 96.07% | per-unique-key rent summation |
| `health.ts` | 95.65% | blast-radius severity |
| `scan-contract.ts` | 95.42% | ledger-key dedupe, entry discovery |
| `rent-quoter.ts` | 100% | differential simulation pricing |
| `network-config.ts` | 88.57% | state-archival settings |
| `config.ts` | 86.74% | config load and validation |
| `rpc.ts` | 72.22% | **network adapter — see below** |

**Every math, cost and decision module is above 90%.** The one module below the guideline is `rpc.ts`, and deliberately: its uncovered lines are the live network adapter — `connectTestnet` opening a real server, and the transport error path. Covering those means either hitting the network, which unit tests here never do, or mocking the SDK's transport so thoroughly that the test asserts the mock rather than the code. The *reader* built on top of it is covered through the mock RPC client.

## Two things this run changed rather than just measured

**`rent-quoter.ts` was at 0%.** It is not glue — it holds the differential-simulation logic that isolates rent from the operation's fixed cost, which is the correctness core of the cost model. Six offline tests now pin it, including the case that motivated the whole approach: **an extend that needs no extension must report zero rent**, not the fixed operation cost.

**Thresholds now fail CI.** `vitest.config.ts` sets floors at 88/84/88/89, just under the current numbers, so an accidental drop breaks the build while honest refactors do not. A coverage number that nothing enforces drifts down quietly — the same shape as a check that fails in the safe-looking direction.

`packages/cli/src/bin.ts` is excluded from measurement. It is argv, stdout and exit codes; covering it would mean testing Node rather than Evergreen, and every decision it makes lives in `command.ts`, which is measured.

## Reproduce

```
pnpm install --frozen-lockfile
pnpm test:coverage
```

HTML and lcov reports are written to `coverage/` and are not committed — the text report above is the durable artifact, because an HTML directory of generated files is noise in a repo a reviewer reads.
