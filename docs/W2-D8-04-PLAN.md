# W2-D8-04 — Ledger-key and consumer deduplication plan

Status: implementation approved and in progress, 2026-09-09. Owner: Rakha.
Branch: `feat/W2-D8-04-ledger-key-dedup`, based on PR #60 at `567089c`.
The existing preparation commit is retained. Implementation starts after integrating local parent follow-up `cad029e` and merged W1 baseline `88372ec`.

## Outcome

Scanning two contracts that share Wasm returns one code entry with both unique consumer IDs, plus their distinct instance/data entries. Each canonical key is requested once per scan, in batches of at most 200. This provides the correct unit for later cost estimation and reporting; this task does not calculate rent.

## Proposed API and compatibility

Add a core export `scanContracts(reader, requests)` with core-local input type:

```ts
interface ContractScanRequest {
  readonly contract: ContractRef;
  readonly dataKeys?: readonly LedgerKey[];
  readonly noDataKeys?: boolean;
}
```

Return the existing `ScanResult`. Preserve `scanContract(reader, contract, dataKeys, options)` as a one-request wrapper so existing CLI callers continue to work. Reuse the existing shared types and RPC reader rather than introducing another domain result or network API. Keep the legacy instance-only API exported, with unique consumer IDs for repeated inputs; it must still report unknown coverage.

Repeated contract IDs are normalized before reads. Union valid explicit data keys and unique consumer IDs. Keep the first supplied display label deterministically; labels are descriptive, not separate contract identities. An explicit empty-data assertion combined with nonempty supplied data anywhere for the same contract is an input error, not a last-write-wins configuration. Exclude that contradictory contract from reads while retaining diagnostics and scans of independent valid contracts.

## Read and assembly flow

1. Validate contract IDs and explicit data keys using the D8-03 checks. Preserve per-contract input diagnostics and coverage. No arbitrary storage enumeration.
2. Build unique instance keys and their consumers; read in batches up to 200.
3. Derive Wasm keys only from valid observed instances. Combine shared code consumers and validated persistent/temporary keys before the second read phase.
4. Read each remaining unique key once. Keep each observation's own response ledger; different batches are not an atomic network snapshot.
5. Assemble one entry per key with a unique list of known input consumers. A shared-key failure names all known affected consumers; a failed batch names only the consumers associated with its keys.
6. Preserve successful independent observations when another contract/batch fails. Keep D8-03 validation for malformed, unrelated and duplicate response entries. Discard conflicting duplicate observations rather than choosing a convenient value. Missing entries are not proof of archival/deletion.

Coverage remains `known-keys`, keyed per contract. An empty keys file or unspecified keys remains unknown; `noDataKeys` remains a caller assertion. Unknown TTL stays unavailable and remaining TTL zero stays live. Existing exit-code semantics and the Proposed ADR-006 are inherited, not re-decided here.

## Implementation sequence

1. Add focused regression fixtures/tests for two contracts sharing one Wasm, including reader-call assertions.
2. Generalize the core scan orchestration and retain the single-contract wrapper. Correct repeated consumers in the legacy instance-only path.
3. Cover validation, batching, partial errors and per-contract coverage; retain the existing single-contract and CLI tests.
4. Update core README and ARCHITECTURE with the actual API and guarantees.
5. Run `pnpm check`, then capture a bounded read-only Testnet scan demonstrating two distinct contracts and their common code key. Use documented B/C instance and shared-code reads only; do not seed, deploy, extend, restore or change calibration. State unknown additional-data coverage honestly.
6. Save unedited RPC responses, request metadata, output and checksums, with offline fixtures clearly separated from the fresh observation. Update repo/Notion outcome, then review results with Rakha before opening a review PR.

## Acceptance checks

- Two contracts sharing Wasm: exactly one code entry, both consumers once, one RPC request for that code key.
- Repeated contract IDs and whitespace-equivalent serialized data keys do not duplicate reads, entries or consumers.
- Distinct Wasm keys remain distinct; separate contract data with similar application keys is not merged incorrectly.
- More than 200 keys batch correctly and retain each response ledger.
- One failed instance/batch does not erase unrelated successes or infer unknown shared consumers.
- Shared code missing/malformed produces diagnostics covering all known affected consumers.
- Conflicting duplicate response entries are discarded and reported.
- Coverage counts/assertions remain per contract; contradictory duplicate inputs fail explicitly.
- Existing single-contract behavior, TTL zero boundary, unavailable TTL and CLI exit-code regression tests remain green.
- Read-only Testnet evidence confirms shared-key identity and output structure; no transaction is needed.

## Scope and review dependencies

CLI multi-contract syntax/configuration, severity ranking, rent, payer selection and engine execution retain their existing tasks and owners. No new transaction path or shared-domain schema is planned. If implementation reveals a required change to that boundary, document it before expanding scope.

Fatih endorsed the PR #60 exit scheme and requested documentation consequences; those are prepared locally in `cad029e`, pending final acceptance/publication. Planning and isolated implementation can proceed on this dependent branch, but integration follows the accepted parent. If a child PR exists, retarget it to main before merging/deleting the parent branch; synchronize and rerun affected checks as needed. W1 closeout #57/#59 is now merged. Audit #61 and A-extension evidence #62 are open at implementation start; Fatih reports A instance/data extended and shared code/B/C unchanged. No A maintenance transaction belongs to this task.

The branch is visible as WIP for coordination. This plan is not a completed implementation or a ready-for-review PR. Task Tracker remains the weekly narrative; Evergreen Tasks receives task-boundary status updates.
