# Guinea-pig C — 2026-09-26 06:00 UTC decay checkpoint

The read-only collector observed guinea-pig C at **2026-09-26 06:00:29.362 UTC / 13:00:29.362 WIB**, ledger **4,875,768**. Its instance remained live with **4,329 ledgers** until its recorded end ledger **4,880,097**; its persistent entry still ended at **4,880,099**. At the normal 17,280-ledger action threshold, the write guard refused C. Strict offline replay returned `phase: crossing-refused`, `qualifiesCrossing: true`, exit **0**.

This is the scheduled Saturday 06:00 UTC second decay reading. Friday's Rakha 12:00 UTC capture remains missed; this record does not fill that slot. The verified 00:01 UTC C capture in [`../2026-09-26-c-crossing-0001/`](../2026-09-26-c-crossing-0001/README.md) remains intact as the planned same-subject live baseline for the expiry assessment. No transaction, extension, restoration or email was sent.

## Evidence and verification

- [`capture/`](capture/) is the unedited sealed collector directory: five raw JSON/RPC request/response pairs and transport records, manifest, result, original stdout/stderr TXT, and `SHA256SUMS`. The original remains under `.evergreen/crossing/C-20260926-0600` in the isolated capture worktree.
- [`terminal-C-1300.png`](terminal-C-1300.png) is an inspected native Konsole screenshot taken with Spectacle. It shows a **later replay** of recorded producer stdout and strict offline verification, not a second chain observation. The displayed time is separate from `observedAt`.
- [`screenshot-metadata.json`](screenshot-metadata.json) binds the screenshot to the sealed manifest and checksum inventory. [`terminal-replay-command.sh.txt`](terminal-replay-command.sh.txt) records the display command.

From the matching runtime checkout, verification is:

```sh
(cd docs/evidence/2026-09-26-c-crossing-0600/capture && sha256sum -c SHA256SUMS)
pnpm verify:crossing docs/evidence/2026-09-26-c-crossing-0600/capture --require-crossing
```

The capture source commit is `c38e77f990702809dfcae8ca88321876543abab5`; its manifest records a fresh build and runtime fingerprints. The verifier reports `observedAt: 2026-09-26T06:00:29.362Z`, `crossing-refused`, `qualifiesCrossing: true`, exit 0. A refusal has no transaction hash or explorer transaction screenshot.
