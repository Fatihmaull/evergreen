# TTL boundary observation — W1-D4-13

Status: **confirmed**, 2026-09-06. The same temporary entry was present on its advertised final live ledger and absent on the next ledger. This is an observation of temporary-entry expiry on Stellar Testnet, not an engine bump demonstration.

## Result

| RPC `latestLedger` | Remaining ledgers | Entry returned? | Unedited response |
|---|---:|---|---|
| **4,529,810 (L)** | **0** | **Yes**, same key and `liveUntilLedgerSeq = 4529810` | [Final live ledger](boundary-ledger-4529810.json) |
| **4,529,811 (L+1)** | **-1** | **No**, valid `entries: []` | [First absent ledger](boundary-ledger-4529811.json) |

The observer captured **412 distinct ledgers**, finishing at 05:30:52 UTC (12:30:52 WIB). [The derived result](boundary-result.json) and an independent offline replay both report `confirmed`. The two decisive files were also inspected directly. Remaining TTL equal to zero is still live; expiry is `currentLedger > liveUntilLedgerSeq`, consistent with the official semantics cited below. This direct observation covers the temporary entry in this experiment.

## Experiment

- Reused isolated contract: `CBVX3LUUEZR4HQEPZI3E6DZJN4KGST6EICMVJ5SXIZMSS3DQRZACMWZX`.
- The [preflight response](preflight-isolated-entry.json) confirms the instance was live and its old temporary entry absent. The earlier [inconclusive run](../2026-09-05-ttl-boundary/README.md) is retained unchanged.
- Simulated before submitting a single `seed(1)` invocation. The existing fixture writes its own persistent, temporary, and instance data; it does not extend any TTL explicitly or invoke B/C.
- Seed ledger: **4,529,091**, at **2026-09-06 04:30:42 UTC**.
- Advertised final live ledger: **4,529,810**, with **719 remaining ledgers** at creation.
- Required observations: the exact same key present at **4,529,810** and absent at **4,529,811**. A missing/error response is not proof of expiry.
- Documented expectation: an entry stops being live when `current_ledger > liveUntilLedger`, from the [official state-archival semantics](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival#live-until-ledger), checked 2026-09-06.

## Transaction evidence

| Action | Hash | Full RPC response | Explorer screenshot |
|---|---|---|---|
| Reseed isolated fixture, developer key | `8617c2f39f39d27a88ef8577e23e0b06ad1f2354fba906b6f04f6dfc72a3e34a` | [JSON](boundary-seed-transaction.json) | [JPEG](boundary-seed-explorer.jpg) |

[Explorer transaction](https://stellar.expert/explorer/testnet/tx/8617c2f39f39d27a88ef8577e23e0b06ad1f2354fba906b6f04f6dfc72a3e34a). Maximum fee: 25,073 stroops; explorer reports 14,175 stroops charged, all Testnet XLM. The send and simulation responses are also preserved unedited.

## Capture and verification

The [one-time script](boundary-experiment.mjs.txt) is preserved as executed, including the original machine paths and pre-publication directory names; it is provenance rather than a portable command. It uses `@stellar/stellar-sdk@17.0.1` from a temporary tools directory. This does not add a product dependency. Its default seed mode simulates; only `seed --live` submits. Polling uses public read-only RPC and loads no signing key.

Each `boundary-ledger-N.json` is an unedited response to `getLedgerEntries` for the exact key in [boundary-observation.json](boundary-observation.json). The filename uses that response's own `latestLedger`. Only the first valid response at each ledger is stored. Sampling waits 10 seconds plus request latency while far from expiry, then 500 milliseconds plus latency for the final 120 ledgers. Polling can resume from saved samples if interrupted. Failed HTTP/RPC reads and results without a valid ledger number or entries array are retried. The publication verifier additionally rejects malformed entry contents; all 412 captured responses passed that stricter validation.

Offline checks, from the repository root:

```bash
pnpm test:ttl
node scripts/verify-ttl-boundary.mjs docs/evidence/2026-09-06-ttl-boundary
```

The verifier needs both adjacent ledgers and rejects RPC errors, malformed entries, changed TTLs, or conflicting observations. Each capture requests exactly one key: only `entries: []` can establish absence; unrelated keys, invalid array members, and multiple entries are rejected. Exit 0 means confirmed; exit 2 means inconclusive or contradicted, distinguished in the output.

The 9 original tests passed before the repeat began. Publication review added two regression tests after reproducing false confirmation from malformed array contents or duplicate entries. All 11 tests now pass, and replay still confirms the same 412 raw responses. `pnpm test` and therefore `pnpm check` and GitHub CI include the verifier suite alongside the 5 existing placeholder tests.

## Protected decay subjects

[Preflight B/C and code response](preflight-protected-entries.json) and [after-run response](after-protected-entries.json) show unchanged B instance **4,793,687**, C instance **4,880,097**, and shared code **5,290,829**. No engine scheduler or automatic bump is part of this experiment. The earlier 189 samples also match the [SHA-256 preservation manifest](previous-samples-sha256.json).

`experiment.json`, `boundary-seed-intent.json`, `boundary-observation.json`, `boundary-result.json`, and the preservation manifest are authored or derived metadata. The authored `experiment.json` now points to the published first-run folder; raw RPC files, the captured script, and explorer image remain byte-for-byte source evidence. No secret keys are included.
