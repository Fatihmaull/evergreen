# W2-D12-01 — read-only storage advice on A

Captured 2026-09-10 from the D12 implementation (`a2d560b` runtime), based on main #85 independently of D11. Both actual CLI runs exited 0, stderr empty. No secret, payer lookup, quote, simulation, signing or transaction; capture refuses every method except getNetwork/getLedgerEntries at the official Testnet endpoint.

```bash
pnpm build
node --import ./docs/evidence/2026-09-10-storage-advice/capture.mjs packages/cli/dist/bin.js scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L --keys-file docs/evidence/2026-09-08-scan-entry-types/data-keys.json --optimize --json
# Repeat without --json for human output.
```

Copy the evidence directory to a new dated location before reproduction: the recorder saves numbered files beside itself under json-run/ or human-run/. Original response text is unedited. The JSON and human runs are separate observations, so their remaining TTLs differ as ledgers advance.

| Observation | JSON run | Human run |
|---|---|---|
| Settings response ledger | 4,602,255 | 4,602,265 |
| Network minimum temporary / persistent lifetime | 720 / 120,960 | 720 / 120,960 |
| Entries read | instance, persistent, temporary, code | same four kinds |
| Advice | durability review, temporary retention, shared-code dependency | same three kinds |
| Temporary remaining TTL | 1,423,343 | 1,423,333 |
| Current rent | unavailable, because --cost was not requested | explicitly unavailable, not zero |

The instance receives no durability-conversion suggestion. The temporary recommendation uses its actual long TTL rather than claiming imminent expiry from a historical minimum. The code recommendation names the known A consumer and explicitly allows unseen consumers; it is not a census. The historical 103,849 / 53,196 rent comparison is labelled as a benchmark, not forecast savings for these entries.

Artifacts: [complete JSON](cli-report.json), [human output](cli-human.txt), and exact request/response files in json-run/ and human-run/. Each run performed one getNetwork and three getLedgerEntries calls (instance, explicit data plus code, and network configuration). Neither read nor action is claimed on B/C; reading A's shared code does not extend it. D12-02's broader guinea-pig/third-party validation remains separate.

Offline checks also loaded the two built analyzer/evidence modules from an empty temporary directory with no repository fixtures or dependencies, confirming packaged advice does not read test files at runtime. Optional current-quote integration is tested offline, including failed quotes and measured zero; this capture deliberately demonstrates that ordinary advice needs no payer or simulation.
