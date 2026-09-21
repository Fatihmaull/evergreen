# B expiry — separate offline reassessment

These are **new local assessments of unchanged original observations**, not new
chain captures or edited versions of their recorded verdicts. W3-D18-03a / #214.

| Original observedAt (UTC) | Ledger | Original verdict | Separate assessment |
|---|---|---|---|
| 2026-09-21T12:00:35.746Z | 4,793,689 | unverified / INVALID_SUBJECT_TTL / exit2 | expiry-observed |
| 2026-09-21T12:02:24.652Z | 4,793,711 | same | expiry-observed |
| 2026-09-21T12:04:29.000Z | 4,793,736 | same | expiry-observed |

Files120035.json,120224.json and120429.json correspond respectively to
`../2026-09-21-b-crossing-1200/attempts/120035`, `120224` and `120429`.
Each report hashes its source manifest, checksum list, original result and embedded
Sunday live baseline, plus the assessor and its runtime. The source bundles retain
all raw requests/responses, timestamps, metadata, original verdict and screenshot.

All three responses contain B instance and persistent XDR with explicit absolute
`liveUntilLedgerSeq: 0` after both known baseline ends. Their payloads match the
live baseline; A/shared controls remain live and shared-code expiry is unchanged.
The [RPC reference](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries)
permits this non-live representation. Remaining TTL zero is a different quantity
and is still live. No observation is inferred merely from a passing test or exit0.

Reproduce with `node scripts/reassess-expiry-capture.mjs` against each original
attempt. See [assessment conditions](../../W3-D18-03a-EXPIRY-REASSESSMENT.md).
The old strict verifier still reproduces the old `unverified` result by design.
Nothing was signed, sent, restored, bumped or recollected. No raw bundle was resealed.

These assessments await review/publication with the compatibility code; they do
not themselves mark Shared acceptance or all of W3 complete. Their SHA256SUMS
covers the three reports and this explanation, independently of the originals.
