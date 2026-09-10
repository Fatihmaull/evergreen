# W2-D8-03 review follow-up — unknown coverage is exit 3

Read-only Testnet A observation on 2026-09-09. The actual compiled CLI ran `scan <A> --json` without a keys file or empty-data assertion. It returned **exit 3**, zero explicit data keys and no RPC issues, while observing healthy instance/code TTL. This reproduces the case Fatih raised and distinguishes missing scope information from observed low TTL.

A is `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L`. Both responses observed ledger **4,580,470**. Instance remaining TTL was **132,178**, code remaining TTL **710,359**, both above 17,280. The scan does not establish data-entry health. The presence of A's known data keys is why no `--no-data-keys` assertion was made against it.

## Artifacts and provenance

- [CLI JSON](scan.json), [exit code](cli-exit.json), [human rendering](scan-human.txt). The human view is an offline rendering of the same JSON at the final response capture time, not a second read.
- Network verification: [request](01-getNetwork-request.json), [raw response](01-getNetwork-response.json), [capture metadata](01-getNetwork-meta.json).
- Instance: [request](02-getLedgerEntries-request.json), [raw response](02-getLedgerEntries-response.json), [capture metadata](02-getLedgerEntries-meta.json).
- Code: [request](03-getLedgerEntries-request.json), [raw response](03-getLedgerEntries-response.json), [capture metadata](03-getLedgerEntries-meta.json).
- [Prior four-entry replay](prior-four-entry-replay.json): the Sep 8 four-entry JSON still evaluates to 0 under the revised helper; this is offline regression evidence, not a fresh four-entry observation.
- [Artifact checksums](SHA256SUMS).

Raw response bodies are captured byte-for-byte at the SDK fetch boundary, before decoding, using a cloned response. The wrapper allows only the public Testnet endpoint, `getNetwork` and `getLedgerEntries`. Entry ledgers and TTL values in the CLI JSON were independently compared with these responses.

The no-data assertion's exit-0 behavior, below-threshold exit 1, errors 2, unknown/missing/unavailable observations 3, and mixed-result precedence are tested offline. Caller-declared absence is never presented as measured absence. Original Sep 8 evidence is unchanged. No transaction, seeding, extension or B/C read was made in this follow-up.

## Repeat the live read

After building with `pnpm typecheck`, from the repository root:

```bash
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org \
  node packages/cli/dist/bin.js scan \
  CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L --json
```

Later TTLs can differ as ledgers advance or other actors change entries. Exact request/response capture times are in the metadata above. No transaction hash or explorer transaction screenshot applies to this read.
