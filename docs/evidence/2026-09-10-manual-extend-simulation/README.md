# W2-D11-01 — unsigned manual extension simulation

Captured 2026-09-10 using the actual built CLI from the D11 implementation branch. No secret was supplied or read, no signature created, and no transaction submitted. D11-02/03 remain Pending.

```bash
pnpm typecheck
node --import ./docs/evidence/2026-09-10-manual-extend-simulation/capture.mjs packages/cli/dist/bin.js extend CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L --ledgers 1000 --source-account GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB --json
```

The capture hook wraps fetch, permits only the official Testnet endpoint and getNetwork/getLedgerEntries/simulateTransaction, and saves exact request/response text without reformatting. It refuses sendTransaction and every other method. Copy the capture directory to a new dated directory before reproducing: the recorder writes numbered files beside itself. The first capture predates the later addition of a prepared-hash line in stderr; the recorded stdout already contains that locally computed unsigned hash. Original captures are unchanged.

| Observation | Value |
|---|---|
| Selected write scope | A instance only; no data keys or Wasm |
| Before response ledger | 4,601,296 |
| Before live-until | 6,025,589 |
| Before remaining | 1,424,293 |
| Requested additional ledgers | 1,000 |
| Resolved target | 1,425,293 |
| Prepared total envelope fee | 15,073 stroops (resource fee + 100 inclusion fee) |
| Outcome | simulated / dry-run / exit 0 |

`01`/`05` verify network; `02`/`03` read A's instance and discovered code for scan context; `04` reads network settings; `06` reads the public payer account; `07` simulates the one-key footprint. Only the instance appears in the unsigned transaction. Reading code is not extending it. B/C were not scanned or modified; this is not a decay-drift measurement.

[CLI JSON report](cli-report.json) and [stderr preview](cli-stderr.txt) preserve the result. RPC `*-response.json` files are full unedited responses; requests are saved alongside them. The report's transactionHash is a locally calculated **prepared hash**, not an on-chain transaction receipt. There is no explorer screenshot because there was no transaction. TTL increase has not been demonstrated by this simulation; a later controlled live proof must capture before/after observations, full RPC and an explorer screenshot.
