# W2-D12-02 — broader read-only storage advice validation

Captured **2026-09-11 09:19:27 UTC**, using the published D12 implementation at `38e6543` (PR #88), on `test/W2-D12-02-storage-advice-validation`. This is new validation evidence, not an optimizer feature or a claim of merge. No production source was changed.

## Results and interpretation

| Subject | Observations | Advice / result | Interpretation |
|---|---|---|---|
| A | Reuse [Sep 10 A evidence](../2026-09-10-storage-advice/README.md) | Four entries, three recommendations | Dated live baseline, not a new read or a claim that its old JSON schema is the current schema. Current sharing caveats are exercised below. |
| B/C/B | Two unique contracts, seven unique requested keys, five returned entries | Two persistent durability findings, one shared-code finding; exit **3** | B/C temporary keys were absent. This is incomplete requested scope, not a new observation of their deletion boundary. No advice was fabricated for missing keys. |
| Blend TestnetV2 | Instance, code and two documented USDC persistent keys, all live | Two durability findings, one code dependency finding; exit **0** | Success covers only the supplied keys; no full-storage enumeration or exclusivity claim. |

B/C shared code occurs once and carries exactly the two input consumers. A is a known additional consumer from separate project evidence but was not in this scan, so the report does not claim a global census. B/C instance/persistent/code expiry ledgers were unchanged in the immediate post-read. This is a bounded no-change observation, not a replacement for the standing decay-drift task.

### Third-party provenance and semantic check

The official [Blend Testnet registry](https://github.com/blend-capital/blend-utils/blob/b05242df30b6b6caf9d317646f754541824a5a8b/testnet.contracts.json) supplies `ids.TestnetV2`, the USDC asset contract, and the expected lending-pool Wasm hash. The deployed code key matched `a41fc53d6753b6c04eb15b021c55052366a4c8e0e21bc72700f461264ec1350e`.

[Pool storage source](https://github.com/blend-capital/blend-contracts-v2/blob/ba22b487b2c5057a4ecc28b05b5193c28e4bd117/pool/src/storage.rs) defines the `ResConfig(Address)` and `ResData(Address)` enum keys and stores them persistently. We encoded exactly those keys for registry USDC; we did not guess arbitrary storage names or call contract getters. The getters themselves extend TTL, which is why this validation reads ledger entries directly.

Decoded returned payloads confirm the intended roles: config includes collateral/liability factors and supply cap; reserve data includes supplied/borrowed balances and backstop credit. Those are required configuration/accounting, **not evidence of disposable data**. The optimizer says “Only if” disposable/recomputable and explicitly keeps balances/required configuration persistent. The condition is not met by these known roles, so the report is not interpreted as a recommendation to migrate the reserve. This validates the basic conditional wording, not an automatic understanding of application semantics.

No current rent was requested or inferred. All per-key current prices are unavailable; the 103,849 / 53,196 historical rent comparison remains explicitly a benchmark, not a Blend quote or promised saving. No size, duplicate-content or whole-contract optimization claim is made.

## Captured ledger values

All initial entry reads observed ledger **4,618,955**.

| Entry | Last live ledger | Remaining |
|---|---:|---:|
| B instance | 4,793,687 | 174,732 |
| C instance | 4,880,097 | 261,142 |
| B persistent | 4,793,688 | 174,733 |
| C persistent | 4,880,099 | 261,144 |
| Shared B/C code | 5,290,829 | 671,874 |
| Blend instance | 6,062,102 | 1,443,147 |
| Blend USDC reserve config/data and code (each) | 6,040,232 | 1,421,277 |

## Artifacts and validation

- [Input and settings](input.json), [verification](verification.json), [offline verification](offline-verification.json), [pinned provenance](provenance.json).
- [B/C JSON](bc/report.json), [B/C human output](bc/human.txt), [Blend JSON](blend/report.json), [Blend human output](blend/human.txt). Human views render the same captured core results; they are not separate live CLI runs or a new batch command.
- Numbered request/response files in network/, bc/, blend/ and bc-post/ are full unedited JSON-RPC text. Fetch allowed only getNetwork/getLedgerEntries at the official Testnet endpoint. No simulation, account funding, deployment, invocation, signing, send or restore.
- `verify.mjs` replays both subjects offline, matches every output TTL/ledger against raw responses, checks query deduplication and expected findings, validates the Blend payload roles/hash, and checks B/C post-read expiry equality. It refuses network access.
- `pnpm check` passed **340 Vitest + 36 Node = 376 tests**; the offline verifier additionally passed both cases. No runtime change or coverage-threshold change.

Offline reproduction from the repository root after building:

```bash
pnpm build
node docs/evidence/2026-09-11-storage-advice-validation/verify.mjs
node docs/evidence/2026-09-11-storage-advice-validation/review-mutations.mjs
```

Internal review strengthened the offline verifier to check complete post-read key sets, direct registry hash equality, raw network settings and explicit result expectations. Four corrupted temporary-copy cases are rejected for their intended reasons; the original capture still passes. [Review results](review-mutation-results.json) and [review report](../../W2-D12-02-REVIEW.md) document this correction. The 15 original raw RPC/provenance files are unchanged; checksums for changed verification scripts and new review artifacts are refreshed.

For a new live capture, copy only capture.mjs and the provenance registry into an empty new directory at docs/evidence/<new-date>/, verify current deployment provenance first, then run the script there. The recorder refuses to overwrite a completed capture. Archived/missing future deployments are not grounds to restore or redeploy them as part of this task.
