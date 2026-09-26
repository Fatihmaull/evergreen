# Guinea-pig C — 2026-09-26 00:01 UTC decay checkpoint

The read-only collector observed guinea-pig C at **2026-09-26 00:01:34.722 UTC / 07:01:34.722 WIB**, ledger **4,871,461**. Its instance remained live with **8,636 ledgers** to its recorded end ledger **4,880,097**; the persistent entry's end ledger was **4,880,099**. At the normal 17,280-ledger action threshold, the engine's write guard refused to touch C. Strict offline replay returned `phase: crossing-refused`, `qualifiesCrossing: true`, exit **0**.

This is the Saturday 00:00 UTC scheduled decay checkpoint, captured **one minute after** the nominal time. It is also a verified, same-subject live baseline available for Saturday's expiry assessment if the original Friday baseline does not arrive from Fatih. It is **not** the missing Friday 12:00 UTC Rakha capture and is not a second independent operator observation.

The first collector invocation at approximately 00:00:07 UTC stopped before creating any bundle because the new worktree lacked the `.evergreen/crossing/` parent. After making that parent, the operator ran the collector into the new `C-20260926-0001` directory. No earlier observation was reconstructed or relabeled.

## Evidence and verification

- [`capture/`](capture/) is the unedited sealed collector directory, including five raw JSON/RPC request and response pairs, transport records, producer TXT, manifest, result, and `SHA256SUMS`. The original remains at `.evergreen/crossing/C-20260926-0001` in the capture worktree.
- [`terminal-C-0701.png`](terminal-C-0701.png) is an actual Spectacle screenshot of native Konsole. It shows a later **replay** of the recorded producer stdout and strict offline verification. The display time is distinct from the chain observation time.
- [`screenshot-metadata.json`](screenshot-metadata.json) binds that screenshot to the original manifest and its checksum inventory.

Verification from the same source/runtime checkout:

```sh
(cd docs/evidence/2026-09-26-c-crossing-0001/capture && sha256sum -c SHA256SUMS)
pnpm verify:crossing docs/evidence/2026-09-26-c-crossing-0001/capture --require-crossing
```

The verifier reported `observedAt: 2026-09-26T00:01:34.722Z`, `crossing-refused`, `qualifiesCrossing: true`, exit 0. The capture was made from `f6eed7f85469b00a95d546cbe216fd62f0f25c2b` with a fresh build and retained runtime hashes. No transaction was signed or submitted; there is no transaction hash or explorer screenshot for this refusal. B, C and shared Wasm were not extended or restored.
