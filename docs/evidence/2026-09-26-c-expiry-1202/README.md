# Guinea-pig C — expiry observed 2026-09-26 12:02 UTC

The read-only collector observed C at **2026-09-26 12:02:42.713 UTC / 19:02:42.713 WIB**, ledger **4,880,115**. This is above both the instance's recorded final live ledger **4,880,097** and the persistent entry's **4,880,099**. Both entries were returned by RPC with the documented non-live zero TTL representation; A and the shared code control remained live and unchanged.

The frozen v1 collector's original verdict is **`unverified` / `INVALID_SUBJECT_TTL`, exit 2**. It is retained without alteration. The separate offline assessor first verifies the sealed bundle and the embedded, same-subject live C baseline observed at **00:01:34.722 UTC**, then reports **`phase: expiry-observed`**, `representation: rpc-non-live-zero`, exit **0**. These are different claims from different tools, both visible in the record.

The collector was not started at 12:00:00 UTC: a read-only scan then showed ledger 4,880,085, below the persistent boundary. Another scan showed ledger 4,880,103 before capture. The scans were operator preflight, not separate sealed expiry bundles. Friday's Rakha 12:00 UTC capture remains missed and Fatih's raw Friday fallback has not been received; this record does not reconstruct it. No transaction, extension, restoration or email was sent.

## Evidence and verification

- [`capture/`](capture/) is the unedited sealed collector directory, including the embedded verified live baseline, five raw JSON/RPC request/response pairs and transports, original TXT stdout/stderr, manifest, result, and `SHA256SUMS`. The original remains at `.evergreen/crossing/C-20260926-1202` in the isolated capture worktree.
- [`assessment.json`](assessment.json) is a separate offline assessor result bound to the sealed manifest, checksum inventory, result and embedded baseline hashes. It leaves the collector verdict unchanged.
- [`terminal-C-expiry.png`](terminal-C-expiry.png) is an inspected native Konsole screenshot taken with Spectacle. It displays a later **replay** of both the original v1 verdict and the offline assessor's expiry verdict, not a second chain observation. [`screenshot-metadata.json`](screenshot-metadata.json) binds its hash and display time; [`terminal-replay-command.sh.txt`](terminal-replay-command.sh.txt) records the display command.

From a checkout with the verified assessor:

```sh
(cd docs/evidence/2026-09-26-c-expiry-1202/capture && sha256sum -c SHA256SUMS)
pnpm verify:expiry docs/evidence/2026-09-26-c-expiry-1202/capture
```

Acceptance is `phase: expiry-observed` from `verify:expiry`. The v1 `verify:crossing` exit 2 is expected for this documented zero TTL response and must not be treated as a failed observation or edited into a pass. The capture source commit is `c38e77f990702809dfcae8ca88321876543abab5`; the manifest retains fresh-build provenance and runtime hashes. No transaction hash or explorer transaction screenshot exists for a read-only guard refusal.
