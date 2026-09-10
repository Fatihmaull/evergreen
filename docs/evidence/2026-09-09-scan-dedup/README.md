# W2-D8-04 — Shared Wasm and duplicate-input read-only proof

Captured **2026-09-09 12:15:42–43 UTC**, from the compiled core implementation at `f5065b52b775c26ae5ab9940812492ae21005111`. This is a real Testnet read of B/C, not a synthetic fixture. No transaction, deployment, seeding, restore, extension or engine configuration change occurred.

Input: **B, C, B** (the repeated B is deliberate). Output: **two unique contracts, three unique entries** — B instance, C instance and one shared Wasm. After `getNetwork` verified Testnet, exactly two `getLedgerEntries` requests carried **2 keys, then 1 key**. The shared Wasm was requested once and lists B and C once each.

Both entry responses observed ledger **4,586,511**:

| Entry | Last live ledger | Remaining | Known consumers |
|---|---:|---:|---|
| B instance | 4,793,687 | 207,176 | B |
| C instance | 4,880,097 | 293,586 | C |
| Shared code | 5,290,829 | 704,318 | B, C |

These are TTL expiry observations, not the calibrated bump-threshold crossing dates. Persistent/temporary keys were not supplied or read. Coverage remains unknown for additional data: the existing CLI health helper returns **3**, correctly, despite no RPC issues. No `noDataKeys` assertion was made. This is a core API invocation, not a new multi-contract CLI command.

## Evidence

- [Input](input.json), [scan JSON](scan.json), [human rendering](scan-human.txt), [verification](verification.json), [checksums](SHA256SUMS).
- Network guard: [request](01-getNetwork-request.json), [raw response](01-getNetwork-response.json), [metadata](01-getNetwork-meta.json).
- Unique instances: [request](02-getLedgerEntries-request.json), [raw response](02-getLedgerEntries-response.json), [metadata](02-getLedgerEntries-meta.json).
- Shared Wasm: [request](03-getLedgerEntries-request.json), [raw response](03-getLedgerEntries-response.json), [metadata](03-getLedgerEntries-meta.json).

Raw bodies were saved without editing from cloned fetch responses, before decoding. The capture wrapper allowed only the public Testnet endpoint and `getNetwork`/`getLedgerEntries`. Every output TTL and observation ledger was independently matched to the saved RPC response; unique request keys and the shared consumer set were asserted. `verification.json` records the source commit and source/compiled-file hashes.

The capture's final human-render step initially called a nonexistent formatter name; raw responses and scan JSON had already been saved. Rendering was completed **offline** with the existing `formatHuman` function, and assertions were rerun against saved responses. No additional live read was needed. The human view uses the final capture time as its projection reference; it is not another observation. Synthetic multi-contract fixtures in unit tests are labeled separately from this live proof.

## Repeat the core read

After `pnpm typecheck`, from the repository root:

```bash
node --input-type=module <<'JS'
import { connectTestnet, scanContracts } from './packages/core/dist/index.js';
const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';
const C = 'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL';
const reader = await connectTestnet('https://soroban-testnet.stellar.org');
const scan = await scanContracts(reader, [B, C, B].map(id => ({ contract: { id } })));
console.log(JSON.stringify(scan, null, 2));
JS
```

Later observations can differ. The Node snippet prints core output; process success alone is not a health verdict. `verification.json` separately records `exitCodeFor(scan, 17280) === 3` for this capture. No transaction hash or explorer transaction screenshot applies to a read-only proof.
